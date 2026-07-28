import type { Card, CardTag, PlayerId, Rng } from "./types.js";

/** 优先级等级：数值越大越优先。 */
export const PRIORITY_RANK: Record<string, number> = {
  "negate-cast": 4, // 发动无效
  "negate-effect": 3, // 效果无效
  reverse: 2, // 反转系
  other: 1, // 其余
};

/** 取一张符卡的优先级等级（取其标签中的最高优先类别）。 */
export function cardPriorityRank(card: Card): number {
  let rank = PRIORITY_RANK.other;
  for (const tag of card.tags) {
    if (tag === "negate-cast") rank = Math.max(rank, PRIORITY_RANK["negate-cast"]);
    else if (tag === "negate-effect") rank = Math.max(rank, PRIORITY_RANK["negate-effect"]);
    else if (tag === "reverse") rank = Math.max(rank, PRIORITY_RANK.reverse);
  }
  return rank;
}

export function hasTag(card: Card | null, tag: CardTag): boolean {
  return !!card && card.tags.includes(tag);
}

export interface PriorityOrder {
  order: PlayerId[]; // 处理顺序（优先级从高到低）
  firstMover: PlayerId; // 先攻方（同级时的胜者）
}

/**
 * 计算本回合两张符卡的处理顺序。
 * 规则：无效系 > 反转系 > 其余；
 * 同优先级时，非无效系按符卡基础威力高者先攻，威力相同则随机；
 * 无效系同级仍按随机处理。
 */
export function computePriorityOrder(
  cardA: Card | null,
  cardB: Card | null,
  rng: Rng,
): PriorityOrder {
  const rankA = cardA ? cardPriorityRank(cardA) : 0;
  const rankB = cardB ? cardPriorityRank(cardB) : 0;
  if (rankA > rankB) return { order: ["A", "B"], firstMover: "A" };
  if (rankB > rankA) return { order: ["B", "A"], firstMover: "B" };

  // 同级：非无效系按威力高者先攻，无效系或威力相同则随机
  const isNegate = (r: number) => r >= PRIORITY_RANK["negate-effect"];
  let first: PlayerId;
  if (!isNegate(rankA)) {
    const powerA = cardA?.power ?? 0;
    const powerB = cardB?.power ?? 0;
    if (powerA > powerB) first = "A";
    else if (powerB > powerA) first = "B";
    else first = rng.next() < 0.5 ? "A" : "B";
  } else {
    first = rng.next() < 0.5 ? "A" : "B";
  }
  return { order: [first, first === "A" ? "B" : "A"], firstMover: first };
}
