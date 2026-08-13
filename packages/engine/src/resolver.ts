import type {
  Buff,
  BuffCategory,
  Card,
  DamageType,
  EffectContext,
  EffectScript,
  GameState,
  LogEntry,
  PendingDamage,
  Phase,
  PlayerId,
  Skill,
  TurnContext,
} from "./types.js";
import { other } from "./types.js";
import { newPowerCalc, resolvePower } from "./power.js";
import {
  applyAbsorb,
  applyDamageMods,
  newSideDamageConfig,
} from "./damage.js";
import { computePriorityOrder } from "./priority.js";
import { restoreRng } from "./rng.js";
import { pushHpSnapshot } from "./state.js";

/** 一方本回合的选择：一张符卡 + 宣告的技能。 */
export interface TurnChoice {
  card: Card | null;
  skills: Skill[];
}

export interface DecisionResolver {
  (req: {
    player: PlayerId;
    prompt: string;
    options: string[];
    range?: { min: number; max: number };
  }): number | Promise<number>;
}

/** 一个「效果源」：符卡 / 技能 / buff。 */
interface EffectSource {
  owner: PlayerId;
  script: EffectScript;
  /** 可被无效系影响（符卡效果）。技能与 buff 为 false。 */
  negatable: boolean;
  kind: "card" | "skill" | "buff";
}

/**
 * 结算一个回合。假定双方选择已揭示（同时隐藏出牌在服务器层完成）。
 * 直接修改传入的 state。
 */
