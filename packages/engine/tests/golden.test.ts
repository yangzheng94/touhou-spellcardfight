import { describe, it, expect } from "vitest";
import {
  createGameState,
  resolveTurn,
  type Card,
  type Character,
  type CardTag,
  type EffectScript,
} from "../src/index.js";
import {
  immuneAndReflect,
  dealSpell,
  multPower,
  negateEffect,
  lockHp,
  drainLife,
  immune,
} from "../src/effects.js";
import { applyDamageMods, newDamageMods, applyAbsorb } from "../src/damage.js";
import { newPowerCalc, resolvePower } from "../src/power.js";

// --- 测试辅助：构造最小符卡 / 角色 ---
function card(id: string, name: string, power: number, script: EffectScript, tags: CardTag[] = []): Card {
  return { id, name, power, text: name, tags, script };
}

function charWith(name: string, hp: number, cards: Card[]): Character {
  return { id: name, name, hp, skills: [], cards };
}

describe("规则示例 1：妖梦[西行春风斩] vs 帕秋莉[金属风暴]", () => {
  it("帕秋莉对妖梦造成1点物理，妖梦反弹3点法术给帕秋莉", async () => {
    // A = 妖梦 (HP29)  B = 帕秋莉 (HP22)
    const youmu = card("xxcfz", "奥义【西行春风斩】", 6, {
      damage: (ec) => immuneAndReflect(ec, ec.self, "spell"),
    });
    const patchouli = card("jsfb", "金符【金属风暴】", 7, {
      damage: (ec) => dealSpell(ec, 3),
    });
    const state = createGameState(charWith("妖梦", 29, [youmu]), charWith("帕秋莉", 22, [patchouli]), 1);
    await resolveTurn(state, { card: youmu, skills: [] }, { card: patchouli, skills: [] });

    // 妖梦受1物理 → 28；帕秋莉受3反弹法术 → 19
    expect(state.players.A.hp).toBe(28);
    expect(state.players.B.hp).toBe(19);
  });
});

describe("规则示例 2：生命流失绕过免疫，但固定HP可挡", () => {
  // 芙兰 被禁止的游戏：回合结束时自己流失至1，对方流失等量
  const flanScript: EffectScript = {
    turnEnd: (ec) => {
      const me = ec.ctx.state.players[ec.self];
      const loss = Math.max(0, me.hp - 1);
      drainLife(ec, loss, ec.self, ec.self); // 自己流失至1
      drainLife(ec, loss, ec.foe, ec.self); // 对方流失等量
    },
  };
  const flanCard = card("bjzdyx", "禁忌【被禁止的游戏】", 3, flanScript);

  it("2a：对方免疫一切伤害，仍死于生命流失（芙兰血量更高）", async () => {
    // 芙兰 HP15 > 萃香 HP10；萃香免疫一切
    const suika = card("yszl", "鬼符【遗失之力】", 5, {
      damage: (ec) => immune(ec, ec.self, "all"),
    });
    const state = createGameState(charWith("芙兰", 15, [flanCard]), charWith("萃香", 10, [suika]), 1);
    await resolveTurn(state, { card: flanCard, skills: [] }, { card: suika, skills: [] });
    // 芙兰流失至1；萃香流失14 → 10-14 = -4，死亡
    expect(state.players.A.hp).toBe(1);
    expect(state.players.B.hp).toBeLessThanOrEqual(0);
    expect(state.winner).toBe("A");
  });

  it("2b：对方固定HP，免于生命流失（琪露诺完美冻结）", async () => {
    // 芙兰 HP15；琪露诺 HP10 且本回合 HP 锁定
    const cirno = card("wmdj", "冻符【完美冻结】", 6, {
      turnStart: (ec) => lockHp(ec, ec.self),
    });
    const state = createGameState(charWith("芙兰", 15, [flanCard]), charWith("琪露诺", 10, [cirno]), 1);
    await resolveTurn(state, { card: flanCard, skills: [] }, { card: cirno, skills: [] });
    // 芙兰流失至1；琪露诺 HP 锁定，不受流失
    expect(state.players.A.hp).toBe(1);
    expect(state.players.B.hp).toBe(10);
    expect(state.winner).toBe(null);
  });
});

describe("规则示例 3：无效系优先级最高", () => {
  it("恋[墨迹测验]无效并减半幽香效果与威力", async () => {
    // A = 恋 (negate-effect + 威力减半)  B = 幽香 (欲造成5法术)
    const koishi = card(
      "mjcy",
      "无意识【弹幕的墨迹测验】",
      4,
      {
        priority: (ec) => negateEffect(ec, ec.foe),
        power: (ec) => multPower(ec, 0.5, ec.foe),
      },
      ["negate-effect"],
    );
    const yuuka = card("hncf", "幻想【花鸟风月】", 3, {
      damage: (ec) => dealSpell(ec, 5),
    });
    const state = createGameState(charWith("恋", 27, [koishi]), charWith("幽香", 30, [yuuka]), 1);
    await resolveTurn(state, { card: koishi, skills: [] }, { card: yuuka, skills: [] });
    // 幽香威力 3 → 减半 1；恋 4 vs 1 → 恋对幽香3物理；幽香法术被无效
    expect(state.players.B.hp).toBe(27); // 30 - 3
    expect(state.players.A.hp).toBe(27); // 无伤
  });
});

describe("计算顺序：威力 +X → 翻倍 → 变为X（向下取整）", () => {
  it("加减后翻倍", () => {
    const pc = newPowerCalc(5);
    pc.adds.push(3); // 8
    pc.mults.push(2); // 16
    expect(resolvePower(pc)).toBe(16);
  });
  it("赋值为最终值", () => {
    const pc = newPowerCalc(5);
    pc.adds.push(100);
    pc.set = 4;
    expect(resolvePower(pc)).toBe(4);
  });
  it("向下取整", () => {
    const pc = newPowerCalc(3);
    pc.mults.push(0.5); // 1.5 → 1
    expect(resolvePower(pc)).toBe(1);
  });
});

describe("伤害判定：免疫 > 至少/至多 > 反弹", () => {
  it("免疫优先于反弹（无反弹时归0）", () => {
    const m = newDamageMods();
    m.immune = true;
    expect(applyDamageMods(5, m)).toEqual({ final: 0, reflected: 0 });
  });
  it("免疫且反弹 → 反弹全部", () => {
    const m = newDamageMods();
    m.immune = true;
    m.reflect = true;
    m.reflectMult = 2;
    expect(applyDamageMods(5, m)).toEqual({ final: 0, reflected: 10 });
  });
  it("至多限制", () => {
    const m = newDamageMods();
    m.atMost = 3;
    expect(applyDamageMods(9, m).final).toBe(3);
  });
  it("至少限制", () => {
    const m = newDamageMods();
    m.atLeast = 4;
    expect(applyDamageMods(1, m).final).toBe(4);
  });
});

describe("吸收护盾：先抵物理后抵法术", () => {
  it("护盾优先抵消物理", () => {
    const r = applyAbsorb(3, 5, 4); // 4护盾：抵3物理，剩1抵法术
    expect(r).toEqual({ physical: 0, spell: 4, absorbLeft: 0 });
  });
});
