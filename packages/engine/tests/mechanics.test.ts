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
import { cirno } from "../src/data/cirno.js";
import { koishi } from "../src/data/koishi.js";
import { satori } from "../src/data/satori.js";
import { seija } from "../src/data/seija.js";

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

describe("琪露诺·湖之妖精：回合总伤害上限", () => {
  it("HP<=9 时，单回合多次伤害总计不超过3", async () => {
    const multiHit = card("multi", "连击", 0, {
      damage: (ec) => {
        dealPhysical(ec, 2);
        dealPhysical(ec, 2);
        dealPhysical(ec, 2);
      },
    });
    const attacker = charWith("连击者", 30, [multiHit]);
    const state = newGame({ ...cirno }, attacker, { seed: 1 });
    state.players.A.hp = 9;
    await playTurn(state, { cardId: null }, { cardId: "multi" });
    // 原始 6 点伤害应被限制到 3 点：9 - 3 = 6
    expect(state.players.A.hp).toBe(6);
  });

  it("HP>9 时，伤害不受上限影响", async () => {
    const multiHit = card("multi", "连击", 0, {
      damage: (ec) => {
        dealPhysical(ec, 2);
        dealPhysical(ec, 2);
        dealPhysical(ec, 2);
      },
    });
    const attacker = charWith("连击者", 30, [multiHit]);
    const state = newGame({ ...cirno }, attacker, { seed: 1 });
    state.players.A.hp = 10;
    await playTurn(state, { cardId: null }, { cardId: "multi" });
    expect(state.players.A.hp).toBe(4);
  });
});

describe("琪露诺·霜符【冰袭方阵】：三回合总伤害上限", () => {
  it("三回合内总伤害上限为6", async () => {
    const attacks = [
      card("atk1", "攻击1", 0, { damage: (ec) => dealPhysical(ec, 4) }),
      card("atk2", "攻击2", 0, { damage: (ec) => dealPhysical(ec, 4) }),
      card("atk3", "攻击3", 0, { damage: (ec) => dealPhysical(ec, 4) }),
    ];
    const attacker = charWith("攻击者", 30, attacks);
    const state = newGame({ ...cirno }, attacker, { seed: 1 });
    // T1: 琪露诺使用冰袭方阵，对手攻击 4
    await playTurn(state, { cardId: "cirno-frost" }, { cardId: "atk1" });
    // 上限6，受4，剩余2
    expect(state.players.A.hp).toBe(cirno.hp - 4);
    // T2: 对手再攻击 4，应被限制为 2
    await playTurn(state, { cardId: null }, { cardId: "atk2" });
    expect(state.players.A.hp).toBe(cirno.hp - 6);
    // T3: 上限已用完，再攻击 4 应被限制为 0
    await playTurn(state, { cardId: null }, { cardId: "atk3" });
    expect(state.players.A.hp).toBe(cirno.hp - 6);
  });
});

describe("琪露诺·冰符【冰瀑】：下回合吸收基于威力比的伤害", () => {
  it("本回合威力比 6:10，下回合吸收 floor(6/10*4)=2 点伤害", async () => {
    const bakufu = cirno.cards.find((c) => c.id === "cirno-bakufu")!;
    const dummy6 = card("dummy6", "空6", 6, {});
    const attacks = [card("atk1", "攻击1", 10, {}), card("atk2", "攻击2", 10, {})];
    const attacker = charWith("攻击者", 30, attacks);
    const defender: Character = { ...cirno, cards: [bakufu, dummy6] };
    const state = newGame(defender, attacker, { seed: 1 });
    // T1: 琪露诺使用冰瀑（威力6），对手攻击（威力10）
    await playTurn(state, { cardId: "cirno-bakufu" }, { cardId: "atk1" });
    // T2: 琪露诺使用空卡（威力6），对手再次攻击，冰瀑应吸收 2 点伤害
    await playTurn(state, { cardId: "dummy6" }, { cardId: "atk2" });
    // 琪露诺 HP：26 - 4(T1) - (4-2)(T2) - 1(不自然的冷气) = 19
    expect(state.players.A.hp).toBe(19);
  });
});

