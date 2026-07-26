import type { PowerCalc } from "./types.js";

/** 创建一个威力累加器。 */
export function newPowerCalc(base: number): PowerCalc {
  return { base, adds: [], mults: [], set: null };
}

/**
 * 结算威力：顺序 +X(加减) → *M(乘除) → =X(赋值)。
 * 小数一律向下取整。威力不为负。
 */
export function resolvePower(pc: PowerCalc): number {
  if (pc.set !== null) {
    // 赋值优先级最高、最后生效；但赋值本身之后不再叠加（简化：赋值即最终值）。
    // 若同时存在赋值与其后加减，规则未定义此组合，采用「赋值为最终值」。
    return Math.max(0, Math.floor(pc.set));
  }
  let v = pc.base;
  for (const a of pc.adds) v += a;
  for (const m of pc.mults) v *= m;
  v = Math.floor(v);
  return Math.max(0, v);
}
