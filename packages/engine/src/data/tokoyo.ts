import type { Character } from "../types.js";
import { setPower, dealSpell, drainLife, heal, immune, negateEffect, hpOf } from "../effects.js";
import { addBuff, getRes, setRes } from "../buffs.js";

/**
 * 常世之神（幼虫）  HP30
 */
export const tokoyo: Character = {
  id: "tokoyo",
  name: "常世之神",
  hp: 30,
  skills: [
    {
      id: "tokoyo-kouryuu",
      name: "厄神洪流",
      text: "每二回合一次，使己方符卡威力变为0，对方符卡效果无效",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        priority: (ec) => negateEffect(ec, ec.foe),
        power: (ec) => setPower(ec, 0, ec.self),
      },
    },
    {
      id: "tokoyo-seiza",
      name: "清座之顶，仲夏之梦",
      text: "每四回合一次，使本回合双方均免疫一切伤害，下回合对对方造成等同本回合双方伤害值总和的伤害",
      cooldown: 4,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        damage: (ec) => {
          immune(ec, "A", "all");
          immune(ec, "B", "all");
        },
        apply: (ec) => {
          // 记录本回合双方伤害值总和
          const totalDmg = ec.ctx.dealt.A.physical + ec.ctx.dealt.A.spell +
                          ec.ctx.dealt.B.physical + ec.ctx.dealt.B.spell;
          setRes(ec, ec.self, "_seiza_damage", totalDmg);
        },
        turnEnd: (ec) => {
          const totalDmg = getRes(ec, ec.self, "_seiza_damage");
          if (totalDmg > 0) {
            addBuff(ec, {
              id: "tokoyo-seiza-buff",
              name: "仲夏之梦-延迟伤害",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              text: `下回合对对方造成 ${totalDmg} 点法术伤害`,
              category: "delayed-damage",
              script: {
                damage: (e) => {
                  dealSpell(e, getRes(e, e.self, "_seiza_damage"));
                  setRes(e, e.self, "_seiza_damage", 0);
                },
              },
            });
          }
        },
      },
    },
    {
      id: "tokoyo-tachibana",
      name: "常世之国不老不死之橘",
      text: "本回合受到致命伤害时，回复10点HP并存活",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnEnd: (ec) => {
          if (hpOf(ec, ec.self) <= 0) {
            ec.ctx.state.players[ec.self].hp = 10;
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "tokoyo-minute",
      name: "蝶符「Minute Scales」",
      power: 6,
      text: "本回合双方造成伤害均视为回复，回复均视为伤害",
      tags: ["reverse"],
      script: {
        turnStart: (ec) => {
          ec.ctx.state.players["A"].flags["_minute_scales"] = true;
          ec.ctx.state.players["B"].flags["_minute_scales"] = true;
        },
        turnEnd: (ec) => {
          const dA = ec.ctx.dealt.A;
          const dB = ec.ctx.dealt.B;
          const hA = ec.ctx.healed.A;
          const hB = ec.ctx.healed.B;
          ec.ctx.pending.push(
            { type: "spell", amount: dA.physical + dA.spell, source: "A", target: "A", isHeal: true },
            { type: "spell", amount: dB.physical + dB.spell, source: "B", target: "B", isHeal: true },
            { type: "spell", amount: hA, source: "A", target: "A", isDrain: true },
            { type: "spell", amount: hB, source: "B", target: "B", isDrain: true },
          );
          ec.ctx.dealt.A = { physical: 0, spell: 0 };
          ec.ctx.dealt.B = { physical: 0, spell: 0 };
          ec.ctx.healed.A = 0;
          ec.ctx.healed.B = 0;
          delete ec.ctx.state.players["A"].flags["_minute_scales"];
          delete ec.ctx.state.players["B"].flags["_minute_scales"];
        },
      },
    },
    {
      id: "tokoyo-rinpun",
      name: "蝶符「凤蝶的鳞粉」",
      power: 5,
      text: "吸收对方6点生命值，若回合结束时己方回复量少于6，则对对方造成该差值的生命流失",
      tags: ["drain"],
      script: {
        damage: (ec) => {
          drainLife(ec, 6, ec.foe);
          heal(ec, 6);
          setRes(ec, ec.self, "_rinpun_heal", 6);
        },
        turnEnd: (ec) => {
          const healed = getRes(ec, ec.self, "_rinpun_heal");
          if (healed < 6) drainLife(ec, 6 - healed, ec.foe);
        },
      },
    },
    {
      id: "tokoyo-fluttering",
      name: "蝶符「Fluttering Summer」",
      power: 3,
      text: "下回合双方回复10点HP值。在接下来与本回合对方回复量等同的回合数中，对方每回合受到3点生命流失",
      tags: ["buff", "heal"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "tokoyo-fluttering-buff",
            name: "Fluttering Summer",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            text: "下回合双方回复 10 点 HP",
            category: "heal",
            script: {
              damage: (e) => {
                heal(e, 10, "A");
                heal(e, 10, "B");
              },
            },
          }),
      },
    },
    {
      id: "tokoyo-seika",
      name: "蝶符「盛夏振翅」",
      power: 10,
      text: "对对方造成本局中双方回复量总和一半的法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          const totalHeal =
            ec.ctx.state.stats.totalHealBySide.A + ec.ctx.state.stats.totalHealBySide.B;
          dealSpell(ec, Math.floor(totalHeal / 2));
        },
      },
    },
    {
      id: "tokoyo-dream",
      name: "蝶符「Butterfly Dream」",
      power: 2,
      text: "本回合受到伤害减半，回复10点HP",
      tags: ["heal"],
      script: {
        damage: (ec) => {
          ec.ctx.damageConfig[ec.self].physical.mults.push(0.5);
          ec.ctx.damageConfig[ec.self].spell.mults.push(0.5);
          heal(ec, 10);
        },
      },
    },
    {
      id: "tokoyo-rinpun2",
      name: "蝶符「沾身难下的鳞粉」",
      power: 4,
      text: "若己方生命大于对方，则本回合对方符卡无效，下回合无法打出符卡，双方回复3HP",
      tags: ["negate-effect", "buff"],
      script: {
        priority: (ec) => {
          if (hpOf(ec, ec.self) > hpOf(ec, ec.foe)) negateEffect(ec, ec.foe);
        },
        damage: (ec) => {
          heal(ec, 3, "A");
          heal(ec, 3, "B");
        },
        apply: (ec) => {
          if (hpOf(ec, ec.self) > hpOf(ec, ec.foe))
            addBuff(ec, {
              id: "tokoyo-rinpun2-buff",
              name: "沾身鳞粉-禁手",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              text: "下回合对方无法打出符卡",
              category: "negate",
              script: { priority: (e) => (e.ctx.castNegated[e.foe] = true) },
            });
        },
      },
    },
    {
      id: "tokoyo-crazy",
      name: "梦蝶「Crazy Butterfly」",
      power: 6,
      text: "若己方生命小于对方，则本回合对方符卡威力归零，接下来的三回合中无法使用技能",
      tags: ["buff"],
      script: {
        power: (ec) => {
          if (hpOf(ec, ec.self) < hpOf(ec, ec.foe)) setPower(ec, 0, ec.foe);
        },
        apply: (ec) => {
          if (hpOf(ec, ec.self) < hpOf(ec, ec.foe))
            ec.ctx.state.players[ec.foe].flags["_skills_locked_until"] = ec.ctx.turn + 3;
        },
      },
    },
    {
      id: "tokoyo-deadly",
      name: "蝶符「Deadly Butterfly」",
      power: 0,
      text: "若本回合结束时双方生命变动值总和大于5，则接下来的两回合中己方生命不会改变",
      tags: ["buff"],
      script: {
        turnEnd: (ec) => {
          addBuff(ec, {
            id: "tokoyo-deadly-buff",
            name: "Deadly Butterfly",
            owner: ec.self,
            turns: 2,
            text: "接下来 2 回合己方 HP 不会改变",
            category: "hp-lock",
            script: { turnStart: (e) => (e.ctx.hpLocked[e.self] = true) },
          });
        },
      },
    },
    {
      id: "tokoyo-mukanohana",
      name: "常世 [无果之花]",
      power: 8,
      text: "在接下来的3回合中，对方不能以任何形式回复生命",
      tags: ["buff"],
      script: {
        turnEnd: (ec) =>
          addBuff(ec, {
            id: "tokoyo-mukanohana-buff",
            name: "无果之花",
            owner: ec.self,
            turns: 3,
            text: "接下来 3 回合对方无法回复生命",
            category: "other",
            script: { turnStart: (e) => setRes(e, e.foe, "_no_heal", 1) },
          }),
      },
    },
    {
      id: "tokoyo-joya",
      name: "常世 [常夜的暴动]",
      power: 20,
      text: "下回合对方回复10生命值",
      tags: ["buff", "heal"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "tokoyo-joya-buff",
            name: "常夜的暴动",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            text: "下回合对方回复 10 点 HP",
            category: "heal",
            script: { damage: (e) => heal(e, 10, e.foe) },
          }),
      },
    },
  ],
};
