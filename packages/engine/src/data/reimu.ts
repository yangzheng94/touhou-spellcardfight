import type { Character } from "../types.js";
import { dealSpell, dealPhysical, heal, drainLife, immune, negateEffect } from "../effects.js";
import { addBuff, getRes, setRes } from "../buffs.js";

/**
 * 博丽灵梦  HP30
 */
export const reimu: Character = {
  id: "reimu",
  name: "博丽灵梦",
  hp: 30,
  skills: [
    {
      id: "reimu-miko",
      name: "永远的巫女",
      text: "你的符卡威力不会小于对方，若威力低于对方，伤害结算时将会补足至与对方本回合的威力等同值",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        power: (ec) => {
          const mine = ec.ctx.cards[ec.self]?.power ?? 0;
          const theirs = ec.ctx.cards[ec.foe]?.power ?? 0;
          if (mine < theirs) ec.ctx.power[ec.self].adds.push(theirs - mine);
        },
      },
    },
    {
      id: "reimu-youren",
      name: "东方妖恋谈",
      text: "任何对己方不利的延时BUFF类效果无效（当回合生效的效果依旧会影响）",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: (ec) => {
          const p = ec.ctx.state.players[ec.self];
          // 标记不利的延时 buff 为无效，而不是删除
          for (const b of p.buffs) {
            const badBuffs = [
              "damage-down",
              "power-down",
              "debuff",
              "_debuff",
              "dot",
              "drain",
              "衰减",
              "降低",
              "归0",
            ];
            if (badBuffs.some((tag) => b.id.toLowerCase().includes(tag) || b.name.includes(tag))) {
              b.remainingTurns = 0; // 立即结束该 buff
            }
          }
        },
      },
    },
    {
      id: "reimu-tensei",
      name: "梦想天生",
      text: "若连续四回合成功对对方造成伤害，则该回合结束时产生30点法术伤害",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnEnd: (ec) => {
          if (ec.ctx.dealt[ec.foe].physical + ec.ctx.dealt[ec.foe].spell > 0) {
            const streak = getRes(ec, ec.self, "_dmg_streak") + 1;
            setRes(ec, ec.self, "_dmg_streak", streak);
            if (streak >= 4) {
              dealSpell(ec, 30);
              setRes(ec, ec.self, "_dmg_streak", 0);
            }
          } else {
            setRes(ec, ec.self, "_dmg_streak", 0);
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "reimu-nijuu",
      name: "梦境【二重大结界】",
      power: 0,
      text: "回合结束时产生2点法术伤害和2点物理伤害",
      tags: ["spell-damage"],
      script: {
        turnEnd: (ec) => {
          dealSpell(ec, 2);
          dealPhysical(ec, 2);
        },
      },
    },
    {
      id: "reimu-san",
      name: "灵符【梦想封印 散】",
      power: 5,
      text: "产生6点法术伤害，下回合对对方产生3点法术伤害",
      tags: ["spell-damage", "buff"],
      script: {
        damage: (ec) => dealSpell(ec, 6),
        apply: (ec) =>
          addBuff(ec, {
            id: "reimu-san-buff",
            name: "梦想封印散",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            text: "下回合对对方造成 3 点法术伤害",
            category: "delayed-damage",
            script: { damage: (e) => dealSpell(e, 3) },
          }),
      },
    },
    {
      id: "reimu-jaku",
      name: "散灵【梦想封印 寂】",
      power: 0,
      text: "本回合双方免疫一切伤害，回合结束时将双方生命值流失3点",
      tags: ["immune", "drain"],
      script: {
        damage: (ec) => {
          immune(ec, "A", "all");
          immune(ec, "B", "all");
        },
        turnEnd: (ec) => {
          drainLife(ec, 3, "A", ec.self);
          drainLife(ec, 3, "B", ec.self);
        },
      },
    },
    {
      id: "reimu-fuumajin",
      name: "梦符【封魔阵】",
      power: 6,
      text: "本回合双方所受伤害减半，对方符卡效果无效",
      tags: ["negate-effect"],
      script: {
        priority: (ec) => negateEffect(ec, ec.foe),
        damage: (ec) => {
          for (const t of ["A", "B"] as const) {
            ec.ctx.damageConfig[t].physical.mults.push(0.5);
            ec.ctx.damageConfig[t].spell.mults.push(0.5);
          }
        },
      },
    },
    {
      id: "reimu-happou-oni",
      name: "神技【八方鬼缚阵】",
      power: 3,
      text: "接下来的三回合中，每回合让对方受到3点物理伤害",
      tags: ["buff"],
      script: {
        turnEnd: (ec) =>
          addBuff(ec, {
            id: "reimu-happou-oni-buff",
            name: "八方鬼缚阵",
            owner: ec.self,
            turns: 3,
            text: "接下来 3 回合每回合对对方造成 3 点物理伤害",
            category: "delayed-damage",
            script: { damage: (e) => dealPhysical(e, 3) },
          }),
      },
    },
    {
      id: "reimu-happou-ryuu",
      name: "神技【八方龙杀阵】",
      power: 3,
      text: "接下来的3回合中，每回合让对方受到3点法术伤害",
      tags: ["buff"],
      script: {
        turnEnd: (ec) =>
          addBuff(ec, {
            id: "reimu-happou-ryuu-buff",
            name: "八方龙杀阵",
            owner: ec.self,
            turns: 3,
            text: "接下来 3 回合每回合对对方造成 3 点法术伤害",
            category: "delayed-damage",
            script: { damage: (e) => dealSpell(e, 3) },
          }),
      },
    },
    {
      id: "reimu-shuu",
      name: "灵符【梦想封印 集】",
      power: 2,
      text: "产生5点法术伤害，本回合己方免疫法术伤害",
      tags: ["spell-damage", "immune"],
      script: {
        damage: (ec) => {
          immune(ec, ec.self, "spell");
          dealSpell(ec, 5);
        },
      },
    },
    {
      id: "reimu-wabi",
      name: "回灵【梦想封印 侘】",
      power: 3,
      text: "回复7点HP，造成3点生命流失",
      tags: ["heal", "drain"],
      script: {
        damage: (ec) => {
          heal(ec, 7);
          drainLife(ec, 3, ec.foe);
        },
      },
    },
    {
      id: "reimu-shun",
      name: "神灵【梦想封印 瞬】",
      power: 10,
      text: "本回合双方免疫法术伤害，对方符卡效果无效",
      tags: ["immune", "negate-effect"],
      script: {
        priority: (ec) => negateEffect(ec, ec.foe),
        damage: (ec) => {
          immune(ec, "A", "spell");
          immune(ec, "B", "spell");
        },
      },
    },
    {
      id: "reimu-nijuu-danmaku",
      name: "境界【二重弹幕结界】",
      power: 5,
      text: "本回合若受到法术伤害，则回复等量的生命值，对对方产生等量的物理伤害",
      tags: [],
      script: {
        apply: (ec) => {
          const s = ec.ctx.dealt[ec.self].spell;
          if (s > 0) {
            heal(ec, s);
            dealPhysical(ec, s);
          }
        },
      },
    },
  ],
};
