import { describe, it, expect } from "vitest";
import {
  createGameState,
  resolveTurn,
  playTurn,
  newGame,
  availableCards,
  type Card,
  type Character,
  type EffectScript,
} from "../src/index.js";
import { dealSpell, addPower, dealPhysical, requestRepeatClash } from "../src/effects.js";
import { addBuff, addRes, getRes } from "../src/buffs.js";

function card(id: string, name: string, power: number, script: EffectScript, tags: Card["tags"] = []): Card {
  return { id, name, power, text: name, tags, script };
}
function charWith(name: string, hp: number, cards: Card[]): Character {
  return { id: name, name, hp, skills: [], cards };
}

describe("M2/M3: 符卡一次性 + 可用性", () => {
  it("用过的符卡不可再用", async () => {
    const c1 = card("c1", "牌1", 5, {});
    const c2 = card("c2", "牌2", 3, {});
    const A = charWith("A", 30, [c1, c2]);
    const B = charWith("B", 30, [card("b1", "b1", 4, {}), card("b2", "b2", 2, {})]);
    const state = newGame(A, B, { seed: 1 });
    await playTurn(state, { cardId: "c1" }, { cardId: "b1" });
    const avail = availableCards(state, "A").map((c) => c.id);
    expect(avail).toEqual(["c2"]);
    await expect(playTurn(state, { cardId: "c1" }, { cardId: "b2" })).rejects.toThrow();
  });
});

describe("M3: 延时 BUFF 队列", () => {
  it("塞符类：下回合起持续3回合每回合造成2法术", async () => {
    const trigger = card("t", "触发", 0, {
      turnStart: (ec) => {
        addBuff(ec, {
          id: "burn",
          name: "灼烧",
          owner: ec.self,
          turns: 3,
          script: { turnEnd: (e) => dealSpell(e, 2) },
        });
      },
    });
    const dummy = card("d", "空", 0, {});
    const state = createGameState(charWith("A", 30, [trigger]), charWith("B", 30, [dummy]), 1);
    // T1: 施放 buff（buff 从下回合开始生效，T1 末不触发）
    await resolveTurn(state, { card: trigger, skills: [] }, { card: dummy, skills: [] });
    const afterT1 = state.players.B.hp;
    // T2, T3, T4: 触发三次
    await resolveTurn(state, { card: dummy, skills: [] }, { card: dummy, skills: [] });
    await resolveTurn(state, { card: dummy, skills: [] }, { card: dummy, skills: [] });
    await resolveTurn(state, { card: dummy, skills: [] }, { card: dummy, skills: [] });
    // buff turns=3 → T2,T3,T4 各触发一次，共 6 法术；T1 不触发
    expect(30 - afterT1).toBe(0);
    expect(state.players.B.hp).toBe(24);
  });
});

describe("M3: 彼岸剑 重复对抗", () => {
  it("回合末重复一次威力对抗物理伤害", async () => {
    // A 威力9，B 威力0 → 差9物理；重复一次 → 共18
    const higan = card("hg", "彼岸剑", 9, {
      turnEnd: (ec) => requestRepeatClash(ec),
    });
    const dummy = card("d", "空", 0, {});
    const state = createGameState(charWith("妖梦", 30, [higan]), charWith("B", 40, [dummy]), 1);
    await resolveTurn(state, { card: higan, skills: [] }, { card: dummy, skills: [] });
    expect(state.players.B.hp).toBe(40 - 18);
  });
});

describe("M3: 专属资源（奏数示例）", () => {
  it("奏数每回合+1并可 wrap", async () => {
    const counter = card("k", "奏", 0, {
      turnStart: (ec) => addRes(ec, ec.self, "sou", 1, { wrap: 7 }),
      power: (ec) => addPower(ec, getRes(ec, ec.self, "sou")),
    });
    const dummy = card("d", "空", 0, {});
    const state = createGameState(charWith("蕾米", 30, [counter]), charWith("B", 30, [dummy]), 1);
    await resolveTurn(state, { card: counter, skills: [] }, { card: dummy, skills: [] });
    expect(state.players.A.resources.sou).toBe(1);
  });
});

describe("apply 阶段追加触发（半人半灵式）", () => {
  it("造成物理伤害后追加法术", async () => {
    const attacker = card("atk", "斩", 8, {
      apply: (ec) => {
        if (ec.ctx.dealt[ec.foe].physical > 0) dealPhysical(ec, 0); // no-op guard
        if (ec.ctx.dealt[ec.foe].physical > 0) dealSpell(ec, 1);
      },
    });
    const dummy = card("d", "空", 0, {});
    const state = createGameState(charWith("妖梦", 30, [attacker]), charWith("B", 30, [dummy]), 1);
    await resolveTurn(state, { card: attacker, skills: [] }, { card: dummy, skills: [] });
    // B 受 8 物理 + 1 法术 = 9
    expect(state.players.B.hp).toBe(21);
  });
});
