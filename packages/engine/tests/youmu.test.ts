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

  it("六道剑：威力翻倍只覆盖下回合（T2 生效、T3 恢复）", async () => {
    const rikudou = findCard(youmu, "youmu-rikudou");
    const danmei = findCard(youmu, "youmu-danmei");
    const dummy = card("d", "空", 0, {});
    const hanjin = youmu.skills.find((s) => s.id === "youmu-hanjin")!;
    const state = createGameState(
      charWith("妖梦", 29, [rikudou, danmei, danmei]),
      charWith("B", 100, [dummy, dummy, dummy]),
      1,
    );
    await resolveTurn(state, { card: rikudou, skills: [hanjin] }, { card: dummy, skills: [] });
    await resolveTurn(state, { card: danmei, skills: [hanjin] }, { card: dummy, skills: [] });
    await resolveTurn(state, { card: danmei, skills: [hanjin] }, { card: dummy, skills: [] });
    // T1: 3 威力；T2: 5*2=10；T3: 恢复正常 5
    expect(state.damageHistory[0].B.physical).toBe(3);
    expect(state.damageHistory[0].B.spell).toBe(1);
    expect(state.damageHistory[1].B.physical).toBe(10);
    expect(state.damageHistory[1].B.spell).toBe(1);
    expect(state.damageHistory[2].B.physical).toBe(5);
    expect(state.damageHistory[2].B.spell).toBe(1);
    expect(state.players.B.hp).toBe(100 - 4 - 11 - 6);
  });

  it("现世斩：威力降低只覆盖下回合（T2 生效、T3 恢复）", async () => {
    const gensei = findCard(youmu, "youmu-genseizan");
    const dummy = card("d", "空", 0, {});
    const dummy2 = card("d2", "空2", 0, {});
    const six = card("six", "六", 6, {});
    const hanjin = youmu.skills.find((s) => s.id === "youmu-hanjin")!;
    const state = createGameState(
      charWith("妖梦", 29, [gensei, dummy2, dummy2]),
      charWith("B", 40, [dummy, six, six]),
      1,
    );
    await resolveTurn(state, { card: gensei, skills: [hanjin] }, { card: dummy, skills: [] });
    await resolveTurn(state, { card: dummy2, skills: [hanjin] }, { card: six, skills: [] });
    await resolveTurn(state, { card: dummy2, skills: [hanjin] }, { card: six, skills: [] });
    // T1: B 受 8物理+1法术，触发降威；T2: B 威力 6-4=2 → A 受 2；T3: 恢复 6 → A 受 6
    expect(state.players.B.hp).toBe(40 - 9);
    expect(state.damageHistory[1].A.physical).toBe(2);
    expect(state.damageHistory[2].A.physical).toBe(6);
  });

  it("彼岸剑：重复对抗波也逐波触发半人半灵", async () => {
    const higan = findCard(youmu, "youmu-higan");
    const dummy = card("d", "空", 0, {});
    const hanjin = youmu.skills.find((s) => s.id === "youmu-hanjin")!;
    const state = createGameState(
      charWith("妖梦", 29, [higan]),
      charWith("B", 100, [dummy]),
      1,
    );
    await resolveTurn(state, { card: higan, skills: [hanjin] }, { card: dummy, skills: [] });
    // 主对抗 9物理(+1法术) + 重复对抗 9物理(+1法术)
    expect(state.damageHistory[0].B.physical).toBe(18);
    expect(state.damageHistory[0].B.spell).toBe(2);
    expect(state.players.B.hp).toBe(100 - 20);
  });

});
