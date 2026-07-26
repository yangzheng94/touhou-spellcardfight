import type {
  Card,
  Character,
  GameState,
  PlayerId,
  Skill,
} from "./types.js";
import { createGameState } from "./state.js";
import { resolveTurn, type TurnChoice, type DecisionResolver } from "./resolver.js";

/**
 * 游戏控制层 —— 服务器/UI 通过它查询合法着法并推进对局。
 * 规则：每回合各出 1 张符卡（一次性，用过不可再用）；技能受各自冷却限制。
 */

export interface GameOptions {
  seed: number;
}

export function newGame(charA: Character, charB: Character, opts: GameOptions): GameState {
  return createGameState(charA, charB, opts.seed);
}

/** 某方本回合尚可打出的符卡（排除已使用）。 */
export function availableCards(state: GameState, who: PlayerId): Card[] {
  const p = state.players[who];
  const used = new Set(p.usedCardIds);
  return p.character.cards.filter((c) => !used.has(c.id));
}

/** 判断某技能当前是否可发动（满足冷却）。 */
export function isSkillReady(state: GameState, who: PlayerId, skill: Skill): boolean {
  if (skill.passive) return true;
  const last = state.players[who].skillLastUsedTurn[skill.id];
  if (last === undefined) return true;
  // 下一回合数：last + cooldown。当前 state.turn 是「已完成的回合数」，
  // 即将进行的回合为 state.turn + 1。
  const nextTurn = state.turn + 1;
  return nextTurn - last >= skill.cooldown;
}

/** 某方本回合可主动宣告的技能（满足冷却、需宣告）。 */
export function availableSkills(state: GameState, who: PlayerId): Skill[] {
  const p = state.players[who];
  return p.character.skills.filter(
    (s) => !s.passive && s.declaredAtTurnStart && isSkillReady(state, who, s),
  );
}

/** 某方所有被动技能（每回合自动生效）。 */
export function passiveSkills(character: Character): Skill[] {
  return character.skills.filter((s) => s.passive);
}

export interface PlayerMove {
  cardId: string | null;
  /** 主动宣告的技能 id。 */
  skillIds?: string[];
}

function resolveChoice(state: GameState, who: PlayerId, move: PlayerMove): TurnChoice {
  const p = state.players[who];
  const card = move.cardId ? p.character.cards.find((c) => c.id === move.cardId) ?? null : null;
  // 被动技能自动加入。
  const passives = passiveSkills(p.character);
  const declared = (move.skillIds ?? [])
    .map((id) => p.character.skills.find((s) => s.id === id))
    .filter((s): s is Skill => !!s);
  return { card, skills: [...passives, ...declared] };
}

/**
 * 推进一个回合（双方 move 已由服务器在隐藏出牌后同时提交）。
 * 会校验符卡未被使用；技能冷却由服务器在收集 move 时用 isSkillReady 校验。
 */
export async function playTurn(
  state: GameState,
  moveA: PlayerMove,
  moveB: PlayerMove,
  decide?: DecisionResolver,
): Promise<GameState> {
  // 校验符卡可用性。
  for (const [who, move] of [["A", moveA], ["B", moveB]] as [PlayerId, PlayerMove][]) {
    if (move.cardId) {
      const ok = availableCards(state, who).some((c) => c.id === move.cardId);
      if (!ok) throw new Error(`玩家 ${who} 的符卡 ${move.cardId} 不可用（已使用或不存在）`);
    }
  }
  const choiceA = resolveChoice(state, "A", moveA);
  const choiceB = resolveChoice(state, "B", moveB);
  return resolveTurn(state, choiceA, choiceB, decide);
}
