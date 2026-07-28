import type { Character } from "../types.js";
import {
  multPower,
  setPower,
  dealSpell,
  heal,
  addPower,
  negateEffect,
  lockHp,
} from "../effects.js";
import { addBuff, getRes, setRes } from "../buffs.js";
import { damageTakenTurnsAgo } from "../state.js";

/**
 * 封兽鵺  HP27
 *
 * 说明：多张符卡带 1dN 随机持续回合，用 rng.d 决定 buff turns。
 * 未确认幻想飞行少女（受某类型伤害后下回合免疫该类型）用 flags 记录。
 */
export const nue: Character = {
  id: "nue",
  name: "封兽鵺",
  hp: 27,
  skills: [
    {
      id: "nue-hikou",
      name: "未确认幻想飞行少女",
      text: "每回合若己方受到物理/法术伤害，则下回合免疫相同类型的伤害",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        apply: (ec) => {
          if (ec.ctx.dealt[ec.self].physical > 0)
            addBuff(ec, {
              id: "nue-immune-phys",
              name: "飞行少女-免疫物理",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              text: "下回合免疫物理伤害",
              category: "immune-reflect-absorb",
              script: { damage: (e) => (e.ctx.damageConfig[e.self].physical.immune = true) },
            });
          if (ec.ctx.dealt[ec.self].spell > 0)
            addBuff(ec, {
              id: "nue-immune-spell",
              name: "飞行少女-免疫法术",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              text: "下回合免疫法术伤害",
              category: "immune-reflect-absorb",
              script: { damage: (e) => (e.ctx.damageConfig[e.self].spell.immune = true) },
            });
        },
      },
    },
    {
      id: "nue-shoutai",
      name: "正体不明的真相",
      text: "每三回合一次，若己方上回合未受到物理/法术伤害，则本回合造成5点对应类型的伤害，回复5点生命值",
      cooldown: 3,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        damage: (ec) => {
          const lastPhys = damageTakenTurnsAgo(ec.ctx.state, ec.self, 1);
          const lastSpell = ec.ctx.state.damageHistory[ec.ctx.state.damageHistory.length - 1]?.[ec.self].spell ?? 0;
          if (lastPhys === 0 && lastSpell === 0) {
            dealSpell(ec, 5);
            heal(ec, 5);
          }
        },
      },
    },
    {
      id: "nue-akumu",
      name: "平安京的噩梦",
      text: "每五回合一次，本回合将己方血量变为10+1d10，对方血量变为1d10",
      cooldown: 5,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].hp = 10 + ec.ctx.rng.d(10);
          ec.ctx.state.players[ec.foe].hp = ec.ctx.rng.d(10);
        },
      },
    },
  ],
  cards: [
    {
      id: "nue-kuro",
      name: "妖云「平安时代的黑云」",
      power: 7,
      text: "在接下来的1d3回合中，对方的符卡威力下降3点",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "nue-kuro-buff",
            name: "平安黑云",
            owner: ec.self,
            turns: ec.ctx.rng.d(3) + 1,
            text: "接下来 1~3 回合对方符卡威力 -3",
            category: "power",
            script: { power: (e) => addPower(e, -3, e.foe) },
          }),
      },
    },
    {
      id: "nue-hebi",
      name: "鵺符「鵺的蛇行表演」",
      power: 5,
      text: "在接下来的1d3回合中，对方的符卡效果无效",
      tags: ["buff", "negate-effect"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "nue-hebi-buff",
            name: "蛇行表演",
            owner: ec.self,
            turns: ec.ctx.rng.d(3) + 1,
            text: "接下来 1~3 回合对方符卡效果无效",
            category: "negate",
            script: { priority: (e) => negateEffect(e, e.foe) },
          }),
      },
    },
    {
      id: "nue-red",
      name: "真相不明「愤怒的红色UFO袭来」",
      power: 9,
      text: "在接下来的1d5回合中，对方每回合受到伤害翻倍",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "nue-red-buff",
            name: "红色UFO",
            owner: ec.self,
            turns: ec.ctx.rng.d(5) + 1,
            text: "接下来 1~5 回合对方受到伤害翻倍",
            category: "damage-taken",
            script: {
              damage: (e) => {
                e.ctx.damageConfig[e.foe].physical.mults.push(2);
                e.ctx.damageConfig[e.foe].spell.mults.push(2);
              },
            },
          }),
      },
    },
    {
      id: "nue-blue",
      name: "真相不明「哀愁的蓝色UFO袭来」",
      power: 6,
      text: "在接下来的1d5回合中，己方每回合受到伤害减半",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "nue-blue-buff",
            name: "蓝色UFO",
            owner: ec.self,
            turns: ec.ctx.rng.d(5) + 1,
            text: "接下来 1~5 回合己方受到伤害减半",
            category: "damage-taken",
            script: {
              damage: (e) => {
                e.ctx.damageConfig[e.self].physical.mults.push(0.5);
                e.ctx.damageConfig[e.self].spell.mults.push(0.5);
              },
            },
          }),
      },
    },
    {
      id: "nue-green",
      name: "真相不明「忠义的绿色UFO袭来」",
      power: 7,
      text: "在接下来的1d3回合中，己方的生命值不会改变",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "nue-green-buff",
            name: "绿色UFO",
            owner: ec.self,
            turns: ec.ctx.rng.d(3) + 1,
            text: "接下来 1~3 回合己方 HP 不会改变",
            category: "hp-lock",
            script: { turnStart: (e) => lockHp(e, e.self) },
          }),
      },
    },
    {
      id: "nue-chimera",
      name: "鵺符「弹幕奇美拉」",
      power: 7,
      text: "造成1d10法术伤害，回复己方1d10的生命值",
      tags: ["spell-damage", "heal"],
      script: {
        damage: (ec) => {
          dealSpell(ec, ec.ctx.rng.d(10));
          heal(ec, ec.ctx.rng.d(10));
        },
      },
    },
    {
      id: "nue-rainbow",
      name: "真相不明「恐怖的虹色UFO袭来」",
      power: 10,
      text: "回合结束时对双方造成1d10点法术伤害。若导致双方生命均归零，则算己方获胜",
      tags: ["spell-damage"],
      script: {
        turnEnd: (ec) => {
          dealSpell(ec, ec.ctx.rng.d(10), "A", ec.self);
          dealSpell(ec, ec.ctx.rng.d(10), "B", ec.self);
          setRes(ec, ec.self, "_rainbow_win", 1);
        },
      },
    },
    {
      id: "nue-yumi",
      name: "恨弓「源三位赖政之弓」",
      power: 6,
      text: "本回合无视对方符卡威力",
      tags: [],
      script: {
        power: (ec) => setPower(ec, 0, ec.foe),
      },
    },
    {
      id: "nue-danmaku-x",
      name: "「自行星而来的弹幕X」",
      power: 8,
      text: "本回合将双方符卡效果互换",
      tags: ["reverse"],
      script: {
        turnStart: (ec) => {
          const temp = ec.ctx.cards[ec.self];
          ec.ctx.cards[ec.self] = ec.ctx.cards[ec.foe];
          ec.ctx.cards[ec.foe] = temp;
        },
      },
    },
    {
      id: "nue-tama",
      name: "未知「原理不明的妖怪玉」",
      power: 8,
      text: "若上回合受到过物理伤害，则本回合符卡威力翻倍；若上回合受到过法术伤害，则本回合对方符卡效果无效",
      tags: [],
      script: {
        turnStart: (ec) => {
          setRes(ec, ec.self, "_took_phys_last", getRes(ec, ec.self, "_took_phys_this"));
          setRes(ec, ec.self, "_took_spell_last", getRes(ec, ec.self, "_took_spell_this"));
          setRes(ec, ec.self, "_took_phys_this", 0);
          setRes(ec, ec.self, "_took_spell_this", 0);
        },
        apply: (ec) => {
          if (ec.ctx.dealt[ec.self].physical > 0) setRes(ec, ec.self, "_took_phys_this", 1);
          if (ec.ctx.dealt[ec.self].spell > 0) setRes(ec, ec.self, "_took_spell_this", 1);
        },
        power: (ec) => {
          if (getRes(ec, ec.self, "_took_phys_last") > 0) multPower(ec, 2);
        },
        priority: (ec) => {
          if (getRes(ec, ec.self, "_took_spell_last") > 0) negateEffect(ec, ec.foe);
        },
      },
    },
  ],
};