export async function resolveTurn(
  state: GameState,
  choiceA: TurnChoice,
  choiceB: TurnChoice,
  decide: DecisionResolver = defaultDecide,
): Promise<GameState> {
  state.turn += 1;
  const turn = state.turn;
  const rng = restoreRng(state.rngState);

  const log = (phase: Phase | undefined, msg: string, data?: Record<string, unknown>, type?: LogEntry["type"]) => {
    state.log.push({ turn, phase, msg, data, type });
  };

  const cards: Record<PlayerId, Card | null> = {
    A: choiceA.card,
    B: choiceB.card,
  };
  const activeSkills: Record<PlayerId, Skill[]> = {
    A: choiceA.skills,
    B: choiceB.skills,
  };

  const ctx: TurnContext = {
    state,
    turn,
    cards,
    activeSkills,
    power: { A: newPowerCalc(cards.A?.power ?? 0), B: newPowerCalc(cards.B?.power ?? 0) },
    damageConfig: { A: newSideDamageConfig(), B: newSideDamageConfig() },
    effectNegated: { A: false, B: false },
    castNegated: { A: false, B: false },
    powerIgnored: { A: false, B: false },
    hpLocked: { A: false, B: false },
    pending: [],
    dealt: { A: { physical: 0, spell: 0 }, B: { physical: 0, spell: 0 } },
    healed: { A: 0, B: 0 },
    clashDamage: null,
    repeatClash: false,
    rng,
    log: (e) => state.log.push({ turn, ...e }),
    decide,
  };

  // 标记已使用的符卡（一次性）。
  for (const p of ["A", "B"] as PlayerId[]) {
    const c = cards[p];
    if (c) {
      state.players[p].usedCardIds.push(c.id);
      state.stats.maxCardPower = Math.max(state.stats.maxCardPower, c.power);
    }
    // 记录本回合宣告的（非被动）技能，用于冷却。
    for (const s of activeSkills[p]) {
      if (!s.passive) state.players[p].skillLastUsedTurn[s.id] = turn;
    }
  }

  // 记录本回合双方打出的符卡与主动宣告的技能（含效果文本）。
  for (const p of ["A", "B"] as PlayerId[]) {
    const c = cards[p];
    const declared = activeSkills[p].filter((s) => !s.passive);
    const charName = state.players[p].character.name;
    if (c) {
      log("turnStart", `${charName}（${p}）打出符卡：${c.name}｜效果：${c.text}`, { cardId: c.id }, "info");
    } else {
      log("turnStart", `${charName}（${p}）打出符卡：无`, undefined, "info");
    }
    if (declared.length > 0) {
      for (const s of declared) {
        log("turnStart", `${charName}（${p}）宣告技能：${s.name}｜效果：${s.text}`, { skillId: s.id }, "info");
      }
    } else {
      log("turnStart", `${charName}（${p}）宣告技能：无`, undefined, "info");
    }
  }

  // ---- 优先级裁定：先算处理顺序，随后 priority 阶段应用无效/反转 ----
  const prio = computePriorityOrder(cards.A, cards.B, rng);
  const order = prio.order;

  // 收集效果源（buff / 技能 不可被无效；符卡可被无效）。
  // 过滤掉本回合新创建且无 activateOnCreate 的 buff，实现「从下回合开始生效」
  const collectSources = (): EffectSource[] => {
    const sources: EffectSource[] = [];
    for (const p of order) {
      for (const b of state.players[p].buffs) {
        if (b.createdTurn === turn && !b.activateOnCreate) continue;
        sources.push({ owner: p, script: b.script, negatable: false, kind: "buff" });
      }
      for (const s of activeSkills[p]) {
        // 检查技能是否被无效化（想起【心身的舞台】）
        const skillsNegated = state.players[p].flags["_skills_negated_turn"] === turn;
        if (!skillsNegated) {
          sources.push({ owner: p, script: s.script, negatable: false, kind: "skill" });
        }
      }
    }
    return sources;
  };

  const cardSource = (p: PlayerId): EffectSource | null => {
    const c = ctx.cards[p];
    if (!c) return null;
    return { owner: p, script: c.script, negatable: true, kind: "card" };
  };

  const ecFor = (owner: PlayerId): EffectContext => ({
    ctx,
    self: owner,
    foe: other(owner),
  });

  /** 创建 EffectContext，支持负面效果转移（当日截稿）和作用对象反转。
   *  @param isCardEffect 是否为符卡效果（用于作用对象反转判断）
   */
  const ecForWithTransfer = (owner: PlayerId, isCardEffect = false): EffectContext => {
    const base = ecFor(owner);
    // 作用对象反转：若对方被标记了_effect_reversed，则对方符卡的效果目标反转
    if (isCardEffect && ctx.state.players[owner].flags["_effect_reversed"]) {
      return { ctx, self: other(owner), foe: owner };
    }
    // 当日截稿：己方符卡产生的负面 BUFF 转移给对方。
    // 这里不交换 self/foe（避免把正面伤害也反转），只给 EffectContext 打上标记，
    // 由 addBuff 在创建 self 类 BUFF 时把 owner 改为 foe。
    const transferActive = isCardEffect && ctx.state.players[owner].flags["transfer_negative"] === true;
    return { ...base, transferActive };
  };

  const runPhase = async (phase: Phase, sources: EffectSource[]) => {
    for (const src of sources) {
      // 诅咒之王：符卡效果不会被无效化
      const curseKing = src.kind === "card" && ctx.state.players[src.owner].flags["_curse_king"] === true;
      // turnEnd阶段不受否定影响（彼岸剑的重复对抗等需要正常生效）
      if (phase !== "turnEnd") {
        if (src.negatable && ctx.effectNegated[src.owner]) {
          // 狂气之瞳：若本回合使用符卡能力不会被无效
          const uninterruptable = ctx.state.players[src.owner].flags["ability_uninterruptable"] === true;
          if (!uninterruptable && !curseKing) continue;
        }
        if (src.kind === "card" && ctx.castNegated[src.owner] && !curseKing) continue;
      }
      const handler = src.script[phase];
      if (handler) await handler(ecForWithTransfer(src.owner, src.kind === "card"));
    }
  };

  const withCards = (): EffectSource[] => {
    // 动态收集所有 buff（包括在回合中添加的新 buff）
    const arr = collectSources();
    for (const p of order) {
      const cs = cardSource(p);
      if (cs) arr.push(cs);
    }
    return arr;
  };

  // 1. turnStart —— buff / 技能 / 符卡
  await runPhase("turnStart", withCards());
  resolvePendingWaves(ctx, state, log);

  // turnStart 结束后列出当前生效的 BUFF 与生效顺序（包含本回合 activateOnCreate 的 buff）。
  logActiveBuffs(state, turn, order, log);
  log("priority", `优先级顺序: ${prio.order.join(" → ")}（先攻 ${prio.firstMover}）`, undefined, "info");

  // 2. priority —— 仅处理无效/反转类（这些效果在其 script 的 priority 阶段实现）
  await runPhase("priority", withCards());

  // 3. power —— 威力计算
  await runPhase("power", withCards());
  let powerA = resolvePower(ctx.power.A);
  let powerB = resolvePower(ctx.power.B);
  // 威力无视：被标记方的符卡威力视为0（技能加成保留，此处仅对抗用）
  if (ctx.powerIgnored.A) {
    powerA = 0;
  }
  if (ctx.powerIgnored.B) {
    powerB = 0;
  }
  log("power", `威力 A=${powerA} B=${powerB}`);

  // 4. clash —— 威力对抗生成物理伤害
  if (powerA > powerB) {
    const amount = powerA - powerB;
    ctx.pending.push({ type: "physical", amount, source: "A", target: "B" });
    ctx.clashDamage = { source: "A", target: "B", amount };
  } else if (powerB > powerA) {
    const amount = powerB - powerA;
    ctx.pending.push({ type: "physical", amount, source: "B", target: "A" });
    ctx.clashDamage = { source: "B", target: "A", amount };
  }
  await runPhase("clash", withCards());

  // 5. damage —— 配置免疫/反弹/吸收/增减，并排队法术伤害
  await runPhase("damage", withCards());

  // 6. 结算 pending（分波，支持「造成伤害后追加」）
  resolvePendingWaves(ctx, state, log);
  if (state.winner) {
    state.rngState = rng.getState();
    return state;
  }

  // 7. apply —— 伤害结算后的追加触发（半人半灵等）
  await runPhase("apply", withCards());
  resolvePendingWaves(ctx, state, log);
  if (state.winner) {
    state.rngState = rng.getState();
    return state;
  }

  // 8. turnEnd
  await runPhase("turnEnd", withCards());
  resolvePendingWaves(ctx, state, log);
  if (state.winner) {
    state.rngState = rng.getState();
    return state;
  }

  // 彼岸剑：回合结束时可令本回合对抗重复一次（仅重复威力对抗产生的物理伤害）。
  if (ctx.repeatClash && ctx.clashDamage) {
    const cd = ctx.clashDamage;
    log("turnEnd", `重复本回合对抗：${cd.source} 对 ${cd.target} 再造成 ${cd.amount} 物理`);
    ctx.pending.push({ type: "physical", amount: cd.amount, source: cd.source, target: cd.target });
    resolvePendingWaves(ctx, state, log);
    if (state.winner) {
      state.rngState = rng.getState();
      return state;
    }
  }

  // 9. 收尾：buff 计时、快照、胜负
  tickBuffs(state, turn);
  state.damageHistory.push({
    A: { physical: ctx.dealt.A.physical, spell: ctx.dealt.A.spell, healed: ctx.healed.A },
    B: { physical: ctx.dealt.B.physical, spell: ctx.dealt.B.spell, healed: ctx.healed.B },
  });
  pushHpSnapshot(state);

  // 清除负面效果转移标志（当日截稿）
  state.players.A.flags["transfer_negative"] = false;
  state.players.B.flags["transfer_negative"] = false;

  // 清除获知相关标志：foresight 需要跨回合保留（宣告当回合设置、下一回合提交阶段由服务器消费），
  // 因此回合结束时只复位 _foresight_triggered（“本次已消费”标记），不删除 foresight 本身。
  state.players.A.flags["_foresight_triggered"] = false;
  state.players.B.flags["_foresight_triggered"] = false;

  state.rngState = rng.getState();
  checkWin(state);

  // 10 回合限制：仍未分出胜负时，血量高的一方获胜。
  if (!state.winner && state.turn >= 10) {
    const hpA = state.players.A.hp;
    const hpB = state.players.B.hp;
    if (hpA > hpB) {
      state.winner = "A";
      log("apply", `第 ${state.turn} 回合结束，双方仍未分出胜负，A 血量更高（${hpA} > ${hpB}）获胜`, undefined, "info");
    } else if (hpB > hpA) {
      state.winner = "B";
      log("apply", `第 ${state.turn} 回合结束，双方仍未分出胜负，B 血量更高（${hpB} > ${hpA}）获胜`, undefined, "info");
    } else {
      state.winner = "draw";
      log("apply", `第 ${state.turn} 回合结束，双方仍未分出胜负且血量相同（${hpA}），平局`, undefined, "info");
    }
  }

  return state;
}

