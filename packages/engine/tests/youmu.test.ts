import { describe, it, expect } from "vitest";
import { createGameState, resolveTurn } from "../src/index.js";
import { youmu } from "../src/data/youmu.js";
import type { Card, Character, EffectScript } from "../src/index.js";

function card(id: string, name: string, power: number, script: EffectScript, tags: Card["tags"] = []): Card {
  return { id, name, power, text: name, tags, script };
}
function charWith(name: string, hp: number, cards: Card[]): Character {
  return { id: name, name, hp, skills: [], cards };
}

function findCard(c: Character, id: string): Card {
  const card = c.cards.find((x) => x.id === id);
  if (!card) throw new Error(`no card ${id}`);
  return card;
}

describe("妖梦真实符卡数据校验", () => {
  it("西行春风斩 vs 金属风暴：帕对妖1物理，妖反弹3法术", async () => {
    const saigyou = findCard(youmu, "youmu-saigyou");
    // 用规则文档示例中的「产生3点法术伤害，威力7」还原帕秋莉金属风暴
    const patchouliStorm = card("storm", "金属风暴(示例)", 7, {
      damage: (ec) => ec.ctx.pending.push({ type: "spell", amount: 3, source: ec.self, target: ec.foe }),
    });
    const state = createGameState(
      charWith("妖梦", 29, [saigyou]),
      charWith("帕秋莉", 22, [patchouliStorm]),
      1,
    );
    await resolveTurn(state, { card: saigyou, skills: [] }, { card: patchouliStorm, skills: [] });
    expect(state.players.A.hp).toBe(28); // 妖梦受1物理
    expect(state.players.B.hp).toBe(19); // 帕秋莉受3反弹法术
  });

  it("现世斩造成伤害→对方下回合威力-4", async () => {
    const gensei = findCard(youmu, "youmu-genseizan"); // 威力8
    const dummy = card("d", "空", 0, {});
    const dummy2 = card("d2", "空2", 0, {});
    const state = createGameState(
      charWith("妖梦", 29, [gensei, dummy2]),
      charWith("B", 40, [dummy, card("d3", "空3", 6, {})]),
      1,
    );
    // T1: 妖梦现世斩8 vs B 0 → B受8物理，半人半灵追加1法术 → B 40-9=31，触发debuff
    await resolveTurn(state, { card: gensei, skills: [youmu.skills[0]] }, { card: dummy, skills: [] });
    expect(state.players.B.hp).toBe(31);
    // T2: B出威力6的牌，受-4 → 实际威力2；妖梦出0 → B威力2>0 → 妖梦受2物理
    await resolveTurn(state, { card: dummy2, skills: [] }, { card: state.players.B.character.cards[1], skills: [] });
    expect(state.players.A.hp).toBe(27); // 29-2
  });
});
