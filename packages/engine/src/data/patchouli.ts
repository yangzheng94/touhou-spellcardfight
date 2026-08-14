import type { Character, EffectContext } from "../types.js";
import {
  addPower,
  dealSpell,
  heal,
  immune,
  reflect,
  addAbsorb,
  dealPhysical,
  cardPowerOf,
  hpOf,
  setPower,
} from "../effects.js";
import { resolvePower } from "../power.js";
import { getRes } from "../buffs.js";

/** 贤者之石门槛：本次对战中已打出金木水火土符各一张（由元素符卡 turnStart 记录）。 */
function kenjaUnlocked(ec: EffectContext): boolean {
  return (
    getRes(ec, ec.self, "elem_metal") === 1 &&
    getRes(ec, ec.self, "elem_fire") === 1 &&
    getRes(ec, ec.self, "elem_wood") === 1 &&
    getRes(ec, ec.self, "elem_earth") === 1 &&
    getRes(ec, ec.self, "elem_water") === 1
  );
}

/**
 * 帕秋莉·诺蕾姬  HP22
 *
 * 说明：七曜魔法（元素融合）是复杂的跨回合元素记录与融合系统，当前仅记录元素，不自动融合。
 */
export const patchouli: Character = {
  id: "patchouli",
  name: "帕秋莉诺蕾姬",
  hp: 22,
  skills: [
    {
      id: "patchouli-kadon",
      name: "花昙的魔女",
      text: "两回合一次，打出法术伤害时可将其X1.5",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      // 近似：本回合对方所受法术伤害 X1.5。
      script: {
        damage: (ec) => ec.ctx.damageConfig[ec.foe].spell.mults.push(1.5),
      },
    },
    {
      id: "patchouli-daitoshokan",
      name: "不动的大图书馆",
      text: "四回合一次，本回合免疫并反弹法术伤害",
      cooldown: 4,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        damage: (ec) => {
          immune(ec, ec.self, "spell");
          reflect(ec, ec.self, "spell", 1);
        },
      },
    },
    {
      id: "patchouli-shichiyou",
      name: "七曜魔法",
      text: "七耀魔法（占位实现）：元素融合暂未实装，当前仅记录已打出的元素；若本次对战中已打出金木水火土符各一张，则解锁金木水火土符【贤者之石】",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      // 元素融合逻辑复杂，保留占位实现（manual）：仅记录元素，不自动融合。
      // 已实装部分：集齐金木水火土各一张后解锁【贤者之石】（patchouli-kenja 检查元素资源）。
      script: {},
    },
  ],
  cards: [
    {
      id: "patchouli-ginryuu",
      name: "金符【银龙】",
      power: 8,
      text: "抵挡2点伤害",
      tags: ["absorb"],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].resources["elem_metal"] = 1;
        },
        damage: (ec) => addAbsorb(ec, ec.self, 2),
      },
    },
    {
      id: "patchouli-metalstorm",
      name: "金符【金属风暴】",
      power: 7,
      text: "产生2点物理伤害",
      tags: [],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].resources["elem_metal"] = 1;
        },
        damage: (ec) => dealPhysical(ec, 2),
      },
    },
    {
      id: "patchouli-kashin-kagayaki",
      name: "火符【火神的光辉】",
      power: 5,
      text: "产生双方威力和一半的法术伤害",
      tags: ["spell-damage"],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].resources["elem_fire"] = 1;
        },
        damage: (ec) =>
          dealSpell(ec, Math.floor((cardPowerOf(ec, ec.self) + cardPowerOf(ec, ec.foe)) / 2)),
      },
    },
    {
      id: "patchouli-kashin-wa",
      name: "火符【火神的圆环】",
      power: 4,
      text: "产生4点法术伤害，免疫本回合所受物理伤害的一半并等量提升法术伤害",
      tags: ["spell-damage"],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].resources["elem_fire"] = 1;
        },
        damage: (ec) => {
          dealSpell(ec, 4);
          ec.ctx.damageConfig[ec.self].physical.mults.push(0.5);
        },
      },
    },
    {
      id: "patchouli-suijin",
      name: "木符【翠绿风暴】",
      power: 7,
      text: "回复等同自己打出伤害的生命",
      tags: ["heal"],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].resources["elem_wood"] = 1;
        },
        apply: (ec) => {
          const d = ec.ctx.dealt[ec.foe];
          heal(ec, d.physical + d.spell);
        },
      },
    },
    {
      id: "patchouli-fuurei",
      name: "木符【风灵的角笛】",
      power: 4,
      text: "回复8点HP",
      tags: ["heal"],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].resources["elem_wood"] = 1;
        },
        damage: (ec) => heal(ec, 8),
      },
    },
    {
      id: "patchouli-doton",
      name: "土符【慵懒三石塔】",
      power: 3,
      text: "抵挡8点伤害",
      tags: ["absorb"],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].resources["elem_earth"] = 1;
        },
        damage: (ec) => addAbsorb(ec, ec.self, 8),
      },
    },
    {
      id: "patchouli-sanseki",
      name: "土符【三石塔的震动】",
      power: 5,
      text: "降低对方（双方威力差+2）的威力",
      tags: [],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].resources["elem_earth"] = 1;
        },
        power: (ec) => {
          const diff = Math.abs(cardPowerOf(ec, ec.self) - cardPowerOf(ec, ec.foe)) + 2;
          addPower(ec, -diff, ec.foe);
        },
      },
    },
    {
      id: "patchouli-mizusei",
      name: "水符【水精公主】",
      power: 4,
      text: "产生8点法术伤害",
      tags: ["spell-damage"],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].resources["elem_water"] = 1;
        },
        damage: (ec) => dealSpell(ec, 8),
      },
    },
    {
      id: "patchouli-kosou",
      name: "水符【湖葬】",
      power: 4,
      text: "产生等同己方已损失生命值的法术伤害",
      tags: ["spell-damage"],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].resources["elem_water"] = 1;
        },
        damage: (ec) => dealSpell(ec, ec.ctx.state.players[ec.self].maxHp - hpOf(ec, ec.self)),
      },
    },
    {
      id: "patchouli-hi",
      name: "日符【皇家烈焰】",
      power: 9,
      text: "若威力大于对方，则提升4点威力；若威力小于对方，则提升8点威力",
      tags: [],
      script: {
        power: (ec) => {
          // 按双方修正后的最终威力比较（此时已叠加完 buff/技能威力）。
          const selfP = resolvePower(ec.ctx.power[ec.self]);
          const foeP = resolvePower(ec.ctx.power[ec.foe]);
          if (selfP > foeP) addPower(ec, 4);
          else if (selfP < foeP) addPower(ec, 8);
        },
      },
    },
    {
      id: "patchouli-tsuki",
      name: "月符【沉静的月神】",
      power: 3,
      text: "产生10点法术伤害，并恢复本回合打出法术伤害等量的HP",
      tags: ["spell-damage", "heal"],
      script: {
        damage: (ec) => dealSpell(ec, 10),
        apply: (ec) => {
          // 按结算时实际打出的法术伤害回复（被免疫/吸收的部分不计）。
          const s = ec.ctx.dealt[ec.foe].spell;
          if (s > 0) heal(ec, s);
        },
      },
    },
    {
      id: "patchouli-kenja",
      name: "金木水火土符【贤者之石】",
      power: 5,
      text: "需本次对战中已打出金木水火土符各一张：提升己方5点威力、降低对方5点威力，造成5点法术伤害，回复5HP，抵挡5伤害",
      tags: ["spell-damage", "heal", "absorb", "manual"],
      script: {
        // 门槛：本局已打出金木水火土符各一张；未满足时各阶段检查并跳过（不臆造效果）。
        power: (ec) => {
          if (!kenjaUnlocked(ec)) {
            // 未满足条件时本卡不可使用：威力归零，不产生任何伤害、效果。
            setPower(ec, 0);
            ec.ctx.log({ type: "info", msg: "贤者之石：尚未集齐金木水火土符各一张，本卡不可使用，不产生任何效果" });
            return;
          }
          addPower(ec, 5);
          addPower(ec, -5, ec.foe);
        },
        damage: (ec) => {
          if (!kenjaUnlocked(ec)) {
            ec.ctx.log({ type: "info", msg: "贤者之石：尚未集齐金木水火土符各一张，伤害/回复/护盾效果不生效" });
            return;
          }
          dealSpell(ec, 5);
          heal(ec, 5);
          addAbsorb(ec, ec.self, 5);
        },
      },
    },
  ],
};
