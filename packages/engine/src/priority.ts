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
 * 规则：无效系 > 反转系 > 其余；同优先级看发动速度。
 * 由于属性装饰化 + 同时出牌，同级碰撞采用服务器随机决定先攻（并记录日志）。
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
  // 同级：随机先攻
  const first: PlayerId = rng.next() < 0.5 ? "A" : "B";
  return { order: [first, first === "A" ? "B" : "A"], firstMover: first };
}
