import { describe, it, expect } from "vitest";
import { createGameState, resolveTurn, type Card, type Character, type EffectScript } from "../src/index.js";
import { dealSpell, addPower } from "../src/effects.js";
import { addBuff } from "../src/buffs.js";

function card(id: string, name: string, power: number, script: EffectScript, tags: Card["tags"] = []): Card {
  return { id, name, power, text: `${name} 效果`, tags, script };
}
function charWith(name: string, hp: number, cards: Card[]): Character {
  return { id: name, name, hp, skills: [], cards };
}

describe("战斗结算日志：符卡、技能与 BUFF", () => {
  it("turnStart 阶段记录符卡效果文本", async () => {
    const cA = card("cA", "测试符卡A", 5, {}, []);
    const cB = card("cB", "测试符卡B", 3, {}, []);
    const state = createGameState(charWith("A", 30, [cA]), charWith("B", 30, [cB]), 1);
    await resolveTurn(state, { card: cA, skills: [] }, { card: cB, skills: [] });
    const logs = state.log.filter((e) => e.phase === "turnStart").map((e) => e.msg);
    expect(logs).toContain("A（A）打出符卡：测试符卡A｜效果：测试符卡A 效果");
    expect(logs).toContain("B（B）打出符卡：测试符卡B｜效果：测试符卡B 效果");
  });

  it("turnStart 阶段记录技能效果文本", async () => {
    const skillA = {
      id: "skill-a",
      name: "测试技能",
      text: "测试技能效果",
      cooldown: 1,
      passive: false,
      declaredAtTurnStart: true,
      script: { power: (ec) => addPower(ec, 2) },
    };
    const charA: Character = { id: "A", name: "A", hp: 30, skills: [skillA], cards: [] };
    const dummy = card("d", "空", 0, {});
    const state = createGameState(charA, charWith("B", 30, [dummy]), 1);
    await resolveTurn(state, { card: null, skills: [skillA] }, { card: dummy, skills: [] });
    const logs = state.log.filter((e) => e.phase === "turnStart").map((e) => e.msg);
    expect(logs).toContain("A（A）宣告技能：测试技能｜效果：测试技能效果");
  });

  it("生效的 BUFF 在 turnStart 日志中列出，并携带分类与剩余时长", async () => {
    const buffCard = card("buff", "加buff", 0, {
      turnStart: (ec) =>
        addBuff(ec, {
          id: "test-buff",
          name: "测试BUFF",
          owner: ec.self,
          turns: 3,
          text: "每回合造成 2 点法术伤害",
          category: "delayed-damage",
          script: { turnEnd: (e) => dealSpell(e, 2) },
        }),
    });
    const dummy = card("d", "空", 0, {});
    const state = createGameState(charWith("A", 30, [buffCard]), charWith("B", 30, [dummy]), 1);
    // T1 创建 buff（activateOnCreate 默认 false，T1 末不触发）
    await resolveTurn(state, { card: buffCard, skills: [] }, { card: dummy, skills: [] });
    // T2 开始时 buff 生效并显示
    await resolveTurn(state, { card: dummy, skills: [] }, { card: dummy, skills: [] });
    const turnStartLogs = state.log.filter((e) => e.phase === "turnStart").map((e) => e.msg);
    expect(turnStartLogs.some((m) => m.includes("[延迟伤害] 测试BUFF：每回合造成 2 点法术伤害"))).toBe(true);
    expect(turnStartLogs.some((m) => m.includes("BUFF/技能生效顺序"))).toBe(true);
  });

  it("本回合新建且 activateOnCreate=false 的 BUFF 被过滤", async () => {
    const buffCard = card("buff", "加buff", 0, {
      turnStart: (ec) =>
        addBuff(ec, {
          id: "test-buff",
          name: "测试BUFF",
          owner: ec.self,
          turns: 3,
          text: "每回合造成 2 点法术伤害",
          category: "delayed-damage",
          script: { turnEnd: (e) => dealSpell(e, 2) },
        }),
    });
    const dummy = card("d", "空", 0, {});
    const state = createGameState(charWith("A", 30, [buffCard]), charWith("B", 30, [dummy]), 1);
    await resolveTurn(state, { card: buffCard, skills: [] }, { card: dummy, skills: [] });
    const buffLogs = state.log
      .filter((e) => e.phase === "turnStart" && e.type === "buff")
      .map((e) => e.msg);
    expect(buffLogs.some((m) => m.includes("测试BUFF"))).toBe(false);
  });

  it("activateOnCreate=true 的 BUFF 在创建回合即显示", async () => {
    const buffCard = card("buff", "即时buff", 0, {
      turnStart: (ec) =>
        addBuff(ec, {
          id: "test-buff",
          name: "即时BUFF",
          owner: ec.self,
          turns: 1,
          activateOnCreate: true,
          text: "本回合威力 +5",
          category: "power",
          script: { power: (e) => addPower(e, 5) },
        }),
    });
    const dummy = card("d", "空", 0, {});
    const state = createGameState(charWith("A", 30, [buffCard]), charWith("B", 30, [dummy]), 1);
    await resolveTurn(state, { card: buffCard, skills: [] }, { card: dummy, skills: [] });
    const turnStartLogs = state.log.filter((e) => e.phase === "turnStart").map((e) => e.msg);
    console.log("activateOnCreate logs", turnStartLogs);
    expect(turnStartLogs.some((m) => m.includes("[威力] 即时BUFF：本回合威力 +5"))).toBe(true);
  });

  it("BUFF 列表按优先级顺序排列玩家", async () => {
    // A 打出 negate-effect 符卡（优先级 3），B 打出普通符卡（优先级 1）
    const negateCard = card("neg", "无效", 0, { priority: (ec) => {} }, ["negate-effect"]);
    const normalCard = card("nor", "普通", 0, {}, []);
    const state = createGameState(charWith("A", 30, [negateCard]), charWith("B", 30, [normalCard]), 1);
    // 先给 A 挂一个 buff，使其在 T2 生效
    const setupCard = card("setup", "setup", 0, {
      turnStart: (ec) =>
        addBuff(ec, {
          id: "setup-buff",
          name: "setup",
          owner: ec.self,
          turns: 2,
          text: "setup",
          category: "other",
          script: {},
        }),
    });
    await resolveTurn(state, { card: setupCard, skills: [] }, { card: setupCard, skills: [] });
    // T2：A 打出高优先级符卡，B 普通符卡；BUFF 列表应先 A 后 B
    await resolveTurn(state, { card: negateCard, skills: [] }, { card: normalCard, skills: [] });
    const orderLog = state.log.find((e) => e.phase === "turnStart" && e.msg.includes("BUFF/技能生效顺序"));
    expect(orderLog).toBeDefined();
    expect(orderLog!.msg).toContain("先处理 A");
  });
});
