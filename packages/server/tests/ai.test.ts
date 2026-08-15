import { describe, it, expect } from "vitest";
import { newGame, availableCards, availableSkills, playTurn } from "../../engine/src/index.js";
import { CHARACTERS_BY_ID } from "../../engine/src/data/index.js";
import { chooseHardMove, hardDecide, candidateMoves, predictedOpponentMoves } from "../src/ai.js";

const PAIRS: [string, string][] = [
  ["youmu", "reimu"],
  ["remilia", "aya"],
  ["sakuya", "yuuka"],
  ["hata", "koishi"],
  ["seija", "cirno"],
  ["suika", "sagume"],
  ["patchouli", "reisen"],
  ["flandre", "mystia"],
];

describe("困难人机 AI", () => {
  it("chooseHardMove 返回合法着法（符卡未使用、技能可用）", async () => {
    for (const [a, b] of PAIRS) {
      const state = newGame(CHARACTERS_BY_ID[a], CHARACTERS_BY_ID[b], { seed: 1 });
      const mv = await chooseHardMove(state, "B", { timeBudgetMs: 1500 });
      const hand = availableCards(state, "B");
      const skills = availableSkills(state, "B");
      if (mv.cardId !== null) {
        expect(hand.some((c) => c.id === mv.cardId)).toBe(true);
      }
      for (const sid of mv.skillIds) {
        expect(skills.some((s) => s.id === sid)).toBe(true);
      }
    }
  }, 30000);

  it("相同局面 + 相同种子下着法可复现（非随机）", async () => {
    const state = newGame(CHARACTERS_BY_ID["youmu"], CHARACTERS_BY_ID["reimu"], { seed: 42 });
    const m1 = await chooseHardMove(state, "B", { timeBudgetMs: 1500 });
    const m2 = await chooseHardMove(state, "B", { timeBudgetMs: 1500 });
    expect(m1).toEqual(m2);
  }, 10000);

  it("对方残血时选择进攻着法（可形成斩杀），而非空过", async () => {
    const state = newGame(CHARACTERS_BY_ID["reimu"], CHARACTERS_BY_ID["youmu"], { seed: 5 });
    state.players.A.hp = 1; // 玩家侧残血
    const mv = await chooseHardMove(state, "B", { timeBudgetMs: 1500 });
    expect(mv.cardId).not.toBeNull();
    // 至少对一种预测的对手着法，所选着法能在本回合直接获胜
    const foeMoves = predictedOpponentMoves(state, "A");
    let canKill = false;
    for (const fmv of foeMoves) {
      const clone = newGame(CHARACTERS_BY_ID["reimu"], CHARACTERS_BY_ID["youmu"], { seed: 5 });
      clone.players.A.hp = 1;
      await playTurn(clone, fmv, mv, (req) => hardDecide(clone, req.player, req));
      if (clone.winner === "B") {
        canKill = true;
        break;
      }
    }
    expect(canKill).toBe(true);
  }, 30000);

  it("对手 HP 充足时不会无脑空过，也不会选择必然送死的三步必杀", async () => {
    const state = newGame(CHARACTERS_BY_ID["reimu"], CHARACTERS_BY_ID["youmu"], { seed: 9 });
    const mv = await chooseHardMove(state, "B", { timeBudgetMs: 1500 });
    // 只要还有可用符卡，就应出牌（出牌通常优于空过）
    const hand = availableCards(state, "B");
    if (hand.length > 0) {
      expect(mv.cardId).not.toBeNull();
    }
    // 三步必杀决策：对方血量充足时选择"否"
    const d = hardDecide(state, "B", { player: "B", prompt: "三步必杀：是否将符卡威力翻倍？（未击杀对方则己方死亡）", options: ["是", "否"] });
    expect(d).toBe(1);
  }, 30000);

  it("hardDecide 数值选择取最大值，选项按提示语义选择", () => {
    const state = newGame(CHARACTERS_BY_ID["aya"], CHARACTERS_BY_ID["youmu"], { seed: 1 });
    // 范围：取最大
    expect(hardDecide(state, "B", { player: "B", prompt: "幻想风靡：提升多少点威力(1-8)？", options: [], range: { min: 1, max: 8 } })).toBe(8);
    // 心绮楼演舞：消耗最多面具（最后一项）
    state.players.B.resources["masks"] = 4;
    const masks = hardDecide(state, "B", { player: "B", prompt: "心绮楼演舞：消耗多少个面具？（当前有4个）", options: ["0个", "1个", "2个", "3个", "4个"] });
    expect(masks).toBe(4);
    // 三步必杀：对方血量低才赌
    state.players.A.hp = 5;
    expect(hardDecide(state, "B", { player: "B", prompt: "三步必杀：是否将符卡威力翻倍？（未击杀对方则己方死亡）", options: ["是", "否"] })).toBe(0);
    // 月狂爆破：血量健康才承受代价
    expect(hardDecide(state, "B", { player: "B", prompt: "月狂爆破：是否承受当前HP一半的法术伤害来使威力翻倍？", options: ["否", "是"] })).toBe(1);
  });

  it("candidateMoves 覆盖所有可用符卡且包含空过", () => {
    const state = newGame(CHARACTERS_BY_ID["youmu"], CHARACTERS_BY_ID["reimu"], { seed: 1 });
    const moves = candidateMoves(state, "B");
    const hand = availableCards(state, "B");
    for (const c of hand) {
      expect(moves.some((m) => m.cardId === c.id)).toBe(true);
    }
    expect(moves.some((m) => m.cardId === null)).toBe(true);
  });

  it("困难 AI 双方自对局可在回合上限内正常结束且不抛异常", async () => {
    const state = newGame(CHARACTERS_BY_ID["youmu"], CHARACTERS_BY_ID["reimu"], { seed: 777 });
    let turn = 0;
    while (!state.winner && turn < 10) {
      const ma = await chooseHardMove(state, "A", { timeBudgetMs: 1500 });
      const mb = await chooseHardMove(state, "B", { timeBudgetMs: 1500 });
      await playTurn(state, ma, mb, (req) => hardDecide(state, req.player, req));
      turn++;
    }
    expect(turn).toBeLessThanOrEqual(10);
    expect(state.winner).not.toBeNull();
  }, 30000);
});
