import type { Rng } from "./types.js";

/**
 * Mulberry32 —— 简单、快速、可复现的种子化 PRNG。
 * 服务器权威使用；快照只需保存 32 位状态。
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    d(n: number): number {
      if (n <= 0) return 0;
      return Math.floor(next() * n) + 1;
    },
    getState() {
      return state >>> 0;
    },
  };
}

/** 从已保存的状态恢复 RNG。 */
export function restoreRng(state: number): Rng {
  return createRng(state);
}
