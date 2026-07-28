import type { Character } from "../types.js";
import {
  setPower,
  dealSpell,
  drainLife,
  negateEffect,
  addTakenDamage,
} from "../effects.js";
import { addBuff, getRes, addRes } from "../buffs.js";

/**
 * 米斯蒂娅·萝蕾拉  HP25
 */
export const mystia: Character = {
  id: "mystia",
  name: "米斯蒂娅萝蕾拉",
  hp: 25,
  skills: [
    {
      id: "mystia-yamoumou",
      name: "夜盲症",
      text: "每当自己对对方产生伤害时，对方下次对自己产生的伤害降低一点(不同伤害类型可叠加)",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        apply: (ec) => {
          const d = ec.ctx.dealt[ec.foe];
          if (d.physical > 0) addRes(ec, ec.self, "yamou_phys", 1);
          if (d.spell > 0) addRes(ec, ec.self, "yamou_spell", 1);
        },
        // 下回合对方对自己造成的伤害降低（读累计值）。
        damage: (ec) => {
          const p = getRes(ec, ec.self, "yamou_phys");
          const s = getRes(ec, ec.self, "yamou_spell");
          if (p > 0) addTakenDamage(ec, ec.self, "physical", -p);
          if (s > 0) addTakenDamage(ec, ec.self, "spell", -s);
        },
      },
    },
    {
      id: "mystia-uta",
      name: "已经只能听见歌声了",
      text: "两回合一次，当自己受到伤害时，使对方流失3点生命",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        apply: (ec) => {
          if (ec.ctx.dealt[ec.self].physical + ec.ctx.dealt[ec.self].spell > 0)
            drainLife(ec, 3, ec.foe);
        },
      },
    },
    {
      id: "mystia-yami",
      name: "暗响的妖怪界",
      text: "三回合一次，本回合给对方产生负面效果时，为自己添加一个相反的正面效果",
      cooldown: 3,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].flags["_yami_active"] = true;
        },
        apply: (ec) => {
          if (ec.ctx.state.players[ec.self].flags["_yami_active"]) {
            const dealt = ec.ctx.dealt[ec.foe];
            const totalDamage = dealt.physical + dealt.spell;
            if (totalDamage > 0) {
              ec.ctx.pending.push({ type: "spell", amount: totalDamage, source: ec.self, target: ec.self, isHeal: true });
            }
            delete ec.ctx.state.players[ec.self].flags["_yami_active"];
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "mystia-yosuzume",
      name: "夜盲【夜雀之歌】",
      power: 8,
      text: "本回合让对方造成的伤害降低4点",
      tags: [],
      script: {
        clash: (ec) => {
          addTakenDamage(ec, ec.self, "physical", -4);
          addTakenDamage(ec, ec.self, "spell", -4);
        },
      },
    },
    {
      id: "mystia-mimizuku",
      name: "声符【木菟的咆哮】",
      power: 7,
      text: "若本回合对对方产生伤害，则下回合对方所受伤害翻倍",
      tags: ["buff"],
      script: {
        apply: (ec) => {
          if (ec.ctx.dealt[ec.foe].physical + ec.ctx.dealt[ec.foe].spell > 0) {
            addBuff(ec, {
              id: "mystia-mimizuku-buff",
            name: "木菟-受伤翻倍",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            text: "下回合对方所受伤害翻倍",
            category: "damage-taken",
            script: {
              damage: (e) => {
                e.ctx.damageConfig[e.foe].physical.mults.push(2);
                e.ctx.damageConfig[e.foe].spell.mults.push(2);
              },
            },
            });
          }
        },
      },
    },
    {
      id: "mystia-ga",
      name: "蛾符【天蛾的蛊道】",
      power: 4,
      text: "使对方下次所受物理伤害增加5点，法术伤害增加5点",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "mystia-ga-buff",
            name: "天蛾-受伤+5",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            text: "下次对方所受物理伤害 +5，法术伤害 +5",
            category: "damage-taken",
            script: {
              damage: (e) => {
                addTakenDamage(e, e.foe, "physical", 5);
                addTakenDamage(e, e.foe, "spell", 5);
              },
            },
          }),
      },
    },
    {
      id: "mystia-taka",
      name: "鹰符【祸延疾冲】",
      power: 2,
      text: "产生8点法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => dealSpell(ec, 8),
      },
    },
    {
      id: "mystia-gasshou",
      name: "夜雀【午夜的合唱指挥】",
      power: 4,
      text: "包括本回合在内的四回合结束时，己方回复3生命",
      tags: ["buff", "heal"],
      script: {
        turnEnd: (ec) => {
          ec.ctx.pending.push({ type: "spell", amount: 3, source: ec.self, target: ec.self, isHeal: true });
          addBuff(ec, {
            id: "mystia-gasshou-buff",
            name: "合唱指挥",
            owner: ec.self,
            turns: 3,
            text: "接下来 3 回合结束时己方回复 3 点 HP",
            category: "heal",
            script: {
              turnEnd: (e) =>
                e.ctx.pending.push({ type: "spell", amount: 3, source: e.self, target: e.self, isHeal: true }),
            },
          });
        },
      },
    },
    {
      id: "mystia-rou",
      name: "鸟符【人类的双重牢笼】",
      power: 4,
      text: "若本回合对方产生物理伤害，则对方下次产生的物理伤害归0；若本回合对方产生法术伤害，则对方下次产生的法术伤害归0",
      tags: ["buff"],
      script: {
        apply: (ec) => {
          const phys = ec.ctx.dealt[ec.self].physical > 0;
          const spell = ec.ctx.dealt[ec.self].spell > 0;
          if (phys || spell) {
            addBuff(ec, {
              id: "mystia-rou-buff",
            name: "双重牢笼",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            text: `${phys ? "对方下次造成的物理伤害归0" : ""}${phys && spell ? "，" : ""}${spell ? "对方下次造成的法术伤害归0" : ""}`,
            category: "damage-taken",
            script: {
              damage: (e) => {
                // 对方下次产生的物理/法术伤害归0
                if (phys) e.ctx.damageConfig[e.foe].physical.mults.push(0);
                if (spell) e.ctx.damageConfig[e.foe].spell.mults.push(0);
              },
            },
            });
          }
        },
      },
    },
    {
      id: "mystia-shinpi",
      name: "幻鸣【神秘歌音】",
      power: 7,
      text: "本回合无视对方符卡效果",
      tags: ["negate-effect"],
      script: {
        priority: (ec) => negateEffect(ec, ec.foe),
      },
    },
    {
      id: "mystia-fukurou",
      name: "声符【枭的夜鸣声】",
      power: 6,
      text: "吸收对方3点生命",
      tags: ["drain"],
      script: {
        damage: (ec) => {
          drainLife(ec, 3, ec.foe);
          ec.ctx.pending.push({ type: "spell", amount: 3, source: ec.self, target: ec.self, isHeal: true });
        },
      },
    },
    {
      id: "mystia-doku",
      name: "猛毒【毒蛾的鳞粉】",
      power: 3,
      text: "产生3法术伤害，本回合所受物理伤害最大为3，在此后与本回合所受物理伤害等量的回合中，回合结束时对方流失3HP",
      tags: ["spell-damage", "buff"],
      script: {
        damage: (ec) => {
          dealSpell(ec, 3);
          ec.ctx.damageConfig[ec.self].physical.atMost = 3;
        },
        apply: (ec) => {
          const taken = ec.ctx.dealt[ec.self].physical;
          if (taken > 0) {
            addBuff(ec, {
              id: "mystia-doku-buff",
              name: "毒蛾鳞粉",
              owner: ec.self,
              turns: taken + 1,
              text: `接下来 ${taken} 回合每回合对方流失 3 点 HP`,
              category: "delayed-damage",
              script: { turnEnd: (e) => drainLife(e, 3, e.foe) },
            });
          }
        },
      },
    },
    {
      id: "mystia-shitsumei",
      name: "幻奏【失明的夜雀】",
      power: 3,
      text: "若本回合自己受到物理伤害，则产生8点法术伤害，对方下回合符卡威力归0",
      tags: ["spell-damage", "buff"],
      script: {
        apply: (ec) => {
          if (ec.ctx.dealt[ec.self].physical > 0) {
            dealSpell(ec, 8);
            addBuff(ec, {
              id: "mystia-shitsumei-buff",
              name: "失明的夜雀",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              text: "下回合对方符卡威力归 0",
              category: "power",
              script: { power: (e) => setPower(e, 0, e.foe) },
            });
          }
        },
      },
    },
  ],
};