/**
 * 结算排队的伤害/回复/流失。分「波」处理：一波结算完可能触发新的 pending。
 */
function resolvePendingWaves(
  ctx: TurnContext,
  state: GameState,
  log: (phase: Phase | undefined, msg: string, data?: Record<string, unknown>, type?: LogEntry["type"]) => void,
): void {
  let guard = 0;
  while (ctx.pending.length > 0 && guard < 20) {
    guard++;
    const wave = ctx.pending;
    ctx.pending = [];
    applyDamageWave(ctx, state, wave, log);
    checkWin(state);
    if (state.winner) break;
  }
}

function applyDamageWave(
  ctx: TurnContext,
  state: GameState,
  wave: PendingDamage[],
  log: (phase: Phase | undefined, msg: string, data?: Record<string, unknown>, type?: LogEntry["type"]) => void,
): void {
  const charName = (p: PlayerId) => state.players[p].character.name;

  for (const pd of wave) {
    if (pd.isHeal) {
      if (ctx.hpLocked[pd.target]) {
        log("apply", `${charName(pd.target)}（${pd.target}）HP 锁定，回复 ${pd.amount} 无效`, undefined, "hp");
        continue;
      }
      const p = state.players[pd.target];
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + pd.amount);
      const healed = p.hp - before;
      state.stats.totalHealBySide[pd.target] += healed;
      ctx.healed[pd.target] += healed;
      if (healed > 0) log("apply", `${charName(pd.target)}（${pd.target}）回复 ${healed} HP → ${p.hp}`, undefined, "hp");
    } else if (pd.isDrain) {
      if (ctx.hpLocked[pd.target]) {
        log("apply", `${charName(pd.target)}（${pd.target}）HP 锁定，生命流失 ${pd.amount} 被阻止`, undefined, "hp");
        continue;
      }
      const p = state.players[pd.target];
      p.hp = Math.max(0, p.hp - pd.amount);
      log("apply", `${charName(pd.target)}（${pd.target}）生命流失 ${pd.amount} → ${p.hp}`, undefined, "hp");
    }
  }

  // 伤害包：按目标聚合物理/法术，套用修正与吸收。
  const damagePackets = wave.filter((pd) => !pd.isHeal && !pd.isDrain);
  const perTarget: Record<PlayerId, { physical: number; spell: number }> = {
    A: { physical: 0, spell: 0 },
    B: { physical: 0, spell: 0 },
  };
  const reflectBack: Record<PlayerId, { physical: number; spell: number }> = {
    A: { physical: 0, spell: 0 },
    B: { physical: 0, spell: 0 },
  };
  const damageDetails: Record<PlayerId, { physical: number; spell: number; negated: number; absorbed: number; reflected: number }> = {
    A: { physical: 0, spell: 0, negated: 0, absorbed: 0, reflected: 0 },
    B: { physical: 0, spell: 0, negated: 0, absorbed: 0, reflected: 0 },
  };

  for (const pd of damagePackets) {
    const mods = ctx.damageConfig[pd.target][pd.type];
    const res = applyDamageMods(pd.amount, mods);
    perTarget[pd.target][pd.type] += res.final;
    damageDetails[pd.target][pd.type] += pd.amount; // 记录原始伤害
    if (res.reflected > 0) {
      reflectBack[pd.source][pd.type] += res.reflected;
      damageDetails[pd.target].reflected += res.reflected;
    }
    const negated = pd.amount - res.final - res.reflected;
    if (negated > 0) damageDetails[pd.target].negated += negated;
  }

  // 吸收：先物理后法术。
  for (const t of ["A", "B"] as PlayerId[]) {
    const cfg = ctx.damageConfig[t];
    const beforeP = perTarget[t].physical;
    const beforeS = perTarget[t].spell;
    const absorbed = applyAbsorb(perTarget[t].physical, perTarget[t].spell, cfg.absorb);
    const totalAbsorbed = (beforeP - absorbed.physical) + (beforeS - absorbed.spell);
    if (totalAbsorbed > 0) damageDetails[t].absorbed += totalAbsorbed;
    perTarget[t].physical = absorbed.physical;
    perTarget[t].spell = absorbed.spell;
    cfg.absorb = absorbed.absorbLeft;
  }

  // 回合总伤害上限（琪露诺·湖之妖精 / 霜符【冰袭方阵】）：在吸收后、扣血前应用。
  for (const t of ["A", "B"] as PlayerId[]) {
    const cfg = ctx.damageConfig[t];
    if (cfg.totalAtMost !== null) {
      const waveTotal = perTarget[t].physical + perTarget[t].spell;
      if (waveTotal > cfg.totalAtMost) {
        const ratio = cfg.totalAtMost / waveTotal;
        perTarget[t].physical = Math.floor(perTarget[t].physical * ratio);
        perTarget[t].spell = cfg.totalAtMost - perTarget[t].physical;
        damageDetails[t].negated += waveTotal - cfg.totalAtMost;
      }
      cfg.totalAtMost = Math.max(0, cfg.totalAtMost - (perTarget[t].physical + perTarget[t].spell));
    }
  }

  // 应用到 HP，并记录已造成伤害。
  const applyTo = (t: PlayerId, source: PlayerId) => {
    const dmg = perTarget[t];
    const details = damageDetails[t];
    const total = dmg.physical + dmg.spell;
    const rawTotal = details.physical + details.spell;
    
    if (ctx.hpLocked[t]) {
      if (rawTotal > 0) {
        log("apply", `${charName(t)}（${t}）HP 锁定，所有伤害（${rawTotal}）无效`, undefined, "info");
      }
      return;
    }
    
    const p = state.players[t];
    const before = p.hp;
    
    if (total > 0) {
      if (dmg.physical > 0) {
        log("apply", `${charName(t)}（${t}）受到 ${dmg.physical} 物理伤害（来自 ${charName(source)}）`, undefined, "physical");
      }
      if (dmg.spell > 0) {
        log("apply", `${charName(t)}（${t}）受到 ${dmg.spell} 法术伤害（来自 ${charName(source)}）`, undefined, "spell");
      }
      p.hp = Math.max(0, p.hp - total);
      ctx.dealt[t].physical += dmg.physical;
      ctx.dealt[t].spell += dmg.spell;
      if (dmg.spell > 0) state.stats.maxSpellDamage = Math.max(state.stats.maxSpellDamage, dmg.spell);
      
      let msg = `${charName(t)}（${t}）HP ${before} → ${p.hp}`;
      if (details.negated > 0) msg += `（免疫/减伤抵消 ${details.negated}）`;
      if (details.absorbed > 0) msg += `（护盾吸收 ${details.absorbed}）`;
      if (details.reflected > 0) msg += `（反弹 ${details.reflected}）`;
      log("apply", msg, undefined, "hp");
    } else if (rawTotal > 0) {
      let msg = `${charName(t)}（${t}）受到的伤害被完全抵消：`;
      const parts: string[] = [];
      if (details.negated > 0) parts.push(`免疫/减伤 ${details.negated}`);
      if (details.absorbed > 0) parts.push(`护盾吸收 ${details.absorbed}`);
      if (details.reflected > 0) parts.push(`反弹 ${details.reflected}`);
      msg += parts.join(" + ");
      log("apply", msg, undefined, "info");
    }
  };
  applyTo("A", "B");
  applyTo("B", "A");

  // 反弹：直接作用于来源 HP（不再二次修正，避免循环）。
  for (const s of ["A", "B"] as PlayerId[]) {
    const rb = reflectBack[s];
    const total = rb.physical + rb.spell;
    if (total <= 0) continue;
    if (ctx.hpLocked[s]) {
      log("apply", `${charName(s)}（${s}）HP 锁定，反弹伤害 ${total} 无效`, undefined, "info");
      continue;
    }
    const p = state.players[s];
    const before = p.hp;
    p.hp = Math.max(0, p.hp - total);
    if (rb.physical > 0) log("apply", `${charName(s)}（${s}）受到反弹物理伤害 ${rb.physical}`, undefined, "physical");
    if (rb.spell > 0) log("apply", `${charName(s)}（${s}）受到反弹法术伤害 ${rb.spell}`, undefined, "spell");
    log("apply", `${charName(s)}（${s}）HP ${before} → ${p.hp}`, undefined, "hp");
  }
}

