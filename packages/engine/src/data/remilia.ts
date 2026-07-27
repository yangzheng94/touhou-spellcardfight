import type { Character } from "../types.js";
import {
  addPower,
  setPower,
  dealSpell,
  heal,
  immune,
  negateEffect,
  setHp,
  hpOf,
  requestDecision,
} from "../effects.js";
import { addBuff, getRes, setRes, addRes } from "../buffs.js";

/**
 * 蕾米莉亚·斯卡雷特  HP30
 *
 * 核心机制：奏数（resources["sou"]），每回合开始+1，最大7超过变回1。
 * 己方符卡威力为奏数倍数时，对方符卡威力归0。
 */
export const remilia: Character = {
  id: "remilia",
  name: "蕾米莉亚斯卡雷特",
  hp: 30,
  skills: [
    {
      id: "remilia-shichijusou",
      name: "献给已逝王女的七重奏",
      text: "每次回合开始时提升一重奏数，最大为7，超过7时变回1。己方符卡威力为奏数的倍数时，则本回合对方符卡威力归0",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: (ec) => {
          const cur = getRes(ec, ec.self, "sou");
          const next = cur >= 7 ? 1 : cur + 1;
          setRes(ec, ec.self, "sou", next);
        },
        power: (ec) => {
          const sou = getRes(ec, ec.self, "sou");
          const myPower = ec.ctx.cards[ec.self]?.power ?? 0;
          if (sou > 0 && myPower > 0 && myPower % sou === 0) setPower(ec, 0, ec.foe);
        },
      },
    },
    {
      id: "remilia-akaisekai",
      name: "红色的世界",
      text: "2回合一次，本回合对方免疫法术伤害，下回合己方提升等量的威力",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        damage: (ec) => {
          immune(ec, ec.foe, "spell");
          ec.ctx.state.players[ec.self].flags["_akaisekai_active"] = true;
        },
        apply: (ec) => {
          if (ec.ctx.state.players[ec.self].flags["_akaisekai_active"]) {
            const prevented = ec.ctx.dealt[ec.foe].spell;
            setRes(ec, ec.self, "_akaisekai_power", prevented);
            delete ec.ctx.state.players[ec.self].flags["_akaisekai_active"];
          }
        },
        turnEnd: (ec) => {
          const savedPower = getRes(ec, ec.self, "_akaisekai_power");
          if (savedPower > 0) {
            addBuff(ec, {
              id: "remilia-akaisekai-buff",
              name: "红色的世界-威力提升",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              script: { power: (e) => addPower(e, savedPower) },
            });
            setRes(ec, ec.self, "_akaisekai_power", 0);
          }
        },
      },
    },
    {
      id: "remilia-eienkougetsu",
      name: "永远鲜红的幼月",
      text: "一次对战中限制3次，使本回合符卡提升1至回合数的威力",
      cooldown: 1,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        power: (ec) => {
          if (getRes(ec, ec.self, "_eien_used") < 3) {
            addRes(ec, ec.self, "_eien_used", 1);
            addPower(ec, ec.ctx.rng.d(Math.max(1, ec.ctx.turn)));
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "remilia-shinku",
      name: "红符【深红射击】",
      power: 6,
      text: "若本回合己方威力没有改变，则对方所受物理伤害翻倍",
      tags: [],
      script: {
        clash: (ec) => {
          if (ec.ctx.power[ec.self].adds.length === 0 && ec.ctx.power[ec.self].mults.length === 0)
            ec.ctx.damageConfig[ec.foe].physical.mults.push(2);
        },
      },
    },
    {
      id: "remilia-fuyajou",
      name: "红符【红色不夜城】",
      power: 12,
      text: "双方回复3点HP",
      tags: ["heal"],
      script: {
        damage: (ec) => {
          heal(ec, 3, "A");
          heal(ec, 3, "B");
        },
      },
    },
    {
      id: "remilia-harinoyama",
      name: "狱符【千根针的针山】",
      power: 15,
      text: "下回合对方威力+4",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "remilia-harinoyama-buff",
            name: "针山-对方威力+4",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            script: { power: (e) => addPower(e, 4, e.foe) },
          }),
      },
    },
    {
      id: "remilia-cradle",
      name: "夜符【恶魔之王的摇篮】",
      power: 10,
      text: "对方符卡威力+4，无视对方符卡能力",
      tags: ["negate-effect"],
      script: {
        priority: (ec) => negateEffect(ec, ec.foe),
        power: (ec) => addPower(ec, 4, ec.foe),
      },
    },
    {
      id: "remilia-vampire",
      name: "冥符【千年吸血鬼】",
      power: 4,
      text: "接下来的三回合中，每当对方受到伤害，己方回复4点HP",
      tags: ["buff", "heal"],
      script: {
        turnEnd: (ec) =>
          addBuff(ec, {
            id: "remilia-vampire-buff",
            name: "千年吸血鬼",
            owner: ec.self,
            turns: 3,
            script: {
              apply: (e) => {
                if (e.ctx.dealt[e.foe].physical + e.ctx.dealt[e.foe].spell > 0) heal(e, 4);
              },
            },
          }),
      },
    },
    {
      id: "remilia-gungnir",
      name: "神枪【冈格尼尔】",
      power: 4,
      text: "产生5点法术伤害，若产生的总伤害不高于5，则该效果可一直继承至产生的伤害高于5",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          const accumulated = getRes(ec, ec.self, "_gungnir_accum");
          const total = accumulated + 5;
          // 如果累计伤害+本次5点 > 5，则造成累计伤害并清零
          if (total > 5) {
            dealSpell(ec, total);
            setRes(ec, ec.self, "_gungnir_accum", 0);
          } else {
            // 否则只造成5点，并累计
            dealSpell(ec, 5);
            setRes(ec, ec.self, "_gungnir_accum", accumulated + 5);
          }
        },
      },
    },
    {
      id: "remilia-gensou",
      name: "神术【吸血鬼幻想】",
      power: 11,
      text: "可选择提升3点威力并受到3点法术伤害，或降低3点威力并对对方产生3点法术伤害",
      tags: [],
      script: {
        power: async (ec) => {
          const i = await requestDecision(
            ec,
            ec.self,
            "吸血鬼幻想：增威受伤 或 减威攻击？",
            ["威力+3并自受3法术", "威力-3并对敌3法术"],
          );
          setRes(ec, ec.self, "_gensou_choice", i);
          if (i === 0) addPower(ec, 3);
          else addPower(ec, -3);
        },
        damage: (ec) => {
          if (getRes(ec, ec.self, "_gensou_choice") === 0) dealSpell(ec, 3, ec.self, ec.self);
          else dealSpell(ec, 3, ec.foe);
        },
      },
    },
    {
      id: "remilia-akumu",
      name: "诅咒【断续的噩梦】",
      power: 5,
      text: "伤害结算后将双方生命值平均",
      tags: [],
      script: {
        turnEnd: (ec) => {
          const avg = Math.floor((hpOf(ec, "A") + hpOf(ec, "B")) / 2);
          setHp(ec, "A", avg);
          setHp(ec, "B", avg);
        },
      },
    },
    {
      id: "remilia-kudakishin",
      name: "必杀【碎心】",
      power: 2,
      text: "产生6点法术伤害，若对方威力小于己方，则本回合对方所受法术伤害翻倍",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          if ((ec.ctx.cards[ec.foe]?.power ?? 0) < (ec.ctx.cards[ec.self]?.power ?? 0))
            ec.ctx.damageConfig[ec.foe].spell.mults.push(2);
          dealSpell(ec, 6);
        },
      },
    },
    {
      id: "remilia-gensoukyou",
      name: "诅咒【红色的幻想乡】",
      power: 5,
      text: "将奏数+2并产生等同于奏数点法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          const sou = getRes(ec, ec.self, "sou") + 2;
          setRes(ec, ec.self, "sou", sou > 7 ? sou - 7 : sou);
          dealSpell(ec, getRes(ec, ec.self, "sou"));
        },
      },
    },
  ],
};
