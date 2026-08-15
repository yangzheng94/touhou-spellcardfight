import {
  availableCards,
  availableSkills,
  isSkillReady,
  playTurn,
  type DecisionRequest,
  type GameState,
  type PlayerId,
  other,
} from "../../engine/src/index.js";

/**
 * 困难人机 —— 最优解型 AI。
 *
 * 策略：对己方每个候选着法（符卡 × 技能组合 + 空过），
 * 用「对手最可能打出的几张牌」做 1 层前瞻，逐着在深拷贝的对局状态上真实结算，
 * 以最坏情况（保守）评估打分，选择得分最高的着法。
 *
 * 与简单（随机）/中等（静态启发式）不同，困难 AI 会真正推演结算，
 * 因此能识别斩杀、免疫、反伤、回血等交互，行为可复现（不依赖随机数）。
 */

export interface AIMove {
  cardId: string | null;
  skillIds: string[];
}

export interface HardAIOptions {
  /** 搜索时间预算（毫秒），超时则返回当前最优着法。 */
  timeBudgetMs?: number;
  /** 对手模型考虑的候选着法数量。 */
  foeCandidates?: number;
}

// ---------------------------------------------------------------------------
// 深拷贝对局状态
// ---------------------------------------------------------------------------

/**
 * 深拷贝对局状态供推演使用。
 * 注意：不能用 structuredClone —— 角色/符卡/技能/BUFF 的 script 是函数，
 * structuredClone 会抛 DataCloneError。角色静态数据（含 script 函数）直接共享引用
 * （结算过程中不会被修改），可变状态（HP/冷却/资源/标记/BUFF 等）逐层拷贝。
 */
function cloneGameState(s: GameState): GameState {
  return {
    turn: s.turn,
    players: {
      A: clonePlayer(s.players.A),
      B: clonePlayer(s.players.B),
    },
    rngState: s.rngState,
    hpHistory: s.hpHistory.map((h) => ({ A: h.A, B: h.B })),
    damageHistory: s.damageHistory.map((h) => ({
      A: { physical: h.A.physical, spell: h.A.spell, healed: h.A.healed },
      B: { physical: h.B.physical, spell: h.B.spell, healed: h.B.healed },
    })),
    stats: {
      maxCardPower: s.stats.maxCardPower,
      maxSpellDamage: s.stats.maxSpellDamage,
      totalHealBySide: { A: s.stats.totalHealBySide.A, B: s.stats.totalHealBySide.B },
    },
    log: [...s.log],
    winner: s.winner,
  };
}

function clonePlayer(p: GameState["players"]["A"]): GameState["players"]["A"] {
  return {
    id: p.id,
    // 角色静态数据（含 script 函数）共享引用，结算不修改它。
    character: p.character,
    hp: p.hp,
    maxHp: p.maxHp,
    usedCardIds: [...p.usedCardIds],
    skillLastUsedTurn: { ...p.skillLastUsedTurn },
    buffs: p.buffs.map((b) => ({ ...b })),
    resources: { ...p.resources },
    flags: { ...p.flags },
  };
}

// ---------------------------------------------------------------------------
// 局面评估
// ---------------------------------------------------------------------------

/** 对局面打分：数值越大对 me 越有利。 */
export function evaluate(state: GameState, me: PlayerId): number {
  if (state.winner) {
    if (state.winner === me) return 1_000_000;
    if (state.winner === "draw") return 0;
    return -1_000_000;
  }
  const foe = other(me);
  const p = state.players[me];
  const q = state.players[foe];
  const hpDiff = p.hp - q.hp;

  let score = 0;
  // 血量差（主要目标：领先并扩大优势）
  score += hpDiff * 6;
  // 自身绝对血量：活得久才能打后续回合
  score += p.hp * 1.2;
  // 对方血量：低血量意味着斩杀窗口
  score -= q.hp * 0.3;
  // 剩余符卡资源
  const myCards = p.character.cards.filter((c) => !p.usedCardIds.includes(c.id)).length;
  const foeCards = q.character.cards.filter((c) => !q.usedCardIds.includes(c.id)).length;
  score += (myCards - foeCards) * 1.5;
  // 技能可用性（冷却）
  const mySkills = p.character.skills.filter((s) => !s.passive && isSkillReady(state, me, s)).length;
  const foeSkills = q.character.skills.filter((s) => !s.passive && isSkillReady(state, foe, s)).length;
  score += (mySkills - foeSkills) * 0.8;
  // 我方 BUFF 多于对方（粗略：绝大多数 BUFF 是增益或对敌负面）
  score += (p.buffs.length - q.buffs.length) * 0.5;
  // 后期血量差权重更高（接近 10 回合结算）
  if (state.turn >= 8) score += hpDiff * 2;
  return score;
}

// ---------------------------------------------------------------------------
// 决策解析（可选效果 / 数值选择）
// ---------------------------------------------------------------------------

/**
 * 困难 AI 的可选效果策略：根据提示文本与当前局面给出合理选择。
 * 用于真实对局（room.aiDecide）与推演搜索（clone 上的 decide）。
 */