describe("古明地恋·紧闭的恋之瞳：威力调整后造成法术伤害", () => {
  it("己方威力调整后对对方造成1法术", async () => {
    // 直接使用 koishi 角色，确保被动技能存在
    const dummyA = card("dA", "空A", 0, {});
    const dummyB = card("dB", "空B", 0, {});
    const attacker: Character = { ...koishi, cards: [koishi.cards.find((c) => c.id === "koishi-sosen")!, dummyA] };
    const defender = charWith("B", 30, [dummyB]);
    const state = newGame(attacker, defender, { seed: 1 });
    await playTurn(state, { cardId: "koishi-sosen" }, { cardId: "dB" });
    // B 原本受威力差物理 + 恋之瞳 1 法术
    expect(state.players.B.hp).toBeLessThan(30);
    // 法术伤害记录
    expect(state.damageHistory[0].B.spell).toBe(1);
  });
});

describe("古明地觉·睁开的觉之瞳：法术伤害/回复后下回合威力+1", () => {
  it("本回合造成法术后，下回合威力+1", async () => {
    const dummyA1 = card("dA1", "空A1", 0, {});
    const dummyA2 = card("dA2", "空A2", 0, {});
    const dummyB1 = card("dB1", "空B1", 0, {});
    const dummyB2 = card("dB2", "空B2", 0, {});
    const attacker: Character = { ...satori, cards: [satori.cards.find((c) => c.id === "satori-aphrodite")!, dummyA1, dummyA2] };
    const defender = charWith("B", 30, [dummyB1, dummyB2]);
    const state = newGame(attacker, defender, { seed: 1 });
    // T1: 觉使用阿弗洛狄特造成13法术，触发觉之瞳
    await playTurn(state, { cardId: "satori-aphrodite" }, { cardId: "dB1" });
    expect(state.damageHistory[0].B.spell).toBe(13);
    // T2: 觉打出空卡，下回合威力应+1（空卡威力0 → 实际威力1）
    await playTurn(state, { cardId: "dA1" }, { cardId: "dB2" });
    expect(state.damageHistory[1].B.physical).toBe(1);
  });
});

