import type { Character } from "../types.js";
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
} from "../effects.js";

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
      text: "打出单元素魔法时可与上回合的符卡元素融合，各取其一半的效果并采用本回合符卡的威力；若本次对战中已打出金木水火土符各一张，则可使用金木水火土符【贤者之石】",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      // 元素融合逻辑复杂，manual 近似：仅记录元素，不自动融合。
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
  ],
};