export function hardDecide(state: GameState, who: PlayerId, req: DecisionRequest): number {
  const foe = other(who);
  const me = state.players[who];
  const foeP = state.players[foe];
  const prompt = req.prompt;

  // 数值选择：提升威力/造成伤害一律取最大值
  if (req.range) return req.range.max;

  const opts = req.options ?? [];
  if (opts.length === 0) return 0;

  if (prompt.includes("扑克脸")) {
    // 忧=回复翻倍(0) 喜=物理翻倍(1) 怒=法术翻倍(2)：低血量求稳，否则选物理输出
    return me.hp <= me.maxHp * 0.5 ? 0 : 1;
  }
  if (prompt.includes("空想上的人格")) {
    // ["己方威力+1","对方威力+1","己方威力-1","对方威力-1"] → 己方威力+1
    return 0;
  }
  if (prompt.includes("哈德曼")) {
    // 帮对方选一张本回合必打的符卡 → 选对方可用牌中威力最低的
    const unused = foeP.character.cards.filter((c) => !foeP.usedCardIds.includes(c.id));
    let best = 0;
    let bestPower = Infinity;
    unused.forEach((c, i) => {
      if (c.power < bestPower) {
        bestPower = c.power;
        best = i;
      }
    });
    return best;
  }
  if (prompt.includes("被厌恶者的哲学")) {
    // [己方威力+diff, 对方威力-diff] → 己方提升
    return 0;
  }
  if (prompt.includes("晴岚的红眼")) {
    // ["立即触发","继续等待"] → 立即触发
    return 0;
  }
  if (prompt.includes("延后")) {
    // 是否延后效果 → 正常使用（不延后，避免不确定性）
    return 1;
  }
  if (prompt.includes("月狂爆破")) {
    // ["否","是"]：承受一半 HP 法术伤害使威力翻倍 → 血量健康才值得
    return me.hp >= me.maxHp * 0.6 ? 1 : 0;
  }
  if (prompt.includes("心灵烟花")) {
    // ["造成5点法术伤害","回复5点HP"]：能斩杀先斩杀，残血求稳
    if (foeP.hp <= 5) return 0;
    if (me.hp <= me.maxHp * 0.4) return 1;
    return 0;
  }
  if (prompt.includes("吸血鬼幻想")) {
    // ["威力+3并自受3法术","威力-3并对敌3法术"]：血量健康选择增威
    return me.hp >= me.maxHp * 0.6 ? 0 : 1;
  }
  if (prompt.includes("鬼形的乌合之众")) {
    // 双方变 1/3：己方血量劣势时重置战局
    return foeP.hp > me.hp ? 0 : 1;
  }
  if (prompt.includes("花开夜")) {
    // 触发延迟伤害 / 立即结算：能触发就触发
    return 0;
  }
  if (prompt.includes("杀人玩偶")) {
    // 保持物理伤害（避免被法术免疫针对时误转）
    return 0;
  }
  if (prompt.includes("银之跳跃")) {
    // 把对方符卡威力调低 → 选最小选项
    let best = 0;
    let v = Infinity;
    opts.forEach((o, i) => {
      const n = parseInt(o, 10);
      if (!Number.isNaN(n) && n < v) {
        v = n;
        best = i;
      }
    });
    return best;
  }
  if (prompt.includes("月神之钟")) {
    // ["法术伤害","物理伤害"]：多数角色对物理有更多抗性来源，默认法术
    return 0;
  }
  if (prompt.includes("孤影悄然")) {
    // ["回复2HP","产生1点法术伤害"]：残血回血，否则打伤害
    return me.hp <= me.maxHp * 0.5 ? 0 : 1;
  }
  if (prompt.includes("水色孪晶")) {
    // [造成diff法术, 回复diffHP]：残血回血，否则打伤害
    return me.hp <= me.maxHp * 0.5 ? 1 : 0;
  }
  if (prompt.includes("幻觉符卡")) {
    // 追加使用一张幻觉符卡 → 选威力最高的
    const all = me.character.cards;
    let best = 0;
    let bestPower = -1;
    opts.forEach((o, i) => {
      const c = all.find((x) => x.name === o);
      if (c && c.power > bestPower) {
        bestPower = c.power;
        best = i;
      }
    });
    return best;
  }
  if (prompt.includes("心绮楼演舞")) {
    // 消耗面具换护盾：护盾即时生效且次回合转为回复，全部消耗
    return opts.length - 1;
  }
  if (prompt.includes("三步必杀")) {
    // ["是","否"]：翻倍未击杀则死亡 → 对方血量很低时才赌
    return foeP.hp <= 10 ? 0 : 1;
  }
  // 默认第一项
  return 0;
}

// ---------------------------------------------------------------------------
// 候选着法生成
// ---------------------------------------------------------------------------

