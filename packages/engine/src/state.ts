import type { Character, GameState, PlayerId, PlayerState } from "./types.js";
import { createRng } from "./rng.js";

export function createPlayerState(id: PlayerId, character: Character): PlayerState {
  return {
    id,
    character,
    hp: character.hp,
    maxHp: character.hp,
    usedCardIds: [],
    skillLastUsedTurn: {},
    buffs: [],
    resources: {},
    flags: {},
  };
}

export function createGameState(
  charA: Character,
  charB: Character,
  seed: number,
): GameState {
  const rng = createRng(seed);
  return {
    turn: 0,
    players: {
      A: createPlayerState("A", charA),
      B: createPlayerState("B", charB),
    },
    rngState: rng.getState(),
    hpHistory: [{ A: charA.hp, B: charB.hp }],
    damageHistory: [],
    stats: {
      maxCardPower: 0,
      maxSpellDamage: 0,
      totalHealBySide: { A: 0, B: 0 },
    },
    log: [],
    winner: null,
  };
}

/** 深拷贝对局状态（供「重复对抗」等需要回滚/推演的效果）。 */
export function cloneGameState(s: GameState): GameState {
  return structuredClone(s);
}

/** 记录本回合末 HP 快照。 */
export function pushHpSnapshot(s: GameState): void {
  s.hpHistory.push({ A: s.players.A.hp, B: s.players.B.hp });
}

/** 取 N 回合之前的某方 HP（n=0 为当前记录的最新末值）。 */
export function hpTurnsAgo(s: GameState, who: PlayerId, n: number): number {
  const idx = s.hpHistory.length - 1 - n;
  if (idx < 0) return s.hpHistory[0][who];
  return s.hpHistory[idx][who];
}

/** 取上 N 回合某方所受伤害总量（物理+法术）。n=1 表示上一回合。返回 0 表示无记录。 */
export function damageTakenTurnsAgo(s: GameState, who: PlayerId, n: number): number {
  const idx = s.damageHistory.length - n;
  if (idx < 0 || idx >= s.damageHistory.length) return 0;
  const rec = s.damageHistory[idx][who];
  return rec.physical + rec.spell;
}

/** 取上 N 回合双方所受伤害总和。 */
export function totalDamageTurnsAgo(s: GameState, n: number): number {
  return damageTakenTurnsAgo(s, "A", n) + damageTakenTurnsAgo(s, "B", n);
}

/** 取上 N 回合某方回复量。 */
export function healedTurnsAgo(s: GameState, who: PlayerId, n: number): number {
  const idx = s.damageHistory.length - n;
  if (idx < 0 || idx >= s.damageHistory.length) return 0;
  return s.damageHistory[idx][who].healed;
}
