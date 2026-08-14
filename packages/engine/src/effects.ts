import type { DamageType, EffectContext, PlayerId } from "./types.js";

/**
 * 原子效果库 —— 符卡/技能脚本通过组合这些原语表达效果。
 * 每个原语操作 EffectContext（ec.ctx 为回合上下文，ec.self / ec.foe 为双方）。
 */

// ---- 威力 ----

/** 己方威力 +X（可为负）。 */
export function addPower(ec: EffectContext, delta: number, who: PlayerId = ec.self): void {
  ec.ctx.power[who].adds.push(delta);
}

/** 己方威力 ×M（翻倍=2，减半=0.5）。 */
export function multPower(ec: EffectContext, m: number, who: PlayerId = ec.self): void {
  ec.ctx.power[who].mults.push(m);
}

/** 己方威力变为 X。 */
export function setPower(ec: EffectContext, v: number, who: PlayerId = ec.self): void {
  ec.ctx.power[who].set = v;
}

// ---- 伤害配置（承受方修正） ----

/** 使某方免疫某类型伤害。 */
export function immune(ec: EffectContext, who: PlayerId, type: DamageType | "all"): void {
  if (type === "all" || type === "physical") ec.ctx.damageConfig[who].physical.immune = true;
  if (type === "all" || type === "spell") ec.ctx.damageConfig[who].spell.immune = true;
}

/** 使某方反弹某类型伤害（可带倍率）。 */
export function reflect(
  ec: EffectContext,
  who: PlayerId,
  type: DamageType | "all",
  mult = 1,
): void {
  const set = (t: DamageType) => {
    ec.ctx.damageConfig[who][t].reflect = true;
    ec.ctx.damageConfig[who][t].reflectMult = mult;
  };
  if (type === "all" || type === "physical") set("physical");
  if (type === "all" || type === "spell") set("spell");
}

/** 免疫并反弹（如空观剑双倍反还）。 */
export function immuneAndReflect(
  ec: EffectContext,
  who: PlayerId,
  type: DamageType | "all",
  mult = 1,
): void {
  immune(ec, who, type);
  reflect(ec, who, type, mult);
}

/** 某方吸收护盾 +X（先抵物理后抵法术）。 */
export function addAbsorb(ec: EffectContext, who: PlayerId, amount: number): void {
  ec.ctx.damageConfig[who].absorb += amount;
}

/** 某方某类型受到伤害 +X。 */
export function addTakenDamage(
  ec: EffectContext,
  who: PlayerId,
  type: DamageType,
  delta: number,
): void {
  ec.ctx.damageConfig[who][type].adds.push(delta);
}

/** 某方某类型受到伤害 ×M。 */
export function multTakenDamage(
  ec: EffectContext,
  who: PlayerId,
  type: DamageType,
  m: number,
): void {
  ec.ctx.damageConfig[who][type].mults.push(m);
}

// ---- 伤害/回复/流失（排队指令） ----

/** 产生一次法术伤害（自 self → foe，默认）。 */
export function dealSpell(
  ec: EffectContext,
  amount: number,
  target: PlayerId = ec.foe,
  source: PlayerId = ec.self,
  opts?: { noBoost?: boolean },
): void {
  if (amount <= 0) return;
  ec.ctx.pending.push({ type: "spell", amount, source, target, noBoost: opts?.noBoost });
}

/** 产生一次物理伤害。 */
export function dealPhysical(
  ec: EffectContext,
  amount: number,
  target: PlayerId = ec.foe,
  source: PlayerId = ec.self,
  opts?: { noBoost?: boolean },
): void {
  if (amount <= 0) return;
  ec.ctx.pending.push({ type: "physical", amount, source, target, noBoost: opts?.noBoost });
}

/** 生命流失（绕过免疫/反弹，可被固定HP挡）。 */
export function drainLife(
  ec: EffectContext,
  amount: number,
  target: PlayerId = ec.foe,
  source: PlayerId = ec.self,
): void {
  if (amount <= 0) return;
  ec.ctx.pending.push({ type: "spell", amount, source, target, isDrain: true });
}

/** 回复生命。 */
export function heal(ec: EffectContext, amount: number, who: PlayerId = ec.self): void {
  if (amount <= 0) return;
  ec.ctx.pending.push({ type: "spell", amount, source: who, target: who, isHeal: true });
}

// ---- 无效 / 反转 / 固定HP ----

/** 使对方符卡效果无效。 */
export function negateEffect(ec: EffectContext, who: PlayerId = ec.foe): void {
  ec.ctx.effectNegated[who] = true;
}

/** 使对方本回合无法打出符卡（发动无效）。 */
export function negateCast(ec: EffectContext, who: PlayerId = ec.foe): void {
  ec.ctx.castNegated[who] = true;
}

/** 无视对方符卡威力（本回合威力对抗时视为0，不影响技能）。 */
export function ignorePower(ec: EffectContext, who: PlayerId = ec.foe): void {
  ec.ctx.powerIgnored[who] = true;
}

/** 固定某方 HP（本回合不会改变，可挡流失）。 */
export function lockHp(ec: EffectContext, who: PlayerId = ec.self): void {
  ec.ctx.hpLocked[who] = true;
}

// ---- 直接 HP 操作（非伤害；用于快照/减半/赋值类效果） ----

/** 直接将某方 HP 设为指定值（不超过 maxHp，不低于 0），受 hpLocked 影响。 */
export function setHp(ec: EffectContext, who: PlayerId, value: number): void {
  if (ec.ctx.hpLocked[who]) return;
  const p = ec.ctx.state.players[who];
  p.hp = Math.max(0, Math.min(p.maxHp, Math.floor(value)));
}

/** 直接调整某方 HP（正为回复上限 maxHp，负为流失，可为 0 下限），受 hpLocked 影响。 */
export function adjustHp(ec: EffectContext, who: PlayerId, delta: number): void {
  if (ec.ctx.hpLocked[who]) return;
  const p = ec.ctx.state.players[who];
  p.hp = Math.max(0, Math.min(p.maxHp, p.hp + Math.floor(delta)));
}

/** 请求在回合末重复一次本回合威力对抗（彼岸剑）。 */
export function requestRepeatClash(ec: EffectContext): void {
  ec.ctx.repeatClash = true;
}

/** 读取某方当前 HP。 */
export function hpOf(ec: EffectContext, who: PlayerId): number {
  return ec.ctx.state.players[who].hp;
}

/** 读取本回合某方符卡的基础威力（未经计算）。 */
export function cardPowerOf(ec: EffectContext, who: PlayerId): number {
  return ec.ctx.cards[who]?.power ?? 0;
}

/** 请求玩家决策。返回选项索引（0-based）或范围内的数值。支持同步或异步返回。 */
export async function requestDecision(
  ec: EffectContext,
  player: PlayerId,
  prompt: string,
  options: string[],
  range?: { min: number; max: number },
): Promise<number> {
  const result = ec.ctx.decide({ player, prompt, options, range });
  return await result;
}

// ---- 负面效果转移（当日截稿） ----

/** 转移负面效果：将己方符卡产生的负面效果目标改为对方。
 *  这需要在效果执行前调用，修改后续效果的目标。
 */
export function transferNegativeEffects(ec: EffectContext, who: PlayerId = ec.self): void {
  // 设置标志，让 engine 在应用效果时转移目标
  ec.ctx.state.players[who].flags["transfer_negative"] = true;
}