const categoryLabel: Record<BuffCategory, string> = {
  power: "威力",
  "damage-taken": "承伤",
  negate: "无效",
  reverse: "反转",
  "immune-reflect-absorb": "免疫/反弹/吸收",
  "delayed-damage": "延迟伤害",
  heal: "回复",
  "hp-lock": "HP锁定",
  other: "其他",
};

function formatBuffRemaining(b: Buff): string {
  const turnPart = b.remainingTurns >= 0 ? `${b.remainingTurns} 回合` : "";
  const trigPart = b.remainingTriggers >= 0 ? `${b.remainingTriggers} 次` : "";
  if (!turnPart && !trigPart) return "永续";
  return [turnPart, trigPart].filter(Boolean).join(" / ");
}

function logActiveBuffs(
  state: GameState,
  turn: number,
  order: PlayerId[],
  log: (phase: Phase | undefined, msg: string, data?: Record<string, unknown>, type?: LogEntry["type"]) => void,
): void {
  let anyBuff = false;
  for (const p of order) {
    const active = state.players[p].buffs.filter(
      (b) => !(b.createdTurn === turn && !b.activateOnCreate),
    );
    const name = state.players[p].character.name;
    if (active.length === 0) {
      log("turnStart", `${name}（${p}）当前生效 BUFF：无`, undefined, "info");
      continue;
    }
    anyBuff = true;
    log("turnStart", `${name}（${p}）当前生效 BUFF（共 ${active.length} 个）：`, undefined, "info");
    for (const b of active) {
      const cat = b.category ?? "other";
      const desc = b.text ?? b.name;
      const remain = formatBuffRemaining(b);
      log(
        "turnStart",
        `  [${categoryLabel[cat]}] ${b.name}：${desc}（${remain}）`,
        { player: p, buffId: b.id, category: cat },
        "buff",
      );
    }
  }
  if (anyBuff) {
    log(
      "turnStart",
      `BUFF/技能生效顺序：先处理 ${order[0]}，再处理 ${order[1]}；同玩家按上表从上至下`,
      undefined,
      "info",
    );
  }
}

/** 回合末更新 buff 计时，移除到期 buff。 */
function tickBuffs(state: GameState, turn: number): void {
  for (const p of ["A", "B"] as PlayerId[]) {
    const kept: Buff[] = [];
    for (const b of state.players[p].buffs) {
      // 创建当回合不计时（实现「从下回合开始」）。
      if (b.createdTurn !== turn && b.remainingTurns > 0) b.remainingTurns -= 1;
      const expiredByTurns = b.remainingTurns === 0;
      const expiredByTriggers = b.remainingTriggers === 0;
      if (!expiredByTurns && !expiredByTriggers) kept.push(b);
    }
    state.players[p].buffs = kept;
  }
}

/** 胜负判定。 */
function checkWin(state: GameState): void {
  const aDead = state.players.A.hp <= 0;
  const bDead = state.players.B.hp <= 0;
  if (aDead && bDead) state.winner = "draw";
  else if (aDead) state.winner = "B";
  else if (bDead) state.winner = "A";
}

/** 默认决策器：可选效果一律选第一项 / 取范围最大值（服务器/AI 可覆盖）。 */
const defaultDecide: DecisionResolver = (req) => {
  if (req.range) return req.range.max;
  return 0;
};

export { defaultDecide };
export type { DamageType };
