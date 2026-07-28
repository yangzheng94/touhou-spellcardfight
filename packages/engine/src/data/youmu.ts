import type { Character } from "../types.js";
import {
  addPower,
  multPower,
  setPower,
  immuneAndReflect,
  dealSpell,
  setHp,
  requestRepeatClash,
  hpOf,
  cardPowerOf,
  multTakenDamage,
} from "../effects.js";
import { addBuff, getRes, setRes } from "../buffs.js";

/**
 * 魂魄妖梦  HP29
 *
 * 技能：
 * - 半人半灵（被动）：每次成功造成物理伤害时追加1点法术伤害
 * - 苍天的庭师（每2回合）：该回合符卡威力+2
 * - 求闻持聪明之法（每3回合）：使该回合造成的物理伤害 ×1.5
 */
export const youmu: Character = {
  id: "youmu",
  name: "魂魄妖梦",
  hp: 29,
  skills: [
    {
      id: "youmu-hanjin",
      name: "半人半灵",
      text: "每次成功造成物理伤害时追加1点法术伤害",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        // 造成物理伤害后追加 1 法术。用 apply 阶段检测 dealt。
        apply: (ec) => {
          if (ec.ctx.dealt[ec.foe].physical > 0 && !getRes(ec, ec.self, "_hanjin_done")) {
            setRes(ec, ec.self, "_hanjin_done", 1);
            dealSpell(ec, 1);
          }
        },
        turnStart: (ec) => setRes(ec, ec.self, "_hanjin_done", 0),
      },
    },
    {
      id: "youmu-souten",
      name: "苍天的庭师",
      text: "每2回合可使用一次，该回合符卡威力+2",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        power: (ec) => addPower(ec, 2),
      },
    },
    {
      id: "youmu-monji",
      name: "求闻持聪明之法",
      text: "每3回合可使用一次，使该回合造成的物理伤害×1.5",
      cooldown: 3,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        // 对手承受的物理伤害 ×1.5
        clash: (ec) => multTakenDamage(ec, ec.foe, "physical", 1.5),
      },
    },
  ],
  cards: [
    {
      id: "youmu-genseizan",
      name: "人符【现世斩】",
      power: 8,
      text: "若给对方造成伤害，则下回合对方符卡威力降低4点",
      tags: ["buff"],
      script: {
        apply: (ec) => {
          const dealt = ec.ctx.dealt[ec.foe];
          if (dealt.physical + dealt.spell > 0) {
            addBuff(ec, {
              id: "genseizan-debuff",
              name: "现世斩-威力降低",
              owner: ec.self,
              turns: 2, // 覆盖「下回合」（创建回合不计）
              triggers: 1,
              text: "下回合对方符卡威力降低 4 点",
              category: "power",
              script: { power: (e) => addPower(e, -4, e.foe) },
            });
          }
        },
      },
    },
    {
      id: "youmu-miraieigo",
      name: "人鬼【未来永劫斩】",
      power: 11,
      text: "本回合双方所受伤害翻倍",
      tags: [],
      script: {
        damage: (ec) => {
          multTakenDamage(ec, "A", "physical", 2);
          multTakenDamage(ec, "A", "spell", 2);
          multTakenDamage(ec, "B", "physical", 2);
          multTakenDamage(ec, "B", "spell", 2);
        },
      },
    },
    {
      id: "youmu-rokkon",
      name: "空观剑【六根清净斩】",
      power: 0,
      text: "本回合免疫物理伤害并双倍反还给对方",
      tags: ["immune", "reflect"],
      script: {
        damage: (ec) => immuneAndReflect(ec, ec.self, "physical", 2),
      },
    },
    {
      id: "youmu-higan",
      name: "彼岸剑【地狱极乐灭多斩】",
      power: 9,
      text: "回合结束时，可令本回合的对抗重复一次",
      tags: [],
      script: {
        turnEnd: (ec) => requestRepeatClash(ec),
      },
    },
    {
      id: "youmu-saigyou",
      name: "奥义【西行春风斩】",
      power: 6,
      text: "本回合免疫法术伤害并反弹给对方",
      tags: ["immune", "reflect"],
      script: {
        damage: (ec) => immuneAndReflect(ec, ec.self, "spell", 1),
      },
    },
    {
      id: "youmu-gokushin",
      name: "狱神剑【业风神闪斩】",
      power: 5,
      text: "回合结束时可令双方生命值减半",
      tags: [],
      script: {
        turnEnd: (ec) => {
          setHp(ec, "A", Math.floor(hpOf(ec, "A") / 2));
          setHp(ec, "B", Math.floor(hpOf(ec, "B") / 2));
        },
      },
    },
    {
      id: "youmu-rikudou",
      name: "六道剑【一念无量劫】",
      power: 3,
      text: "下回合自己符卡威力翻倍",
      tags: ["buff"],
      script: {
        turnEnd: (ec) => {
          addBuff(ec, {
            id: "rikudou-double",
            name: "一念无量劫-威力翻倍",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            text: "下回合自己符卡威力翻倍",
            category: "power",
            script: { power: (e) => multPower(e, 2) },
          });
        },
      },
    },
    {
      id: "youmu-dansou",
      name: "断想剑【草木成佛斩】",
      power: 4,
      text: "本回合无视对方符卡威力",
      tags: [],
      script: {
        // 无视对方威力：将对方威力设为 0
        power: (ec) => setPower(ec, 0, ec.foe),
      },
    },
    {
      id: "youmu-tennyo",
      name: "人智剑【天女返】",
      power: 4,
      text: "若对方威力大于自己，则格挡所受伤害的一半",
      tags: ["absorb"],
      script: {
        damage: (ec) => {
          if (cardPowerOf(ec, ec.foe) > cardPowerOf(ec, ec.self)) {
            // 格挡一半：受到的物理伤害减半
            multTakenDamage(ec, ec.self, "physical", 0.5);
            multTakenDamage(ec, ec.self, "spell", 0.5);
          }
        },
      },
    },
    {
      id: "youmu-danmei",
      name: "断命剑【冥想斩】",
      power: 5,
      text: "若受到物理伤害，则给对方产生5点法术伤害",
      tags: ["spell-damage"],
      script: {
        apply: (ec) => {
          if (ec.ctx.dealt[ec.self].physical > 0) dealSpell(ec, 5);
        },
      },
    },
  ],
};
