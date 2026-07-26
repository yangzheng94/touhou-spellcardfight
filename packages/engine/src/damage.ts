import type { DamageMods, SideDamageConfig } from "./types.js";

export function newDamageMods(): DamageMods {
  return {
    adds: [],
    mults: [],
    set: null,
    immune: false,
    atLeast: null,
    atMost: null,
    reflect: false,
    reflectMult: 1,
  };
}

export function newSideDamageConfig(): SideDamageConfig {
  return {
    physical: newDamageMods(),
    spell: newDamageMods(),
    absorb: 0,
  };
}

export interface DamageResult {
  /** 目标最终受到的伤害。 */
  final: number;
  /** 反弹回来源的伤害（0 表示无反弹）。 */
  reflected: number;
}

/**
 * 结算一次伤害包经过目标修正后的结果。
 * 顺序：
 *   1. +X(加减) → *M(乘除) → =X(赋值)
 *   2. 免疫 > 至少/至多 > 反弹
 * 吸收护盾在外层 applyAbsorb 处理（先物理后法术）。
 *
 * @param raw 伤害基础值（已由效果层决定，如威力差 / 法术固定值）
 */
export function applyDamageMods(raw: number, mods: DamageMods): DamageResult {
  // 1. 计算顺序 +X → *M → =X
  let v = raw;
  for (const a of mods.adds) v += a;
  for (const m of mods.mults) v *= m;
  if (mods.set !== null) v = mods.set;
  v = Math.floor(v);
  if (v < 0) v = 0;

  // 2. 免疫 > 至少/至多 > 反弹
  if (mods.immune) {
    // 免疫：目标不受伤；若同时有反弹，则免疫的这份伤害被反弹给来源。
    if (mods.reflect) {
      return { final: 0, reflected: Math.floor(v * mods.reflectMult) };
    }
    return { final: 0, reflected: 0 };
  }

  // 至少 / 至多（在免疫之后、反弹之前）
  if (mods.atLeast !== null && v < mods.atLeast) v = mods.atLeast;
  if (mods.atMost !== null && v > mods.atMost) v = mods.atMost;

  // 反弹（无免疫时）：目标不受伤，改由来源承担
  if (mods.reflect) {
    return { final: 0, reflected: Math.floor(v * mods.reflectMult) };
  }

  return { final: v, reflected: 0 };
}

/**
 * 吸收护盾：先等量抵消物理伤害，再抵消法术伤害。
 * 返回抵消后的物理/法术伤害与剩余护盾。
 */
export function applyAbsorb(
  physical: number,
  spell: number,
  absorb: number,
): { physical: number; spell: number; absorbLeft: number } {
  let shield = absorb;
  let p = physical;
  let s = spell;
  const usedOnP = Math.min(shield, p);
  p -= usedOnP;
  shield -= usedOnP;
  const usedOnS = Math.min(shield, s);
  s -= usedOnS;
  shield -= usedOnS;
  return { physical: p, spell: s, absorbLeft: shield };
}
