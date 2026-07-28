import type { Character } from "../types.js";
import {
  addPower,
  multTakenDamage,
  dealSpell,
  dealPhysical,
  drainLife,
  heal,
  immuneAndReflect,
  negateEffect,
  adjustHp,
  hpOf,
  cardPowerOf,
} from "../effects.js";
import { healedTurnsAgo } from "../state.js";
import { addBuff, getFlag, setFlag, getRes, setRes } from "../buffs.js";

/**
 * 芙兰朵露·斯卡雷特  HP29
 */
export const flandre: Character = {
  id: "flandre",
  name: "芙兰朵露斯卡雷特",
  hp: 29,
  skills: [
    {
      id: "flan-kyoufu",
      name: "恐怖的波动",
      text: "每次成功造成伤害时，使对方流失1D3的生命",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: (ec) => setFlag(ec, ec.self, "_kyoufu_done", false),
        apply: (ec) => {
          const d = ec.ctx.dealt[ec.foe];
          if (d.physical + d.spell > 0 && !getFlag(ec, ec.self, "_kyoufu_done")) {
            setFlag(ec, ec.self, "_kyoufu_done", true);
            drainLife(ec, ec.ctx.rng.d(3), ec.foe);
          }
        },
      },
    },
    {
      id: "flan-imouto",
      name: "恶魔之妹",
      text: "回合开始之际，当自己生命大于15时每回合流失3点生命；当生命小于等于15时每回合回复3点生命",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: (ec) => {
          if (hpOf(ec, ec.self) > 15) adjustHp(ec, ec.self, -3);
          else adjustHp(ec, ec.self, 3);
        },
      },
    },
    {
      id: "flan-trap",
      name: "红莓陷阱",
      text: "在第1D5回合结束时，使自己恢复1D5的HP，对方流失1D5的HP",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: (ec) => {
          if (getRes(ec, ec.self, "_trap_turn") === 0) {
            setRes(ec, ec.self, "_trap_turn", ec.ctx.rng.d(5));
          }
        },
        turnEnd: (ec) => {
          if (ec.ctx.turn === getRes(ec, ec.self, "_trap_turn")) {
            adjustHp(ec, ec.self, ec.ctx.rng.d(5));
            drainLife(ec, ec.ctx.rng.d(5), ec.foe);
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "flan-kinka",
      name: "禁忌【禁果】",
      power: 9,
      text: "打出伤害时回复等量的生命",
      tags: ["heal"],
      script: {
        apply: (ec) => {
          const d = ec.ctx.dealt[ec.foe];
          const t = d.physical + d.spell;
          if (t > 0) heal(ec, t);
        },
      },
    },
    {
      id: "flan-laevatein",
      name: "禁忌【莱瓦汀】",
      power: 8,
      text: "若未对对方造成伤害，则下回合威力+8，此效果继承至对对方造成伤害",
      tags: ["buff"],
      script: {
        apply: (ec) => {
          const d = ec.ctx.dealt[ec.foe];
          if (d.physical + d.spell === 0) {
            addBuff(ec, {
              id: "flan-laevatein-buff",
              name: "莱瓦汀-威力+8",
              owner: ec.self,
              turns: -1,
              text: "威力 +8，直到对对方造成伤害后移除",
              category: "power",
              script: {
                power: (e) => addPower(e, 8),
                apply: (e) => {
                  const dealt = e.ctx.dealt[e.foe];
                  if (dealt.physical + dealt.spell > 0) {
                    e.ctx.state.players[e.self].buffs = e.ctx.state.players[e.self].buffs.filter(
                      (b) => b.id !== "flan-laevatein-buff",
                    );
                  }
                },
              },
            });
          }
        },
      },
    },
    {
      id: "flan-fourfold",
      name: "禁忌【四重存在】",
      power: 7,
      text: "本回合打出伤害X4",
      tags: [],
      script: {
        damage: (ec) => {
          multTakenDamage(ec, ec.foe, "physical", 4);
          multTakenDamage(ec, ec.foe, "spell", 4);
        },
      },
    },
    {
      id: "flan-kagome",
      name: "禁忌【笼女游戏】",
      power: 0,
      text: "无视对方效果，产生7点法术伤害",
      tags: ["negate-effect", "spell-damage"],
      script: {
        priority: (ec) => negateEffect(ec, ec.foe),
        damage: (ec) => dealSpell(ec, 7),
      },
    },
    {
      id: "flan-maze",
      name: "禁忌【恋之迷宫】",
      power: 4,
      text: "若对方威力大于4则造成5点法术伤害，若本回合对方造成法术伤害小于5则造成4点法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          if (cardPowerOf(ec, ec.foe) > 4) dealSpell(ec, 5);
        },
        apply: (ec) => {
          if (ec.ctx.dealt[ec.self].spell < 5) dealSpell(ec, 4);
        },
      },
    },
    {
      id: "flan-forbidden",
      name: "禁忌【被禁止的游戏】",
      power: 4,
      text: "回合结束后将自己HP流失至1点，对方流失等量的生命",
      tags: ["drain"],
      script: {
        turnEnd: (ec) => {
          const loss = Math.max(0, hpOf(ec, ec.self) - 1);
          drainLife(ec, loss, ec.self, ec.self);
          drainLife(ec, loss, ec.foe, ec.self);
        },
      },
    },
    {
      id: "flan-starbow",
      name: "禁弹【星弧破碎】",
      power: 4,
      text: "双方流失现有生命值的三分之一，产生等同自己流失生命值的法术伤害",
      tags: ["drain", "spell-damage"],
      script: {
        damage: (ec) => {
          const lossSelf = Math.floor(hpOf(ec, ec.self) / 3);
          const lossFoe = Math.floor(hpOf(ec, ec.foe) / 3);
          drainLife(ec, lossSelf, ec.self, ec.self);
          drainLife(ec, lossFoe, ec.foe, ec.self);
          dealSpell(ec, lossSelf);
        },
      },
    },
    {
      id: "flan-reflect",
      name: "禁弹【折反射】",
      power: 5,
      text: "免疫并反弹本回合所受到的伤害",
      tags: ["immune", "reflect"],
      script: {
        damage: (ec) => immuneAndReflect(ec, ec.self, "all", 1),
      },
    },
    {
      id: "flan-qed",
      name: "QED【495年的波纹】",
      power: 2,
      text: "本回合自己受到的物理伤害X2，对方受到的法术伤害X2.5。产生等同于自己所受物理伤害的法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          multTakenDamage(ec, ec.self, "physical", 2);
          multTakenDamage(ec, ec.foe, "spell", 2.5);
        },
        apply: (ec) => dealSpell(ec, ec.ctx.dealt[ec.self].physical),
      },
    },
    {
      id: "flan-alone",
      name: "秘弹【之后就一个人都没有了吗？】",
      power: 17,
      text: "造成伤害时，自己受到等量伤害并回复上回合双方治疗之和的生命",
      tags: [],
      script: {
        apply: (ec) => {
          const d = ec.ctx.dealt[ec.foe];
          const t = d.physical + d.spell;
          if (t > 0) {
            dealPhysical(ec, t, ec.self, ec.foe);
            const lastHealA = healedTurnsAgo(ec.ctx.state, "A", 1);
            const lastHealB = healedTurnsAgo(ec.ctx.state, "B", 1);
            heal(ec, lastHealA + lastHealB);
          }
        },
      },
    },
  ],
};
