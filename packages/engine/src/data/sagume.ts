import type { Character } from "../types.js";
import {
  multPower,
  dealSpell,
  dealPhysical,
  heal,
  drainLife,
  addAbsorb,
  addTakenDamage,
  hpOf,
  negateEffect,
  requestDecision,
} from "../effects.js";
import { addBuff } from "../buffs.js";
import { resolvePower } from "../power.js";
import { damageTakenTurnsAgo } from "../state.js";

/**
 * 骊驹早鬼  HP30
 *
 * 说明：甲斐黑驹（威力随回合数上升，法伤随回合数一半下降）为被动。
 */
export const sagume: Character = {
  id: "sagume",
  name: "骊驹早鬼",
  hp: 30,
  skills: [
    {
      id: "sagume-kai",
      name: "甲斐黑驹",
      text: "自己的符卡威力上升与当前回合数等量的值，造成的法术伤害下降回合数一半的值",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        power: (ec) => ec.ctx.power[ec.self].adds.push(ec.ctx.turn),
        // 自己造成的法术伤害下降回合数一半的值（对方受到的法术伤害减少）
        damage: (ec) => addTakenDamage(ec, ec.foe, "spell", -Math.floor(ec.ctx.turn / 2)),
      },
    },
    {
      id: "sagume-taishi",
      name: "圣德太子的天马",
      text: "每2回合一次，本回合双方威力跳过对抗结算，按各自最终威力直接扣除对方血量",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        // 仿「奶断与鬼切」：跳过威力对抗，双方按各自修正后的最终威力直接互砍。
        clash: (ec) => {
          // 先移除威力对抗已入队的物理伤害
          const cd = ec.ctx.clashDamage;
          if (cd) {
            ec.ctx.pending = ec.ctx.pending.filter(
              (p) =>
                !(
                  p.type === "physical" &&
                  p.source === cd.source &&
                  p.target === cd.target &&
                  p.amount === cd.amount
                ),
            );
            ec.ctx.clashDamage = null;
          }
          const selfPower = resolvePower(ec.ctx.power[ec.self]);
          const foePower = resolvePower(ec.ctx.power[ec.foe]);
          if (selfPower > 0) dealPhysical(ec, selfPower, ec.foe, ec.self);
          if (foePower > 0) dealPhysical(ec, foePower, ec.self, ec.foe);
        },
      },
    },
    {
      id: "sagume-saikyou",
      name: "最强最快的组长！",
      text: "每3回合一次，本回合己方造成的物理伤害X1.5",
      cooldown: 3,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        clash: (ec) => ec.ctx.damageConfig[ec.foe].physical.mults.push(1.5),
      },
    },
  ],
  cards: [
    {
      id: "sagume-shageki",
      name: "劲疾技【惊险射击】",
      power: 6,
      text: "产生4点法术伤害",
      tags: ["spell-damage"],
      script: { damage: (ec) => dealSpell(ec, 4) },
    },
    {
      id: "sagume-inazuma",
      name: "劲疾技【闪电嘶鸣】",
      power: 3,
      text: "下回合己方造成的物理伤害翻倍，造成的法术伤害X1.5",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "sagume-inazuma-buff",
            name: "闪电嘶鸣",
            owner: ec.self,
            turns: 1,
            triggers: 1,
            text: "下回合己方造成的物理伤害翻倍，法术伤害 x1.5",
            category: "damage-taken",
            script: {
              clash: (e) => e.ctx.damageConfig[e.foe].physical.mults.push(2),
              damage: (e) => e.ctx.damageConfig[e.foe].spell.mults.push(1.5),
            },
          }),
      },
    },
    {
      id: "sagume-noun",
      name: "劲疾技【浓云】",
      power: 5,
      text: "产生8点护盾，回合结束时回复剩余值的生命",
      tags: ["absorb", "heal"],
      script: {
        damage: (ec) => addAbsorb(ec, ec.self, 8),
        turnEnd: (ec) => heal(ec, ec.ctx.damageConfig[ec.self].absorb),
      },
    },
    {
      id: "sagume-kansen",
      name: "劲疾技【兽性感染】",
      power: 7,
      text: "包括本回合在内的三回合内，双方所受伤害+3",
      tags: ["buff"],
      script: {
        damage: (ec) => {
          addTakenDamage(ec, "A", "physical", 3);
          addTakenDamage(ec, "A", "spell", 3);
          addTakenDamage(ec, "B", "physical", 3);
          addTakenDamage(ec, "B", "spell", 3);
        },
        turnEnd: (ec) =>
          addBuff(ec, {
            id: "sagume-kansen-buff",
            name: "兽性感染",
            owner: ec.self,
            turns: 2,
            text: "接下来 2 回合双方所受伤害 +3",
            category: "damage-taken",
            script: {
              damage: (e) => {
                addTakenDamage(e, "A", "physical", 3);
                addTakenDamage(e, "A", "spell", 3);
                addTakenDamage(e, "B", "physical", 3);
                addTakenDamage(e, "B", "spell", 3);
              },
            },
          }),
      },
    },
    {
      id: "sagume-sankaku",
      name: "劲疾技【三角追击】",
      power: 6,
      text: "若上回合、上上回合均对对方产生伤害，则本回合无视对方符卡一半的威力和效果，己方威力翻倍",
      tags: [],
      script: {
        power: (ec) => {
          const dmgLast = damageTakenTurnsAgo(ec.ctx.state, ec.foe, 1);
          const dmgLast2 = damageTakenTurnsAgo(ec.ctx.state, ec.foe, 2);
          if (dmgLast > 0 && dmgLast2 > 0) {
            multPower(ec, 2);
            // 无视对方一半威力
            multPower(ec, 0.5, ec.foe);
            // 对方效果无效
            negateEffect(ec, ec.foe);
          }
        },
      },
    },
    {
      id: "sagume-tenma-ryuusei",
      name: "劲疾技【黑色天马流星弹】",
      power: 3,
      text: "产生3点法术伤害，造成3点生命流失，恢复己方3点HP，产生3点护盾",
      tags: ["spell-damage", "drain", "heal", "absorb"],
      script: {
        damage: (ec) => {
          dealSpell(ec, 3);
          drainLife(ec, 3, ec.foe);
          heal(ec, 3);
          addAbsorb(ec, ec.self, 3);
        },
      },
    },
    {
      id: "sagume-ugou",
      name: "劲牙【鬼形的乌合之众】",
      power: 7,
      text: "回合结束时，可将双方生命/3",
      tags: [],
      script: {
        turnEnd: async (ec) => {
          const i = await requestDecision(
            ec,
            ec.self,
            "鬼形的乌合之众：是否将双方生命变为1/3？",
            ["是", "否"],
          );
          if (i === 0) {
            ec.ctx.state.players.A.hp = Math.floor(hpOf(ec, "A") / 3);
            ec.ctx.state.players.B.hp = Math.floor(hpOf(ec, "B") / 3);
          }
        },
      },
    },
    {
      id: "sagume-cross",
      name: "天星马【天马十字】",
      power: 6,
      text: "造成（本回合对方符卡威力+回合数）X2的法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => dealSpell(ec, (resolvePower(ec.ctx.power[ec.foe]) + ec.ctx.turn) * 2),
      },
    },
  ],
};
