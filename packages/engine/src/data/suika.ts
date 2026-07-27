import type { Character } from "../types.js";
import {
  multPower,
  dealSpell,
  heal,
  immune,
  addTakenDamage,
  addAbsorb,
  cardPowerOf,
  hpOf,
  requestDecision,
} from "../effects.js";
import { addBuff, getRes, setRes, getFlag, setFlag } from "../buffs.js";

/**
 * 伊吹萃香  HP29
 */
export const suika: Character = {
  id: "suika",
  name: "伊吹萃香",
  hp: 29,
  skills: [
    {
      id: "suika-taiko",
      name: "太古的时代",
      text: "自己所受物理伤害与法术伤害降低1点",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        damage: (ec) => {
          addTakenDamage(ec, ec.self, "physical", -1);
          addTakenDamage(ec, ec.self, "spell", -1);
        },
      },
    },
    {
      id: "suika-saigetsu",
      name: "碎月",
      text: "每3回合一次，本回合符卡威力翻倍，无视对方减伤效果（不包括免疫）",
      cooldown: 3,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        power: (ec) => multPower(ec, 2),
      },
    },
    {
      id: "suika-suishuu",
      name: "萃集的梦想",
      text: "每2回合一次，打出法术伤害时可令自己恢复等量的生命；回复生命时，可打出等量的法术伤害",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        apply: (ec) => {
          const spellDealt = ec.ctx.dealt[ec.foe].spell;
          const healed = ec.ctx.healed[ec.self];
          if (spellDealt > 0) {
            heal(ec, spellDealt);
          }
          if (healed > 0) {
            dealSpell(ec, healed);
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "suika-rengoku",
      name: "地狱【炼狱气息】",
      power: 7,
      text: "若本回合给对方造成伤害，则下回合产生所造成伤害两倍的护盾值",
      tags: ["buff", "absorb"],
      script: {
        apply: (ec) => {
          const d = ec.ctx.dealt[ec.foe].physical + ec.ctx.dealt[ec.foe].spell;
          if (d > 0)
            addBuff(ec, {
              id: "suika-rengoku-buff",
              name: "炼狱气息-护盾",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              script: { damage: (e) => addAbsorb(e, e.self, d * 2) },
            });
        },
      },
    },
    {
      id: "suika-togakushi",
      name: "萃符【户隐山之投】",
      power: 10,
      text: "若本回合给对方造成伤害，且自己生命小于对方，则产生3点法术伤害",
      tags: ["spell-damage"],
      script: {
        apply: (ec) => {
          if (
            ec.ctx.dealt[ec.foe].physical + ec.ctx.dealt[ec.foe].spell > 0 &&
            hpOf(ec, ec.self) < hpOf(ec, ec.foe)
          )
            dealSpell(ec, 3);
        },
      },
    },
    {
      id: "suika-sanpo",
      name: "四天王奥义【三步必杀】",
      power: 9,
      text: "本回合可将符卡威力翻倍，若未击杀对方则己方死亡",
      tags: [],
      script: {
        power: async (ec) => {
          const i = await requestDecision(
            ec,
            ec.self,
            "三步必杀：是否将符卡威力翻倍？（未击杀对方则己方死亡）",
            ["是", "否"],
          );
          if (i === 0) {
            multPower(ec, 2);
            setFlag(ec, ec.self, "_sanpo_active", true);
          }
        },
        turnEnd: (ec) => {
          if (getFlag(ec, ec.self, "_sanpo_active") && hpOf(ec, ec.foe) > 0) {
            ec.ctx.state.players[ec.self].hp = 0;
            setFlag(ec, ec.self, "_sanpo_active", false);
          }
        },
      },
    },
    {
      id: "suika-hyakki",
      name: "鬼群【百鬼秃童】",
      power: 6,
      text: "下回合给对方产生7点法术伤害",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "suika-hyakki-buff",
            name: "百鬼秃童",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            script: { damage: (e) => dealSpell(e, 7) },
          }),
      },
    },
    {
      id: "suika-kibaku",
      name: "醉神【鬼缚之术】",
      power: 5,
      text: "回复（12-对方符卡威力）点HP",
      tags: ["heal"],
      script: {
        damage: (ec) => heal(ec, Math.max(0, 12 - cardPowerOf(ec, ec.foe))),
      },
    },
    {
      id: "suika-mumu",
      name: "疏符【六里雾中】",
      power: 8,
      text: "回合结束时，回复等同本回合对方生命变化值的HP",
      tags: ["heal"],
      script: {
        turnStart: (ec) => setRes(ec, ec.self, "_foe_hp_start", hpOf(ec, ec.foe)),
        turnEnd: (ec) => {
          const change = Math.abs(hpOf(ec, ec.foe) - getRes(ec, ec.self, "_foe_hp_start"));
          heal(ec, change);
        },
      },
    },
    {
      id: "suika-gaki",
      name: "醉梦【施饿鬼缚之术】",
      power: 5,
      text: "若本回合未给对方造成物理伤害，则回复5点HP",
      tags: ["heal"],
      script: {
        apply: (ec) => {
          if (ec.ctx.dealt[ec.foe].physical === 0) heal(ec, 5);
        },
      },
    },
    {
      id: "suika-ishitsu",
      name: "鬼符【遗失之力】",
      power: 6,
      text: "本回合免疫一切伤害",
      tags: ["immune"],
      script: {
        damage: (ec) => immune(ec, ec.self, "all"),
      },
    },
    {
      id: "suika-ooeyama",
      name: "鬼符【大江山悉皆杀】",
      power: 4,
      text: "产生与对方符卡威力等值的法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => dealSpell(ec, cardPowerOf(ec, ec.foe)),
      },
    },
    {
      id: "suika-kadan",
      name: "火弹【地灵活性弹】",
      power: 7,
      text: "下回合造成的法术伤害+6",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "suika-kadan-buff",
            name: "地灵活性弹",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            script: { damage: (e) => e.ctx.damageConfig[e.foe].spell.adds.push(6) },
          }),
      },
    },
  ],
};
