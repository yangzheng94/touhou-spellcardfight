import { describe, it, expect } from "vitest";
import {
  createGameState,
  resolveTurn,
  type Card,
  type Character,
  type DecisionResolver,
} from "../src/index.js";
import type { EffectScript } from "../src/types.js";
import { dealSpell, dealPhysical, addPower } from "../src/effects.js";
import { patches } from "../src/data/patches.js";
import { satori } from "../src/data/satori.js";
import { reimu } from "../src/data/reimu.js";
import { koishi } from "../src/data/koishi.js";
import { sagume } from "../src/data/sagume.js";
import { patchouli } from "../src/data/patchouli.js";
import { seija } from "../src/data/seija.js";
import { youmu } from "../src/data/youmu.js";
import { flandre } from "../src/data/flandre.js";
import { yuuka } from "../src/data/yuuka.js";
import { remilia } from "../src/data/remilia.js";
import { sakuya } from "../src/data/sakuya.js";

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
  it("正邪「阴阳螺旋」：互换双方符卡效果（威力不换）", async () => {
    const inyou = seija.cards.find((c) => c.id === "seija-inyou")!;
    const foeCard = card("foe", "对方卡", 2, { damage: (ec) => dealSpell(ec, 5) });
    const state = createGameState({ ...seija }, charWith("B", 40, [foeCard]), 1);
    await resolveTurn(state, { card: inyou, skills: [] }, { card: foeCard, skills: [] });
    // 效果互换后：A 执行对方的伤害效果（对 B 造成 5 法术），B 的效果被换走不再生效
    // 威力不换：A=4 vs B=2 → B 还受 2 物理
    expect(state.damageHistory[0].A.physical).toBe(0);
    expect(state.damageHistory[0].B.physical).toBe(2);
    expect(state.damageHistory[0].B.spell).toBe(5);
  });

  it("正邪「阴阳螺旋」：互换只作用于当回合，不污染角色全局符卡（连打两局）", async () => {
    const inyou = seija.cards.find((c) => c.id === "seija-inyou")!;
    const originalScript = inyou.script;
    const foeCard = card("foe", "对方卡", 2, { damage: (ec) => dealSpell(ec, 5) });

    // 第一局：A 用阴阳螺旋 vs 带伤害效果的对方卡 → 互换生效（A 执行对方效果）
    const state1 = createGameState({ ...seija }, charWith("B", 40, [foeCard]), 1);
    await resolveTurn(state1, { card: inyou, skills: [] }, { card: foeCard, skills: [] });
    expect(state1.damageHistory[0].B.spell).toBe(5);
    expect(state1.log.some((l) => l.msg.includes("阴阳螺旋：互换双方符卡效果"))).toBe(true);
    // 互换不应篡改角色全局符卡的 script
    expect(inyou.script).toBe(originalScript);
    // 对方卡同样不被污染（仍保留自己的 damage 效果）
    expect(foeCard.script.damage).toBeDefined();

    // 第二局：全新对局，A 再用阴阳螺旋 vs 一张无效果卡
    // 不应再执行第一局对方卡的效果（script 未被污染）
    const foeCard2 = card("foe2", "对方卡2", 2, {});
    const state2 = createGameState({ ...seija }, charWith("B", 40, [foeCard2]), 2);
    await resolveTurn(state2, { card: inyou, skills: [] }, { card: foeCard2, skills: [] });
    expect(state2.damageHistory[0].B.spell).toBe(0);
    expect(state2.log.some((l) => l.msg.includes("阴阳螺旋：互换双方符卡效果"))).toBe(true);
    expect(inyou.script).toBe(originalScript);
  });

  it("正邪「凝光幻剑」：替代威力对抗，双方按最终威力直接互砍", async () => {
    const gyoukou = seija.cards.find((c) => c.id === "seija-gyoukou")!;
    const state = createGameState({ ...seija }, charWith("B", 40, [card("foe", "对方", 8, {})]), 1);
    await resolveTurn(state, { card: gyoukou, skills: [] }, { card: card("foe", "对方", 8, {}), skills: [] });
    // 无威力对拼差伤害：A 受 8，B 受 5 + 1 次幻觉（5 不>5，仅基础 1 次）
    expect(state.damageHistory[0].A.physical).toBe(8);
    expect(state.damageHistory[0].B.physical).toBe(5);
    expect(state.damageHistory[0].B.spell).toBe(1);
  });

  it("正邪「凝光幻剑」：己方伤害大于5时追加1次幻觉判定", async () => {
    const gyoukou = seija.cards.find((c) => c.id === "seija-gyoukou")!;
    const state = createGameState({ ...seija }, charWith("B", 40, [card("foe", "对方", 1, {})]), 1);
    state.players.A.buffs.push(powerBuff("t-buff", 3));
    await resolveTurn(state, { card: gyoukou, skills: [] }, { card: card("foe", "对方", 1, {}), skills: [] });
    // A 最终 5+3=8 >5 → B 受 8 物理 + 2 次幻觉（各 1 法术）；B 威力 1 直接打 A 1 物理
    expect(state.damageHistory[0].A.physical).toBe(1);
    expect(state.damageHistory[0].B.physical).toBe(8);
    expect(state.damageHistory[0].B.spell).toBe(2);
  });

  it("正邪「凝光幻剑」：伤害大于5只追加1次幻觉（不按每满5多次追加）", async () => {
    const gyoukou = seija.cards.find((c) => c.id === "seija-gyoukou")!;
    const state = createGameState({ ...seija }, charWith("B", 40, [card("foe", "对方", 1, {})]), 1);
    state.players.A.buffs.push(powerBuff("t-buff", 6)); // 5+6=11 > 5
    await resolveTurn(state, { card: gyoukou, skills: [] }, { card: card("foe", "对方", 1, {}), skills: [] });
    // A 最终 11：基础 1 次幻觉 + 只追加 1 次（不按每满 5 重复追加）
    expect(state.damageHistory[0].A.physical).toBe(1);
    expect(state.damageHistory[0].B.physical).toBe(11);
    expect(state.damageHistory[0].B.spell).toBe(2);
  });

  it("正邪「心空妙有」：追加使用的幻觉符卡需为本场未使用过", async () => {
    const shinku = seija.cards.find((c) => c.id === "seija-shinku")!;
    // B 威力 6，其伤害效果对 A 造成 5 法术（触发心空妙有）
    const foeCard = card("foe", "对方", 6, { damage: (ec) => dealSpell(ec, 5) });
    const decide: DecisionResolver = async () => 0;
    const state = createGameState({ ...seija }, charWith("B", 40, [foeCard]), 1);
    // 银色荆棘已被使用 → 不应出现在可追加列表中
    state.players.A.usedCardIds.push("seija-ginjou");
    await resolveTurn(
      state,
      { card: shinku, skills: [] },
      { card: foeCard, skills: [] },
      decide,
    );
    // A 免疫物理；B 的 5 法术打中 A
    expect(state.damageHistory[0].A.physical).toBe(0);
    expect(state.damageHistory[0].A.spell).toBe(5);
    // 追加使用的是过滤后第一张（万华之筒）：|0-6|/2=3 法术 + 1 幻觉伤害
    expect(state.damageHistory[0].B.spell).toBe(4);
    // 已使用过的银色荆棘未被追加（其 apply 会给 A 挂银色荆棘-威力减半 buff）
    expect(state.players.A.buffs.some((b) => b.id === "seija-ginjou-half")).toBe(false);
    expect(state.players.A.usedCardIds).toContain("seija-shinku");
});

  it("幽香「幽梦」：全局偶数回合触发流失，奇数回合不触发", async () => {
    const yuumu = yuuka.skills.find((s) => s.id === "yuuka-yuumu")!;
    const state = createGameState({ ...yuuka }, charWith("B", 40, []), 1);
    await resolveTurn(state, { card: null, skills: [yuumu] }, { card: null, skills: [] });
    expect(state.players.B.hp).toBe(40); // T1 odd: no drain
    await resolveTurn(state, { card: null, skills: [yuumu] }, { card: null, skills: [] });
    expect(state.players.B.hp).toBe(39); // T2 even: drain 1
    await resolveTurn(state, { card: null, skills: [yuumu] }, { card: null, skills: [] });
    expect(state.players.B.hp).toBe(39); // T3 odd: no drain
    await resolveTurn(state, { card: null, skills: [yuumu] }, { card: null, skills: [] });
    expect(state.players.B.hp).toBe(38); // T4 even: drain 1
  });


  it("芙兰「红莓陷阱」：开局掷一次1D5，仅触发一次", async () => {
    const trap = flandre.skills.find((s) => s.id === "flan-trap")!;
    const state = createGameState({ ...flandre }, charWith("B", 40, []), 1);
    const hps = [40];
    for (let t = 1; t <= 5; t++) {
      await resolveTurn(state, { card: null, skills: [trap] }, { card: null, skills: [] });
      hps.push(state.players.B.hp);
    }
    const trapTurn = state.players.A.resources["_trap_turn"];
    expect(trapTurn).toBeGreaterThanOrEqual(1);
    expect(trapTurn).toBeLessThanOrEqual(5);
    // B hp only changes from the trap drain (1D5): exactly one drop
    let drops = 0;
    for (let i = 1; i < hps.length; i++) {
      expect(hps[i]).toBeLessThanOrEqual(hps[i - 1]);
      if (hps[i] < hps[i - 1]) drops += 1;
    }
    expect(drops).toBe(1);
    expect(40 - hps[hps.length - 1]).toBeLessThanOrEqual(5);
  });


  it("妖梦「半人半灵」：每波成功造成物理伤害各追加1法术", async () => {
    const hanjin = youmu.skills.find((s) => s.id === "youmu-hanjin")!;
    const atk = card("atk", "攻击", 5, { turnStart: (ec) => dealPhysical(ec, 2) });
    const foe = card("foe", "对方", 0, {});
    const state = createGameState({ ...youmu }, charWith("B", 40, [foe]), 1);
    await resolveTurn(state, { card: atk, skills: [hanjin] }, { card: foe, skills: [] });
    // wave1: turnStart physical 2; wave2: clash physical 5 -> 2 triggers
    expect(state.damageHistory[0].B.physical).toBe(7);
    expect(state.damageHistory[0].B.spell).toBe(2);
  });


  it("妖梦「半人半灵」：单波物理伤害只追加1法术", async () => {
    const hanjin = youmu.skills.find((s) => s.id === "youmu-hanjin")!;
    const atk = card("atk", "攻击", 5, {});
    const foe = card("foe", "对方", 0, {});
    const state = createGameState({ ...youmu }, charWith("B", 40, [foe]), 1);
    await resolveTurn(state, { card: atk, skills: [hanjin] }, { card: foe, skills: [] });
    // single wave -> 1 trigger
    expect(state.damageHistory[0].B.physical).toBe(5);
    expect(state.damageHistory[0].B.spell).toBe(1);
  });


  it("芙兰「恐怖的波动」：每波成功造成伤害各流失1D3", async () => {
    const kyoufu = flandre.skills.find((s) => s.id === "flan-kyoufu")!;
    const atk = card("atk", "攻击", 5, { turnStart: (ec) => dealSpell(ec, 2) });
    const foe = card("foe", "对方", 0, {});
    const state = createGameState({ ...flandre }, charWith("B", 40, [foe]), 1);
    await resolveTurn(state, { card: atk, skills: [kyoufu] }, { card: foe, skills: [] });
    // wave1: turnStart spell 2; wave2: clash physical 5 -> 2 drains of 1D3
    expect(state.damageHistory[0].B.physical).toBe(5);
    expect(state.damageHistory[0].B.spell).toBe(2);
    const drainTotal = 40 - state.players.B.hp - 7;
    expect(drainTotal).toBeGreaterThanOrEqual(2);
    expect(drainTotal).toBeLessThanOrEqual(6);
  });


  it("芙兰「恐怖的波动」：单波伤害只流失一次1D3", async () => {
    const kyoufu = flandre.skills.find((s) => s.id === "flan-kyoufu")!;
    const atk = card("atk", "攻击", 5, {});
    const foe = card("foe", "对方", 0, {});
    const state = createGameState({ ...flandre }, charWith("B", 40, [foe]), 1);
    await resolveTurn(state, { card: atk, skills: [kyoufu] }, { card: foe, skills: [] });
    // single wave -> 1 drain of 1D3
    expect(state.damageHistory[0].B.physical).toBe(5);
    const drainTotal = 40 - state.players.B.hp - 5;
    expect(drainTotal).toBeGreaterThanOrEqual(1);
    expect(drainTotal).toBeLessThanOrEqual(3);
  });


  it("幽香「四季鲜花之主」：跨回合累计，免疫/护盾吸收的伤害不计，触发当回合受伤计入下一轮", async () => {
    const shiki = yuuka.skills.find((s) => s.id === "yuuka-shiki")!;
    const foeSpell = card("foe", "对方", 0, { damage: (ec) => dealSpell(ec, 5) });
    const state = createGameState({ ...yuuka }, charWith("B", 40, [foeSpell]), 1);
    await resolveTurn(state, { card: null, skills: [shiki] }, { card: foeSpell, skills: [] });
    expect(state.players.A.resources["_shiki_hit_count"]).toBe(1);
    await resolveTurn(state, { card: null, skills: [shiki] }, { card: foeSpell, skills: [] });
    expect(state.players.A.resources["_shiki_hit_count"]).toBe(2);
    const foePhys = card("foe2", "对方2", 3, {});
    await resolveTurn(state, { card: null, skills: [shiki] }, { card: foePhys, skills: [] });
    // T3: activated at turnStart -> B effect negated; taking 3 physical carries count to next round
    expect(state.damageHistory[2].A.spell).toBe(0);
    expect(state.damageHistory[2].A.physical).toBe(3);
    expect(state.players.A.resources["_shiki_hit_count"]).toBe(1);
  });


  it("幽香「四季鲜花之主」：被免疫的伤害不计数", async () => {
    const shiki = yuuka.skills.find((s) => s.id === "yuuka-shiki")!;
    const defend = yuuka.cards.find((c) => c.id === "yuuka-daiousana")!;
    const foePhys = card("foe", "对方", 5, {});
    const state = createGameState({ ...yuuka }, charWith("B", 40, [foePhys]), 1);
    await resolveTurn(state, { card: defend, skills: [shiki] }, { card: foePhys, skills: [] });
    // immune damage is not counted
    expect(state.damageHistory[0].A.physical).toBe(0);
    expect(state.players.A.resources["_shiki_hit_count"] ?? 0).toBe(0);
  });


  it("蕾米「永远鲜红的幼月」：威力提升由玩家在1~回合数中选择", async () => {
    const eien = remilia.skills.find((s) => s.id === "remilia-eienkougetsu")!;
    const atk = card("atk", "攻击", 4, {});
    const foe = card("foe", "对方", 0, {});
    const log: { prompt: string; decision: number }[] = [];
    const decide: DecisionResolver = (req) => {
      if (req.range) log.push({ prompt: req.prompt, decision: req.range.max });
      return req.range ? req.range.max : 0;
    };
    const state = createGameState({ ...remilia }, charWith("B", 40, [foe]), 1);
    await resolveTurn(state, { card: atk, skills: [eien] }, { card: foe, skills: [] }, decide);
    await resolveTurn(state, { card: atk, skills: [eien] }, { card: foe, skills: [] }, decide);
    await resolveTurn(state, { card: atk, skills: [eien] }, { card: foe, skills: [] }, decide);
    // player picks 1/2/3 on turns 1/2/3
    expect(log.map((d) => d.decision)).toEqual([1, 2, 3]);
    expect(state.damageHistory[0].B.physical).toBe(5);
    expect(state.damageHistory[1].B.physical).toBe(6);
    expect(state.damageHistory[2].B.physical).toBe(7);
  });


  it("THE WORLD：结算回合的延迟伤害不吃当回合增伤（仍吃免疫/护盾/减伤）", async () => {
    const world = sakuya.cards.find((c) => c.id === "sakuya-world")!;
    const rikudou = youmu.cards.find((c) => c.id === "youmu-rikudou")!;
    const mirai = youmu.cards.find((c) => c.id === "youmu-miraieigo")!;
    const dummy = card("d", "空", 0, {});
    const hanjin = youmu.skills.find((s) => s.id === "youmu-hanjin")!;
    const monji = youmu.skills.find((s) => s.id === "youmu-monji")!;
    // B（咲夜）HP 调高避免中途死亡
    const state = createGameState({ ...youmu }, { ...sakuya, hp: 100 }, 1);
    // T1: 妖梦六道剑(3)
    await resolveTurn(state, { card: rikudou, skills: [hanjin] }, { card: dummy, skills: [] });
    // T2: 咲夜打出 THE WORLD（T3 生效减半/加倍并延迟，T4 结算）
    await resolveTurn(state, { card: dummy, skills: [hanjin] }, { card: world, skills: [] });
    // T3: 妖梦未来永劫斩(11)+求闻持：11*1.5*2*0.5=16 物理 + 1 法术，被 THE WORLD 撤销并延迟
    await resolveTurn(state, { card: mirai, skills: [hanjin, monji] }, { card: dummy, skills: [] });
    expect(state.players.B.hp).toBe(100 - 4); // 延迟撤销后 HP 恢复
    // T4: 未来永劫斩 增伤仍生效，但延迟伤害不吃它：22 新物理 + 16 延迟物理；延迟 1 法术不被 ×2
    await resolveTurn(state, { card: mirai, skills: [] }, { card: dummy, skills: [] });
    expect(state.damageHistory[3].B.physical).toBe(22 + 16);
    expect(state.damageHistory[3].B.spell).toBe(1);
    expect(state.players.B.hp).toBe(100 - 4 - 39);
  });

});
