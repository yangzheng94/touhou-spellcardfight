import { describe, it, expect } from "vitest";
import { newGame, playTurn, availableCards } from "../src/index.js";
import { CHARACTERS } from "../src/data/index.js";

/**
 * 冒烟测试：每名角色 vs 妖梦，逐张符卡打出，确保结算不抛异常、HP 合法。
 */
describe("全角色冒烟测试", () => {
  it("19 名角色均已录入", () => {
    expect(CHARACTERS.length).toBe(19);
  });

  for (const char of CHARACTERS) {
    it(`${char.name} 逐张符卡结算不报错`, () => {
      const opp = CHARACTERS.find((c) => c.id === "youmu")!;
      // 用较大的 seed 遍历随机分支。
      const state = newGame(char, opp, { seed: 12345 });
      let guard = 0;
      while (state.winner === null && guard < 30) {
        guard++;
        const cardsA = availableCards(state, "A");
        const cardsB = availableCards(state, "B");
        if (cardsA.length === 0 || cardsB.length === 0) break;
        const passivesA = char.skills.filter((s) => s.passive).map((s) => s.id);
        const passivesB = opp.skills.filter((s) => s.passive).map((s) => s.id);
        expect(() =>
          playTurn(
            state,
            { cardId: cardsA[guard % cardsA.length].id, skillIds: passivesA },
            { cardId: cardsB[guard % cardsB.length].id, skillIds: passivesB },
          ),
        ).not.toThrow();
        // HP 不应为 NaN。
        expect(Number.isNaN(state.players.A.hp)).toBe(false);
        expect(Number.isNaN(state.players.B.hp)).toBe(false);
      }
    });
  }
});
