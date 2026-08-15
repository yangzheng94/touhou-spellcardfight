import type { Character } from "../types.js";
import {
  dealSpell,
  dealPhysical,
  heal,
  drainLife,
  addAbsorb,
  multPower,
  hpOf,
} from "../effects.js";
import { addBuff, getRes, setRes, addRes, getFlag, setFlag } from "../buffs.js";

/**
 * 两面宿傩  HP28
 *
 * 说明：魔虚罗（每4次同类型受伤召唤HP20傀儡承担该类型伤害）是复杂的傀儡系统，当前用 resources 记录受伤次数。
 */
export const sukuna: Character = {
  id: "sukuna",
  name: "两面宿傩",
  hp: 28,
  skills: [
    {
      id: "sukuna-juou",
      name: "诅咒之王",
      text: "你的符卡效果不会被无效化，威力不受对方的效果影响",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].flags["_curse_king"] = true;
        },
      },
    },
    {
      id: "sukuna-hanten",
      name: "反转术式",
      text: "每回合开始时，回复上回合己方所受到伤害一半值的HP",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: (ec) => {
          const rec = ec.ctx.state.damageHistory[ec.ctx.state.damageHistory.length - 1];
          if (rec) {
            const taken = rec[ec.self].physical + rec[ec.self].spell;
            heal(ec, Math.floor(taken / 2));
          }
        },
      },
    },
    {
      id: "sukuna-mahoraga",
      name: "救救我魔虚罗大人",
      text: "每四次受到同类型的伤害，则会召唤出一个HP20的魔虚罗，此后所有受到的该类型伤害由魔虚罗承担，魔虚罗免疫此类型的伤害",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        apply: (ec) => {
          if (ec.ctx.dealt[ec.self].physical > 0 && !getFlag(ec, ec.self, "_mahoraga_phys")) {
            const count = addRes(ec, ec.self, "_hit_phys", 1);
            if (count >= 4) {
              setFlag(ec, ec.self, "_mahoraga_phys", true);
              addAbsorb(ec, ec.self, 20);
              addBuff(ec, {
                id: "sukuna-mahoraga-phys",
              name: "魔虚罗-物理",
              owner: ec.self,
              turns: -1,
              text: "此后免疫物理伤害",
              category: "immune-reflect-absorb",
              script: { damage: (e) => (e.ctx.damageConfig[e.self].physical.immune = true) },
              });
            }
          }
          if (ec.ctx.dealt[ec.self].spell > 0 && !getFlag(ec, ec.self, "_mahoraga_spell")) {
            const count = addRes(ec, ec.self, "_hit_spell", 1);
            if (count >= 4) {
              setFlag(ec, ec.self, "_mahoraga_spell", true);
              addAbsorb(ec, ec.self, 20);
              addBuff(ec, {
                id: "sukuna-mahoraga-spell",
              name: "魔虚罗-法术",
              owner: ec.self,
              turns: -1,
              text: "此后免疫法术伤害",
              category: "immune-reflect-absorb",
              script: { damage: (e) => (e.ctx.damageConfig[e.self].spell.immune = true) },
              });
            }
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "sukuna-hachi",
      name: "术式【捌】",
      power: 6,
      text: "造成6点法术伤害，无视对方一半的威力",
      tags: ["spell-damage"],
      script: {
        power: (ec) => multPower(ec, 0.5, ec.foe),
        damage: (ec) => dealSpell(ec, 6),
      },
    },
    {
      id: "sukuna-kai",
      name: "术式【解】",
      power: 4,
      text: "造成4点法术伤害，若上回合对对方产生了伤害，则变为造成10点法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          const rec = ec.ctx.state.damageHistory[ec.ctx.state.damageHistory.length - 1];
          const dealtLast = rec ? rec[ec.foe].physical + rec[ec.foe].spell : 0;
          dealSpell(ec, dealtLast > 0 ? 10 : 4);
        },
      },
    },
    {
      id: "sukuna-hiraki",
      name: "术式【开】",
      power: 3,
      text: "造成15点法术伤害，产生5点护盾",
      tags: ["spell-damage", "absorb"],
      script: {
        damage: (ec) => {
          dealSpell(ec, 15);
          addAbsorb(ec, ec.self, 5);
        },
      },
    },
    {
      id: "sukuna-tsuzura",
      name: "奥义【弥虚葛笼】",
      power: 6,
      text: "使对方本回合的符卡效果无效化，清除双方所有不利状态和加成（不包括冷却时间）",
      tags: ["negate-effect"],
      script: {
        priority: (ec) => {
          ec.ctx.effectNegated[ec.foe] = true;
        },
        apply: (ec) => {
          ec.ctx.state.players.A.buffs = [];
          ec.ctx.state.players.B.buffs = [];
        },
      },
    },
    {
      id: "sukuna-fukuma",
      name: "领域展开【伏魔御厨子】",
      power: 10,
      text: "从本回合开始，对方每回合受到2点物理伤害，直到己方HP降为当前HP的二分之一",
      tags: ["buff"],
      script: {
        damage: (ec) => dealPhysical(ec, 2),
        apply: (ec) => {
          const threshold = Math.floor(hpOf(ec, ec.self) / 2);
          setRes(ec, ec.self, "_fukuma_threshold", threshold);
          addBuff(ec, {
            id: "sukuna-fukuma-buff",
            name: "伏魔御厨子",
            owner: ec.self,
            turns: 99,
            text: `己方 HP 高于 ${threshold} 期间，每回合对对方造成 2 点物理伤害`,
            category: "delayed-damage",
            script: {
              damage: (e) => {
                if (hpOf(e, e.self) > getRes(e, e.self, "_fukuma_threshold")) dealPhysical(e, 2);
              },
            },
          });
        },
      },
    },
    {
      id: "sukuna-zangeki",
      name: "奥义【切裂世界的斩击】",
      power: 15,
      text: "无视对方符卡威力与护盾效果",
      tags: [],
      script: {
        power: (ec) => (ec.ctx.power[ec.foe].set = 0),
        clash: (ec) => (ec.ctx.damageConfig[ec.foe].absorb = 0),
      },
    },
    {
      id: "sukuna-keikatsu",
      name: "束缚【契阔】",
      power: 2,
      text: "本回合及下回合若对方对自己产生伤害，则造成7点生命流失",
      tags: ["buff", "drain"],
      script: {
        apply: (ec) => {
          if (ec.ctx.dealt[ec.self].physical + ec.ctx.dealt[ec.self].spell > 0) drainLife(ec, 7, ec.foe);
        },
        turnEnd: (ec) =>
          addBuff(ec, {
            id: "sukuna-keikatsu-buff",
            name: "契阔",
            owner: ec.self,
            turns: 1,
            triggers: 1,
            text: "下回合若自己受到伤害，则对方流失 7 点生命",
            category: "delayed-damage",
            script: {
              apply: (e) => {
                if (e.ctx.dealt[e.self].physical + e.ctx.dealt[e.self].spell > 0) drainLife(e, 7, e.foe);
              },
            },
          }),
      },
    },
    {
      id: "sukuna-jinbu",
      name: "咒具【神武解】",
      power: 5,
      text: "产生8点护盾，回合结束时回复剩余护盾量的生命。每因对方导致回复量降低一点，则产生差值等量的法术伤害",
      tags: ["absorb", "heal"],
      script: {
        damage: (ec) => addAbsorb(ec, ec.self, 8),
        turnEnd: (ec) => {
          const left = ec.ctx.damageConfig[ec.self].absorb;
          heal(ec, left);
          const diff = 8 - left;
          if (diff > 0) dealSpell(ec, diff);
        },
      },
    },
    {
      id: "sukuna-hiten",
      name: "咒具【飞天】",
      power: 5,
      text: "产生8点法术伤害，回复本回合己方造成伤害等量的HP",
      tags: ["spell-damage", "heal"],
      script: {
        damage: (ec) => dealSpell(ec, 8),
        apply: (ec) => {
          const d = ec.ctx.dealt[ec.foe];
          heal(ec, d.physical + d.spell);
        },
      },
    },
    {
      id: "sukuna-patch",
      name: "补丁【宿傩大人还没有用全力呢】",
      power: 0,
      text: "使己方可以在本回合与下回合维持0HP不死",
      tags: ["buff"],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players[ec.self].flags["_patch_active"] = true;
        },
        turnEnd: (ec) => {
          if (hpOf(ec, ec.self) <= 0) ec.ctx.state.players[ec.self].hp = 0;
          addBuff(ec, {
            id: "sukuna-patch-buff",
            name: "还没用全力",
            owner: ec.self,
            turns: 1,
            text: "下回合维持 0HP 不死",
            category: "other",
            script: {
              turnStart: (e) => {
                e.ctx.state.players[e.self].flags["_patch_active"] = true;
              },
              turnEnd: (e) => {
                if (hpOf(e, e.self) <= 0) e.ctx.state.players[e.self].hp = 0;
                delete e.ctx.state.players[e.self].flags["_patch_active"];
              },
            },
          });
        },
      },
    },
  ],
};
