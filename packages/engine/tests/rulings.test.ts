import { describe, it, expect } from "vitest";
import {
  createGameState,
  resolveTurn,
  type Card,
  type Character,
  type DecisionResolver,
} from "../src/index.js";
import type { EffectScript } from "../src/types.js";
import { dealSpell, addPower } from "../src/effects.js";
import { patches } from "../src/data/patches.js";
import { satori } from "../src/data/satori.js";
import { reimu } from "../src/data/reimu.js";
import { koishi } from "../src/data/koishi.js";
import { sagume } from "../src/data/sagume.js";
import { patchouli } from "../src/data/patchouli.js";

function card(id: string, name: string, power: number, script: EffectScript, tags: Card["tags"] = []): Card {
  return { id, name, power, text: name, tags, script };
}
function charWith(name: string, hp: number, cards: Card[]): Character {
  return { id: name, name, hp, skills: [], cards };
}

function powerBuff(id: string, delta: number) {
  return {
    id,
    name: `威力${delta > 0 ? "+" : ""}${delta}`,
    owner: "A" as const,
    createdTurn: 0,
    remainingTurns: 1,
    remainingTriggers: -1,
    script: { power: (e: any) => addPower(e, delta) },
    text: "",
    category: "power" as const,
  };
}

describe("已裁决修正的行为规范", () => {
  it("帕奇左弓：基础威力 20，无 buff 时以 20 参与对抗", async () => {
    const zuogong = patches.cards.find((c) => c.id === "patches-zuogong")!;
    const dummy = card("d", "空", 0, {});
    const state = createGameState({ ...patches }, charWith("B", 60, [dummy]), 1);
    await resolveTurn(state, { card: zuogong, skills: [] }, { card: dummy, skills: [] });
    expect(state.damageHistory[0].B.physical).toBe(20);
  });

  it("帕奇左弓：拥有里技启动 Buff 时威力为 40", async () => {
    const zuogong = patches.cards.find((c) => c.id === "patches-zuogong")!;
    const dummy = card("d", "空", 0, {});
    const state = createGameState({ ...patches }, charWith("B", 60, [dummy]), 1);
    state.players.A.buffs.push({
      id: "patches-riki-qidong-buff",
      name: "里技启动",
      owner: "A",
      createdTurn: 0,
      remainingTurns: 2,
      remainingTriggers: -1,
      script: {},
      text: "",
      category: "power",
    });
    await resolveTurn(state, { card: zuogong, skills: [] }, { card: dummy, skills: [] });
    expect(state.damageHistory[0].B.physical).toBe(40);
  });

  it("觉「蒙胧的表意识」：只复制对方效果，保留自身威力 6", async () => {
    const oboro = satori.cards.find((c) => c.id === "satori-oboro")!;
    const foeCard = card("foe", "对方卡", 12, { damage: (ec) => dealSpell(ec, 5) });
    const state = createGameState(charWith("A", 40, [oboro]), charWith("B", 40, [foeCard]), 1);
    await resolveTurn(state, { card: oboro, skills: [] }, { card: foeCard, skills: [] });
    // 对方威力 12 正常保持，我方威力仍为 6：A 受 6 物理；复制的伤害脚本对 B 造成 5 法术
    expect(state.damageHistory[0].A.physical).toBe(6);
    expect(state.damageHistory[0].B.spell).toBe(5);
  });

  it("灵梦「永远的巫女」：按最终威力补足", async () => {
    const miko = reimu.skills.find((s) => s.id === "reimu-miko")!;
    const atk = card("atk", "攻击", 3, {});
    const foe = card("foe", "对方", 9, {});
    const state = createGameState({ ...reimu }, charWith("B", 40, [foe]), 1);
    await resolveTurn(state, { card: atk, skills: [miko] }, { card: foe, skills: [] });
    // A 基础 3 补足至对方 9 → 持平，无 clash 伤害
    expect(state.damageHistory[0].A.physical).toBe(0);
    expect(state.damageHistory[0].B.physical).toBe(0);
  });

  it("恋「妖怪测谎仪」：按修正后的最终威力互换", async () => {
    const uso = koishi.cards.find((c) => c.id === "koishi-uso")!;
    const state = createGameState({ ...koishi }, charWith("B", 40, [card("b", "空", 6, {})]), 1);
    state.players.A.buffs.push(powerBuff("t-buff", 10));
    await resolveTurn(state, { card: uso, skills: [] }, { card: card("b", "空", 6, {}), skills: [] });
    // A 最终 2+10=12，B=6；互换后 A=6, B=12 → A 受 6 物理
    expect(state.damageHistory[0].A.physical).toBe(6);
  });

  it("驲驹早鬼「天马十字」：使用对方修正后的最终威力", async () => {
    const cross = sagume.cards.find((c) => c.id === "sagume-cross")!;
    const foe = card("foe", "对方", 3, { power: (ec) => addPower(ec, 4) });
    const state = createGameState({ ...sagume }, charWith("B", 60, [foe]), 1);
    await resolveTurn(state, { card: cross, skills: [] }, { card: foe, skills: [] });
    // 对方最终 3+4=7，回合数 1：(7+1)*2=16 法术
    expect(state.damageHistory[0].B.spell).toBe(16);
  });

  it("觉「脑指纹测谎法」：互换符卡同时互换威力基数", async () => {
    const shimon = satori.cards.find((c) => c.id === "satori-shimon")!;
    const big = card("big", "大卡", 12, {});
    const state = createGameState(charWith("A", 60, [shimon]), charWith("B", 60, [big]), 1);
    await resolveTurn(state, { card: shimon, skills: [] }, { card: big, skills: [] });
    // 互换后 A 用 12，B 用 5 → B 受 7 物理
    expect(state.damageHistory[0].B.physical).toBe(7);
  });

  it("帕秋莉「日符【皇家烈焰】」：按最终威力比较加威力", async () => {
    const hi = patchouli.cards.find((c) => c.id === "patchouli-hi")!;
    const state = createGameState({ ...patchouli }, charWith("B", 60, [card("b", "空", 5, {})]), 1);
    state.players.A.buffs.push(powerBuff("t-buff", 3));
    await resolveTurn(state, { card: hi, skills: [] }, { card: card("b", "空", 5, {}), skills: [] });
    // A=9+3+4=16 vs B=5 → B 受 11 物理
    expect(state.damageHistory[0].B.physical).toBe(11);
  });

  it("帕秋莉「月符【沉静的月神】」：10 法术 + 回复等量 HP", async () => {
    const tsuki = patchouli.cards.find((c) => c.id === "patchouli-tsuki")!;
    const state = createGameState({ ...patchouli }, charWith("B", 40, [card("b", "空", 0, {})]), 1);
    state.players.A.hp = 10;
    await resolveTurn(state, { card: tsuki, skills: [] }, { card: card("b", "空", 0, {}), skills: [] });
    expect(state.damageHistory[0].B.spell).toBe(10);
    expect(state.players.A.hp).toBe(20);
  });

  it("帕秋莉「贤者之石」：未集齐元素时不生效，集齐后全效果生效", async () => {
    const kenja = patchouli.cards.find((c) => c.id === "patchouli-kenja")!;
    const dummy = card("b", "空", 0, {});
    const s1 = createGameState({ ...patchouli }, charWith("B", 40, [dummy]), 1);
    await resolveTurn(s1, { card: kenja, skills: [] }, { card: dummy, skills: [] });
    expect(s1.damageHistory[0].B.spell).toBe(0);
    expect(s1.players.B.hp).toBe(40);

    const s2 = createGameState({ ...patchouli }, charWith("B", 40, [dummy]), 1);
    for (const k of ["elem_metal", "elem_fire", "elem_wood", "elem_earth", "elem_water"]) {
      s2.players.A.resources[k] = 1;
    }
    await resolveTurn(s2, { card: kenja, skills: [] }, { card: dummy, skills: [] });
    // A 最终 5+5=10，B=0-5→0 → B 受 10 物理 + 5 法术
    expect(s2.damageHistory[0].B.physical).toBe(10);
    expect(s2.damageHistory[0].B.spell).toBe(5);
  });

  it("驲驹早鬼「圣德太子的天马」：跳过对抗，双方按最终威力互砍", async () => {
    const skill = sagume.skills.find((s) => s.id === "sagume-taishi")!;
    const atk = sagume.cards.find((c) => c.id === "sagume-shageki")!;
    const foe = card("foe", "对方", 8, {});
    const state = createGameState({ ...sagume }, charWith("B", 40, [foe]), 1);
    await resolveTurn(state, { card: atk, skills: [skill] }, { card: foe, skills: [] });
    // 无甲斐黑驹被动（resolveTurn 不自动加入）：A=6, B=8 → A 受 8，B 受 6
    expect(state.damageHistory[0].A.physical).toBe(8);
    expect(state.damageHistory[0].B.physical).toBe(6);
  });

  it("恋「哈德曼的妖怪少女」：强制对方打出指定符卡", async () => {
    const skill = koishi.skills.find((s) => s.id === "koishi-hartmann")!;
    const myCard = koishi.cards.find((c) => c.id === "koishi-sosen")!;
    const foeBig = card("big", "大卡", 12, {});
    const foeSmall = card("small", "小卡", 0, { damage: (ec) => dealSpell(ec, 5) });
    const decide: DecisionResolver = async () => 0;
    const state = createGameState({ ...koishi }, charWith("B", 40, [foeBig, foeSmall]), 1);
    await resolveTurn(state, { card: myCard, skills: [skill] }, { card: foeSmall, skills: [] }, decide);
    // 对方原本选的小卡被替换为大卡
    expect(state.players.B.usedCardIds).toContain("big");
    expect(state.players.B.usedCardIds).not.toContain("small");
    // A 先祖托梦 5*2=10 vs 被强制打出的 12 → A 受 2 物理
    expect(state.damageHistory[0].A.physical).toBe(2);
  });
});
