import type { Buff, EffectContext, EffectScript, PlayerId } from "./types.js";

/**
 * BUFF / 持续效果 / 专属资源 辅助库。
 *
 * BUFF 特点：
 * - 归属某方，带剩余回合数 / 剩余触发次数。
 * - 每回合作为不可被无效系影响的效果源参与结算（技能/历史遗留效果同理）。
 * - 由 resolver 的 tickBuffs 在回合末递减计时并移除到期项。
 */

export interface BuffSpec {
  id: string;
  name: string;
  owner: PlayerId;
  /** 生效回合数：-1 不按回合到期（靠触发次数）。 */
  turns?: number;
  /** 触发次数：-1 不限。 */
  triggers?: number;
  script: EffectScript;
  data?: Record<string, number>;
  /** 当回合立即生效（默认 false，下回合开始才触发）。 */
  activateOnCreate?: boolean;
}

/** 为某方添加一个 buff（若同 id 已存在则替换/刷新）。 */
export function addBuff(ec: EffectContext, spec: BuffSpec): void {
  const p = ec.ctx.state.players[spec.owner];
  const buff: Buff = {
    id: spec.id,
    name: spec.name,
    owner: spec.owner,
    createdTurn: ec.ctx.turn,
    remainingTurns: spec.turns ?? -1,
    remainingTriggers: spec.triggers ?? -1,
    script: spec.script,
    data: spec.data,
    activateOnCreate: spec.activateOnCreate ?? false,
  };
  const idx = p.buffs.findIndex((b) => b.id === spec.id);
  if (idx >= 0) p.buffs[idx] = buff;
  else p.buffs.push(buff);
}

/** 消耗一个 buff 的触发次数（触发生效时调用）。 */
export function consumeTrigger(ec: EffectContext, owner: PlayerId, buffId: string): void {
  const p = ec.ctx.state.players[owner];
  const b = p.buffs.find((x) => x.id === buffId);
  if (b && b.remainingTriggers > 0) b.remainingTriggers -= 1;
}

// ---------------------------------------------------------------------------
// 专属资源系统（奏数 / 面具 / 幻觉计数 / 魔虚罗 / 元素 等）
// ---------------------------------------------------------------------------

/** 读取资源值（默认 0）。 */
export function getRes(ec: EffectContext, who: PlayerId, key: string): number {
  return ec.ctx.state.players[who].resources[key] ?? 0;
}

/** 设置资源值。 */
export function setRes(ec: EffectContext, who: PlayerId, key: string, value: number): void {
  ec.ctx.state.players[who].resources[key] = value;
}

/** 资源增减（可 clamp）。 */
export function addRes(
  ec: EffectContext,
  who: PlayerId,
  key: string,
  delta: number,
  opts?: { min?: number; max?: number; wrap?: number },
): number {
  const cur = getRes(ec, who, key);
  let next = cur + delta;
  if (opts?.wrap !== undefined && next > opts.wrap) next = next - opts.wrap;
  if (opts?.min !== undefined) next = Math.max(opts.min, next);
  if (opts?.max !== undefined) next = Math.min(opts.max, next);
  setRes(ec, who, key, next);
  return next;
}

/** 读取离散标记。 */
export function getFlag(ec: EffectContext, who: PlayerId, key: string): string | number | boolean | undefined {
  return ec.ctx.state.players[who].flags[key];
}

/** 设置离散标记。 */
export function setFlag(
  ec: EffectContext,
  who: PlayerId,
  key: string,
  value: string | number | boolean,
): void {
  ec.ctx.state.players[who].flags[key] = value;
}