function skillVariants(state: GameState, who: PlayerId): string[][] {
  const skills = availableSkills(state, who);
  const variants: string[][] = [skills.map((s) => s.id), []];
  for (const s of skills) {
    variants.push(skills.filter((x) => x.id !== s.id).map((x) => x.id));
  }
  const seen = new Set<string>();
  const unique: string[][] = [];
  for (const v of variants) {
    const key = [...v].sort().join(",");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(v);
    }
  }
  return unique;
}

/** 生成某方本回合全部候选着法（符卡 × 技能组合 + 空过）。 */
export function candidateMoves(state: GameState, who: PlayerId): AIMove[] {
  const moves: AIMove[] = [];
  const cards = availableCards(state, who);
  const variants = skillVariants(state, who);
  for (const c of cards) {
    for (const skillIds of variants) {
      moves.push({ cardId: c.id, skillIds });
    }
  }
  moves.push({ cardId: null, skillIds: [] });
  return moves;
}

/** 静态启发式：快速评估某个着法的相对优劣（用于对手模型预筛，不推演）。 */
function heuristicMoveScore(state: GameState, who: PlayerId, mv: AIMove): number {
  if (!mv.cardId) return -5;
  const p = state.players[who];
  const foe = other(who);
  const card = p.character.cards.find((c) => c.id === mv.cardId);
  if (!card) return -100;
  const lowHp = p.hp <= Math.ceil(p.maxHp * 0.4);
  const foeThreat = state.players[foe].hp <= Math.ceil(state.players[foe].maxHp * 0.4);
  let score = card.power;
  if (card.tags.includes("immune") || card.tags.includes("reflect") || card.tags.includes("absorb")) {
    score += lowHp ? 12 : 4;
  }
  if (card.tags.includes("heal")) score += lowHp ? 10 : 3;
  if (card.tags.includes("negate-effect")) score += 4;
  if (card.tags.includes("spell-damage")) score += 3;
  if (card.tags.includes("manual")) score -= 6;
  if (foeThreat && card.power > 0) score += 2;
  // 宣告技能越多通常越有利（被动自动生效，这里只算主动技能）
  score += mv.skillIds.length * 0.5;
  return score;
}

/** 对手模型：预测对方最可能打出的若干着法（启发式预筛取前 N）。 */
export function predictedOpponentMoves(state: GameState, foe: PlayerId, n = 4): AIMove[] {
  const cards = availableCards(state, foe);
  const skills = availableSkills(state, foe);
  const variants: string[][] = [skills.map((s) => s.id), []];
  const moves: AIMove[] = [];
  for (const c of cards) {
    for (const skillIds of variants) {
      moves.push({ cardId: c.id, skillIds });
    }
  }
  moves.push({ cardId: null, skillIds: [] });
  moves.sort((a, b) => heuristicMoveScore(state, foe, b) - heuristicMoveScore(state, foe, a));
  return moves.slice(0, Math.max(1, n));
}

// ---------------------------------------------------------------------------
// 主搜索
// ---------------------------------------------------------------------------

/**
 * 为 me 选择本回合的最优着法。
 * 对每个候选着法，与对手模型的每个预测着法在克隆状态上真实结算一回合，
 * 取最坏情况得分，选择最坏情况下得分最高（保守最优）的着法。
 */
export async function chooseHardMove(
  state: GameState,
  me: PlayerId,
  opts: HardAIOptions = {},
): Promise<AIMove> {
  const deadline = Date.now() + (opts.timeBudgetMs ?? 800);
  const foeCandidates = predictedOpponentMoves(state, other(me), opts.foeCandidates ?? 4);
  const candidates = candidateMoves(state, me);

  let best: AIMove | null = null;
  let bestScore = -Infinity;
  for (const mv of candidates) {
    let worst = Infinity;
    let simulated = 0;
    for (const fmv of foeCandidates) {
      if (Date.now() > deadline && simulated > 0) break;
      const clone = cloneGameState(state);
      try {
        await playTurn(
          clone,
          me === "A" ? mv : fmv,
          me === "A" ? fmv : mv,
          (req) => hardDecide(clone, req.player, req),
        );
      } catch {
        // 非法/异常着法：视为极差
        worst = -Infinity;
        break;
      }
      const s = evaluate(clone, me);
      if (s < worst) worst = s;
      simulated++;
    }
    if (worst > bestScore) {
      bestScore = worst;
      best = mv;
    }
    if (Date.now() > deadline && best) break;
  }

  // 兜底：搜索未完成时用静态启发式（等同中等思路：宣告全部技能）
  if (!best) {
    const cards = availableCards(state, me);
    let cardId: string | null = null;
    if (cards.length > 0) {
      let bestCard = cards[0];
      let bestCardScore = -Infinity;
      for (const c of cards) {
        let s = c.power;
        if (c.tags.includes("spell-damage")) s += 3;
        if (c.tags.includes("heal")) s += 4;
        if (s > bestCardScore) {
          bestCardScore = s;
          bestCard = c;
        }
      }
      cardId = bestCard.id;
    }
    best = {
      cardId,
      skillIds: availableSkills(state, me).map((s) => s.id),
    };
  }
  return best;
}
