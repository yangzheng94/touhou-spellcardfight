import type { Character } from "../types.js";
import { addPower, dealSpell, dealPhysical, heal, reflect, negateEffect, cardPowerOf } from "../effects.js";
import { addBuff, getRes, setRes, addRes, getFlag, setFlag } from "../buffs.js";

/**
 * 秦心  HP27
 *
 * 核心机制：面具数（resources["masks"]，开局4，每回合+1）；情绪（flags["emotion"]：忧/喜/怒）。
 * 情绪影响：忧=回复翻倍；喜=物理伤害翻倍；怒=法术伤害翻倍。
 */
export const hata: Character = {
  id: "hata",
  name: "秦心",
  hp: 27,
  skills: [
    {
      id: "hata-boushitsu",
      name: "亡失的情感",
      text: "角色对战开始时拥有4个面具，此后每回合开始时架起一个面具",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: (ec) => {
          if (getFlag(ec, ec.self, "_masks_init") !== true) {
            setFlag(ec, ec.self, "_masks_init", true);
            setRes(ec, ec.self, "masks", 4);
          }
          addRes(ec, ec.self, "masks", 1);
        },
      },
    },
    {
      id: "hata-enbu",
      name: "心绮楼演舞",
      text: "消耗任意面具数量，为自己获得等量的护盾值，该值可继承并在第二回合转化为生命恢复",
      cooldown: 1,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        damage: (ec) => {
          const m = getRes(ec, ec.self, "masks");
          const options: string[] = [];
          for (let i = 0; i <= m; i++) options.push(`${i}个`);
          const idx = ec.ctx.decide({
            player: ec.self,
            prompt: `心绮楼演舞：消耗多少个面具？（当前有${m}个）`,
            options,
          });
          if (idx > 0) {
            ec.ctx.damageConfig[ec.self].absorb += idx;
            setRes(ec, ec.self, "masks", m - idx);
            setRes(ec, ec.self, "_enbu_shield", idx);
          }
        },
        turnEnd: (ec) => {
          const shield = getRes(ec, ec.self, "_enbu_shield");
          if (shield > 0) {
            // 第二回合转化为生命恢复
            addBuff(ec, {
              id: "hata-enbu-heal",
              name: "心绮楼演舞-恢复",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              script: {
                turnStart: (e) => {
                  heal(e, getRes(e, e.self, "_enbu_shield"));
                  setRes(e, e.self, "_enbu_shield", 0);
                },
              },
            });
          }
        },
      },
    },
    {
      id: "hata-pokerface",
      name: "表情丰富的扑克脸",
      text: "回合开始时，可切换为“忧”“喜”“怒”三种情绪中的一种。在忧状态下自己的HP回复量加倍；喜状态下自己造成的物理伤害加倍；怒状态下造成的法术伤害加倍",
      cooldown: 1,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        turnStart: (ec) => {
          const i = ec.ctx.decide({
            player: ec.self,
            prompt: "扑克脸：选择情绪",
            options: ["忧(回复翻倍)", "喜(物理翻倍)", "怒(法术翻倍)"],
          });
          setFlag(ec, ec.self, "emotion", ["忧", "喜", "怒"][i]);
        },
        clash: (ec) => {
          if (getFlag(ec, ec.self, "emotion") === "喜")
            ec.ctx.damageConfig[ec.foe].physical.mults.push(2);
        },
        damage: (ec) => {
          if (getFlag(ec, ec.self, "emotion") === "怒")
            ec.ctx.damageConfig[ec.foe].spell.mults.push(2);
        },
      },
    },
  ],
  cards: [
    {
      id: "hata-dokoro",
      name: "怒面【吼怒的妖狐面】",
      power: 3,
      text: "造成等同于面具数量的法术伤害，免疫本回合所受物理伤害的一半",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          dealSpell(ec, getRes(ec, ec.self, "masks"));
          ec.ctx.damageConfig[ec.self].physical.mults.push(0.5);
        },
      },
    },
    {
      id: "hata-dosei",
      name: "怒面【怒声的大蜘蛛面】",
      power: 5,
      text: "面具数量增加2个，反射本回合受到的法术伤害",
      tags: ["reflect"],
      script: {
        turnStart: (ec) => addRes(ec, ec.self, "masks", 2),
        damage: (ec) => reflect(ec, ec.self, "spell", 1),
      },
    },
    {
      id: "hata-choukoku",
      name: "忧面【忧叹的长壁面】",
      power: 6,
      text: "产生等同于面具数量的护盾值，回复等同面具数量的HP",
      tags: ["absorb", "heal"],
      script: {
        damage: (ec) => {
          const m = getRes(ec, ec.self, "masks");
          ec.ctx.damageConfig[ec.self].absorb += m;
          healEmotion(ec, m);
        },
      },
    },
    {
      id: "hata-onibaba",
      name: "忧面【忧心的鬼婆面】",
      power: 5,
      text: "本回合所受伤害减半，下次对对方造成的法术伤害翻倍",
      tags: ["buff"],
      script: {
        damage: (ec) => {
          ec.ctx.damageConfig[ec.self].physical.mults.push(0.5);
          ec.ctx.damageConfig[ec.self].spell.mults.push(0.5);
        },
        apply: (ec) =>
          addBuff(ec, {
            id: "hata-onibaba-buff",
            name: "鬼婆面-法术翻倍",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            script: { damage: (e) => e.ctx.damageConfig[e.foe].spell.mults.push(2) },
          }),
      },
    },
    {
      id: "hata-shishi",
      name: "喜面【欢喜的狮子面】",
      power: 9,
      text: "下回合对对方产生等同本回合己方所受伤害的物理伤害",
      tags: ["buff"],
      script: {
        apply: (ec) => {
          const taken = ec.ctx.dealt[ec.self].physical + ec.ctx.dealt[ec.self].spell;
          if (taken > 0)
            addBuff(ec, {
              id: "hata-shishi-buff",
              name: "狮子面-延迟物理",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              script: { damage: (e) => dealPhysical(e, taken) },
            });
        },
      },
    },
    {
      id: "hata-hiotoko",
      name: "喜面【狂喜的火男面】",
      power: 8,
      text: "面具数量增加2个，本回合双方免疫法术伤害",
      tags: ["immune"],
      script: {
        turnStart: (ec) => addRes(ec, ec.self, "masks", 2),
        damage: (ec) => {
          ec.ctx.damageConfig.A.spell.immune = true;
          ec.ctx.damageConfig.B.spell.immune = true;
        },
      },
    },
    {
      id: "hata-hyoui",
      name: "凭依【喜怒哀乐附体】",
      power: 3,
      text: "下回合中，己方将同时触发“喜”“忧”“怒”的状态",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "hata-hyoui-buff",
            name: "喜怒哀乐附体",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            script: {
              clash: (e) => e.ctx.damageConfig[e.foe].physical.mults.push(2),
              damage: (e) => e.ctx.damageConfig[e.foe].spell.mults.push(2),
            },
          }),
      },
    },
    {
      id: "hata-anko",
      name: "神秘【假面丧心舞 暗黑能乐】",
      power: 7,
      text: "消耗全部的面具数量，造成等量的法术和物理伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          const m = getRes(ec, ec.self, "masks");
          dealSpell(ec, m);
          dealPhysical(ec, m);
          setRes(ec, ec.self, "masks", 0);
        },
      },
    },
    {
      id: "hata-ushiro",
      name: "忧符【忧世之苦不绝如轮】",
      power: 5,
      text: "本回合可消耗1个面具使对方符卡效果无效，并消耗X个面具提升等量的符卡威力",
      tags: ["negate-effect"],
      script: {
        priority: (ec) => {
          if (getRes(ec, ec.self, "masks") >= 1) {
            addRes(ec, ec.self, "masks", -1);
            negateEffect(ec, ec.foe);
          }
        },
        power: (ec) => {
          const m = getRes(ec, ec.self, "masks");
          if (m > 0) {
            addPower(ec, m);
            setRes(ec, ec.self, "masks", 0);
          }
        },
      },
    },
    {
      id: "hata-kagura",
      name: "喜符【昂扬的神乐狮子】",
      power: 3,
      text: "本回合双方符卡威力互换，己方生命值不会改变",
      tags: ["reverse"],
      script: {
        turnStart: (ec) => {
          ec.ctx.hpLocked[ec.self] = true;
        },
        power: (ec) => {
          const a = cardPowerOf(ec, "A");
          const b = cardPowerOf(ec, "B");
          ec.ctx.power.A.set = b;
          ec.ctx.power.B.set = a;
        },
      },
    },
  ],
};

// 情绪 忧 → 回复翻倍。
function healEmotion(ec: import("../types.js").EffectContext, amount: number): void {
  const mult = getFlag(ec, ec.self, "emotion") === "忧" ? 2 : 1;
  heal(ec, amount * mult);
}