describe("古明地恋符卡效果验证", () => {
  it("表象【先祖托梦】：本回合己方符卡威力翻倍", async () => {
    const sosen = koishi.cards.find((c) => c.id === "koishi-sosen")!;
    const dummyB = card("dB", "空B", 5, {});
    const attacker: Character = { ...koishi, cards: [sosen] };
    const defender = charWith("B", 30, [dummyB]);
    const state = newGame(attacker, defender, { seed: 1 });
    await playTurn(state, { cardId: "koishi-sosen" }, { cardId: "dB" });
    // 先祖托梦威力5翻倍为10，空B威力5，A 胜，B 受 5 物理
    expect(state.damageHistory[0].B.physical).toBe(5);
  });

  it("复燃【恋爱的埋火】：造成5点法术伤害", async () => {
    const fukunen = koishi.cards.find((c) => c.id === "koishi-fukunen")!;
    const dummyB = card("dB", "空B", 0, {});
    const attacker: Character = { ...koishi, cards: [fukunen] };
    const defender = charWith("B", 30, [dummyB]);
    const state = newGame(attacker, defender, { seed: 1 });
    await playTurn(state, { cardId: "koishi-fukunen" }, { cardId: "dB" });
    expect(state.damageHistory[0].B.spell).toBe(5);
  });

  it("抑制【超我】：下回合对方符卡威力下降6点", async () => {
    const superego = koishi.cards.find((c) => c.id === "koishi-superego")!;
    const attack = card("atk", "攻击", 8, {});
    const attacker: Character = { ...koishi, cards: [superego, attack] };
    const defender = charWith("B", 30, [card("d1", "空1", 5, {}), card("d2", "空2", 5, {})]);
    const state = newGame(attacker, defender, { seed: 1 });
    // T1: 超我，下回合对方威力-6
    await playTurn(state, { cardId: "koishi-superego" }, { cardId: "d1" });
    // T2: A 攻击8，B 空卡原本威力5，被-6后为0（威力不为负），A 胜，B 受 8 - 0 = 8 物理
    await playTurn(state, { cardId: "atk" }, { cardId: "d2" });
    expect(state.damageHistory[1].B.physical).toBe(8);
  });

  it("本能【本我的解放】：接下来三回合己方威力+1", async () => {
    const kaihou = koishi.cards.find((c) => c.id === "koishi-kaihou")!;
    const attacks = [
      card("atk1", "攻击1", 0, {}),
      card("atk2", "攻击2", 0, {}),
      card("atk3", "攻击3", 0, {}),
    ];
    const attacker: Character = { ...koishi, cards: [kaihou, ...attacks] };
    const defender = charWith("B", 30, [
      card("d1", "空1", 0, {}),
      card("d2", "空2", 0, {}),
      card("d3", "空3", 0, {}),
      card("d4", "空4", 0, {}),
    ]);
    const state = newGame(attacker, defender, { seed: 1 });
    // T1: 本我的解放
    await playTurn(state, { cardId: "koishi-kaihou" }, { cardId: "d1" });
    // T2-T4: 攻击威力0，但 buff +1，对抗差为1
    await playTurn(state, { cardId: "atk1" }, { cardId: "d2" });
    expect(state.damageHistory[1].B.physical).toBe(1);
    await playTurn(state, { cardId: "atk2" }, { cardId: "d3" });
    expect(state.damageHistory[2].B.physical).toBe(1);
    await playTurn(state, { cardId: "atk3" }, { cardId: "d4" });
    expect(state.damageHistory[3].B.physical).toBe(1);
  });

  it("反应【妖怪测谎仪】：本回合双方威力互换", async () => {
    const uso = koishi.cards.find((c) => c.id === "koishi-uso")!;
    const attack = card("atk", "攻击", 10, { damage: (ec) => dealPhysical(ec, 10) });
    const attacker: Character = { ...koishi, cards: [uso, attack] };
    const defender = charWith("B", 30, [card("d1", "空1", 0, {}), card("d2", "空2", 5, {})]);
    const state = newGame(attacker, defender, { seed: 1 });
    // T1: A 测谎仪（威力2），B 空卡（威力0），互换后 A=0, B=2，B 胜
    await playTurn(state, { cardId: "koishi-uso" }, { cardId: "d1" });
    expect(state.damageHistory[0].A.physical).toBe(2);
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

describe("圣娅·幻觉机制", () => {
  it("凝光幻剑替代正常 clash，按威力差造成物理伤害", async () => {
    const gyoukou = seija.cards.find((c) => c.id === "seija-gyoukou")!;
    const dummyB = card("dB", "空B", 0, {});
    const attacker: Character = { ...seija, cards: [gyoukou] };
    const defender = charWith("B", 30, [dummyB]);
    const state = newGame(attacker, defender, { seed: 1 });

    // 凝光幻剑威力 5 vs 空卡 0，替代 clash 后造成 5 物理 + 1 层幻觉（1 法术）
    await playTurn(state, { cardId: "seija-gyoukou" }, { cardId: "dB" });

    expect(state.damageHistory[0].B.physical).toBe(5);
    expect(state.damageHistory[0].B.spell).toBe(1);
    expect(state.players.B.resources["illusion"]).toBe(1);
  });

  it("每次施加幻觉造成 1 点法术伤害，并以 BUFF 显示层数", async () => {
    const dummyA = card("dA", "空A", 0, {});
    const dummyB1 = card("dB1", "空B1", 0, {});
    const dummyB2 = card("dB2", "空B2", 0, {});
    const attacker: Character = { ...seija, cards: [dummyA] };
    const defender = charWith("B", 30, [dummyB1, dummyB2]);
    const state = newGame(attacker, defender, { seed: 1 });

    // T1: 空过（幻惑之狐冷却中，不可用）
    await playTurn(state, { cardId: "dA" }, { cardId: "dB1" });
    expect(state.damageHistory[0].B.physical).toBe(0);
    expect(state.damageHistory[0].B.spell).toBe(0);

    // T2: 宣告幻惑之狐，回合结束时给敌方施加 1 层幻觉
    // 每次施加幻觉只造成 1 点法术伤害，而不是当前层数点伤害
    await playTurn(state, { cardId: null, skillIds: ["seija-genwaku"] }, { cardId: "dB2" });
    expect(state.damageHistory[1].B.physical).toBe(0);
    expect(state.damageHistory[1].B.spell).toBe(1);

    // 验证幻觉 BUFF 存在且显示层数为 1
    const illusionBuff = state.players.B.buffs.find((b) => b.id === "seija-illusion");
    expect(illusionBuff).toBeDefined();
    expect(illusionBuff?.text).toContain("1");
    expect(state.players.B.resources["illusion"]).toBe(1);
  });

  it("多层幻觉被幻空之境结算时按层数 x2 出伤，并减半层数", async () => {
    const dummiesA = [
      card("dA1", "空A1", 0, {}),
      card("dA2", "空A2", 0, {}),
      card("dA3", "空A3", 0, {}),
      card("dA4", "空A4", 0, {}),
    ];
    const dummiesB = [
      card("dB1", "空B1", 0, {}),
      card("dB2", "空B2", 0, {}),
      card("dB3", "空B3", 0, {}),
      card("dB4", "空B4", 0, {}),
      card("dB5", "空B5", 0, {}),
    ];
    const genku = seija.cards.find((c) => c.id === "seija-genku")!;
    const attacker: Character = { ...seija, cards: [...dummiesA, genku] };
    const defender = charWith("B", 30, dummiesB);
    const state = newGame(attacker, defender, { seed: 1 });

    // T1: 空过
    await playTurn(state, { cardId: "dA1" }, { cardId: "dB1" });
    // T2: 幻惑之狐冷却就绪，叠 1 层幻觉（1 法术）
    await playTurn(state, { cardId: "dA2", skillIds: ["seija-genwaku"] }, { cardId: "dB2" });
    expect(state.players.B.resources["illusion"]).toBe(1);
    expect(state.damageHistory[1].B.spell).toBe(1);
    // T3: 空过
    await playTurn(state, { cardId: "dA3" }, { cardId: "dB3" });
    // T4: 幻惑之狐再次就绪，叠到 2 层幻觉（再 1 法术）
    await playTurn(state, { cardId: "dA4", skillIds: ["seija-genwaku"] }, { cardId: "dB4" });
    expect(state.players.B.resources["illusion"]).toBe(2);
    expect(state.damageHistory[3].B.spell).toBe(1);

    // T5: 幻空之境结算，按层数 x2 造成法术伤害，并减半层数
    // 幻空之境威力 3 vs 空卡 0，clash 还有 3 物理伤害
    await playTurn(state, { cardId: "seija-genku" }, { cardId: "dB5" });
    expect(state.damageHistory[4].B.physical).toBe(3);
    expect(state.damageHistory[4].B.spell).toBe(4); // 2 层 * 2
    expect(state.players.B.resources["illusion"]).toBe(1); // floor(2/2)
    const illusionBuff = state.players.B.buffs.find((b) => b.id === "seija-illusion");
    expect(illusionBuff).toBeDefined();
    expect(illusionBuff?.text).toContain("1");
  });
});
