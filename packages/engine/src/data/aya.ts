import type { Character } from "../types.js";
import {
  addPower,
  setPower,
  addTakenDamage,
  multTakenDamage,
  dealSpell,
  dealPhysical,
  drainLife,
  heal,
  immune,
  negateEffect,
  cardPowerOf,
  transferNegativeEffects,
  requestDecision,
} from "../effects.js";
import { addBuff, consumeTrigger } from "../buffs.js";

/**
 * 射命丸文  HP26
 */
export const aya: Character = {
  id: "aya",
  name: "射命丸文",
  hp: 26,
  skills: [
    {
      id: "aya-fuu",
      name: "风雨之鸦",
      text: "己方造成的第一次伤害+3",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: (ec) => {
          // 每回合开始时添加一个 buff，使下一次伤害+3
          addBuff(ec, {
            id: "aya-fuu-bonus",
            name: "风雨之鸦-伤害加成",
            owner: ec.self,
            turns: 2, // 当前回合有效
            triggers: 1, // 只触发一次
            text: "己方下一次造成的伤害 +3",
            category: "damage-taken",
            script: {
              damage: (e) => {
                addTakenDamage(e, e.foe, "physical", 3);
                addTakenDamage(e, e.foe, "spell", 3);
                consumeTrigger(e, e.self, "aya-fuu-bonus");
              },
            },
          });
        },
      },
    },
    {
      id: "aya-fujin",
      name: "风神少女",
      text: "每两回合一次，使本回合受到的伤害-3",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        damage: (ec) => {
          addTakenDamage(ec, ec.self, "physical", -3);
          addTakenDamage(ec, ec.self, "spell", -3);
        },
      },
    },
    {
      id: "aya-shime",
      name: "当日截稿",
      text: "每四回合一次，使本回合自己符卡的负面效果转移给对方",
      cooldown: 4,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        // 开启负面效果转移：己方符卡产生的负面效果会作用在对方身上
        priority: (ec) => transferNegativeEffects(ec, ec.self),
      },
    },
  ],
  cards: [
    {
      id: "aya-musou",
      name: "无双【幻想风靡】",
      power: 10,
      text: "可提升1至8点威力，此后等量的回合中每回合符卡威力-1",
      tags: ["buff"],
      script: {
        power: async (ec) => {
          const n = await requestDecision(
            ec,
            ec.self,
            "幻想风靡：提升多少点威力(1-8)？",
            [],
            { min: 1, max: 8 },
          );
          addPower(ec, n);
          addBuff(ec, {
            id: "aya-musou-decay",
            name: "幻想风靡-威力衰减",
            owner: ec.self,
            turns: n + 1,
            text: `接下来 ${n} 回合每回合符卡威力 -1`,
            category: "power",
            script: { power: (e) => addPower(e, -1) },
          });
        },
      },
    },
    {
      id: "aya-hayougi",
      name: "旋符【飘妖扇】",
      power: 8,
      text: "回合开始时使对方流失8点生命，回合结束时回复对方6点生命",
      tags: ["drain", "heal"],
      script: {
        turnStart: (ec) => drainLife(ec, 8, ec.foe),
        turnEnd: (ec) => heal(ec, 6, ec.foe),
      },
    },
    {
      id: "aya-fujinissen",
      name: "风符【风神一扇】",
      power: 10,
      text: "使对方流失5点生命，自己下回合符卡威力归0",
      tags: ["drain", "buff"],
      script: {
        damage: (ec) => drainLife(ec, 5, ec.foe),
        apply: (ec) =>
          addBuff(ec, {
            id: "aya-fujin-zero",
            name: "风神一扇-威力归0",
            owner: ec.self,
            turns: 1,
            triggers: 1,
            text: "下回合自己符卡威力归 0",
            category: "power",
            script: { power: (e) => setPower(e, 0) },
          }),
      },
    },
    {
      id: "aya-tengu",
      name: "突符【天狗巨爆流】",
      power: 10,
      text: "打出物理伤害时可令该伤害翻倍，己方下次造成的物理伤害归0",
      tags: ["buff"],
      script: {
        clash: (ec) => multTakenDamage(ec, ec.foe, "physical", 2),
        apply: (ec) =>
          addBuff(ec, {
            id: "aya-tengu-nextzero",
            name: "天狗巨爆流-下次物理归0",
            owner: ec.self,
            turns: 1,
            triggers: 1,
            text: "己方下次造成的物理伤害归 0",
            category: "damage-taken",
            script: {
              damage: (e) => {
                // 将己方造成的物理伤害归0
                e.ctx.damageConfig[e.foe].physical.atLeast = 0;
                e.ctx.damageConfig[e.foe].physical.atMost = 0;
                consumeTrigger(e, e.self, "aya-tengu-nextzero");
              },
            },
          }),
      },
    },
    {
      id: "aya-anya",
      name: "鸦符【暗夜昼魔】",
      power: 4,
      text: "造成10点法术伤害，己方下次造成的法术伤害归0",
      tags: ["spell-damage", "buff"],
      script: {
        damage: (ec) => dealSpell(ec, 10),
        apply: (ec) =>
          addBuff(ec, {
            id: "aya-anya-nextzero",
            name: "暗夜昼魔-下次法术归0",
            owner: ec.self,
            turns: 1,
            triggers: 1,
            text: "己方下次造成的法术伤害归 0",
            category: "damage-taken",
            script: {
              damage: (e) => {
                // 将己方造成的法术伤害归0
                e.ctx.damageConfig[e.foe].spell.atLeast = 0;
                e.ctx.damageConfig[e.foe].spell.atMost = 0;
                consumeTrigger(e, e.self, "aya-anya-nextzero");
              },
            },
          }),
      },
    },
    {
      id: "aya-torii",
      name: "旋风【鸟居旋风】",
      power: 5,
      text: "造成5至10点 伤害，超出5的部分会让自己在接下来等量的回合受到一点生命流失",
      tags: ["drain"],
      script: {
        damage: async (ec) => {
          const n = await requestDecision(
            ec,
            ec.self,
            "鸟居旋风：造成多少点伤害(5-10)？",
            [],
            { min: 5, max: 10 },
          );
          dealPhysical(ec, n);
          const excess = n - 5;
          if (excess > 0) {
            addBuff(ec, {
              id: "aya-torii-drain",
              name: "鸟居旋风-反噬",
              owner: ec.self,
              turns: excess + 1,
              text: `接下来 ${excess} 回合每回合自己流失 1 点生命`,
              category: "delayed-damage",
              script: { turnEnd: (e) => drainLife(e, 1, e.self, e.self) },
            });
          }
        },
      },
    },
    {
      id: "aya-teru",
      name: "塞符【天上天下的照国】",
      power: 6,
      text: "从下回合开始，双方受到的伤害+6，直至触发3次效果",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "aya-teru-plus",
            name: "照国-伤害+6",
            owner: ec.self,
            turns: -1,
            triggers: 3,
            text: "接下来 3 次受到伤害时，双方受到的伤害 +6",
            category: "damage-taken",
            script: {
              damage: (e) => {
                addTakenDamage(e, "A", "physical", 6);
                addTakenDamage(e, "A", "spell", 6);
                addTakenDamage(e, "B", "physical", 6);
                addTakenDamage(e, "B", "spell", 6);
                consumeTrigger(e, e.self, "aya-teru-plus");
              },
            },
          }),
      },
    },
    {
      id: "aya-oroshi",
      name: "风神【天狗颪】",
      power: 8,
      text: "本回合至少对对方造成（对方威力/2）的物理伤害",
      tags: [],
      script: {
        clash: (ec) => {
          ec.ctx.damageConfig[ec.foe].physical.atLeast = Math.floor(
            cardPowerOf(ec, ec.foe) / 2,
          );
        },
      },
    },
    {
      id: "aya-yachimata",
      name: "歧符【天之八衢】",
      power: 3,
      text: "造成双方威力差点法术伤害，若达到3以上则回复5点生命",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          const d = Math.abs(cardPowerOf(ec, ec.self) - cardPowerOf(ec, ec.foe));
          dealSpell(ec, d);
          if (d >= 3) heal(ec, 5);
        },
      },
    },
    {
      id: "aya-gyakufuu",
      name: "逆风【人间禁制之道】",
      power: 2,
      text: "本回合免疫伤害，对对方造成4点法术伤害，己方下回合能力失效",
      tags: ["immune", "spell-damage", "buff"],
      script: {
        damage: (ec) => {
          immune(ec, ec.self, "all");
          dealSpell(ec, 4);
        },
        apply: (ec) =>
          addBuff(ec, {
            id: "aya-gyakufuu-negate-self",
            name: "逆风-能力失效",
            owner: ec.self,
            turns: 1,
            triggers: 1,
            text: "下回合自己的能力无效",
            category: "negate",
            script: { priority: (e) => negateEffect(e, e.self) },
          }),
      },
    },
  ],
};
