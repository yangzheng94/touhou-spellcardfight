import type { Character } from "../types.js";
import { addPower, dealSpell, heal, cardPowerOf, multTakenDamage, requestDecision } from "../effects.js";
import { addBuff, setFlag, getFlag } from "../buffs.js";

/**
 * 古明地觉  HP24
 */
export const satori: Character = {
  id: "satori",
  name: "古明地觉",
  hp: 24,
  skills: [
    {
      id: "satori-hitomi",
      name: "睁开的觉之瞳",
      text: "每当己方或敌方回复生命/产生法术伤害时，提升一点威力",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        apply: (ec) => {
          const spell = ec.ctx.dealt.A.spell + ec.ctx.dealt.B.spell;
          const healed = ec.ctx.healed.A + ec.ctx.healed.B;
          if (spell > 0 || healed > 0) {
            // 添加下回合威力+1的buff
            addBuff(ec, {
              id: "satori-hitomi-buff",
              name: "觉之瞳-威力提升",
              owner: ec.self,
              turns: 1,
              triggers: 1,
              text: "下回合己方符卡威力提升 1 点",
              category: "power",
              script: {
                power: (e) => {
                  addPower(e, 1);
                  // 触发后移除buff
                  e.ctx.state.players[e.self].buffs = e.ctx.state.players[e.self].buffs.filter(
                    (b) => b.id !== "satori-hitomi-buff",
                  );
                },
              },
            });
          }
        },
      },
    },
    {
      id: "satori-koei",
      name: "孤影悄然的心病",
      text: "每两回合一次，回复2点HP或产生1点法术伤害",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        turnStart: async (ec) => {
          const i = await requestDecision(
            ec,
            ec.self,
            "孤影悄然：回复2HP 或 产生1法术？",
            ["回复2HP", "产生1点法术伤害"],
          );
          if (i === 0) heal(ec, 2);
          else dealSpell(ec, 1);
        },
      },
    },
    {
      id: "satori-onryou",
      name: "怨灵也为之恐惧的少女",
      text: "每三回合一次，下回合对方必须先选择符卡并让己方知晓",
      cooldown: 3,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        turnStart: (ec) => {
          if (!getFlag(ec, ec.self, "_foresight_triggered")) {
            setFlag(ec, ec.self, "foresight", true);
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "satori-kyoufu",
      name: "想起【恐怖的回忆】",
      power: 7,
      text: "提升本次对战中出现过最高法术伤害一半的威力",
      tags: [],
      script: {
        power: (ec) => addPower(ec, Math.floor(ec.ctx.state.stats.maxSpellDamage / 2)),
      },
    },
    {
      id: "satori-aphrodite",
      name: "想起【阿弗洛狄特的蔷薇园】",
      power: 0,
      text: "产生13点法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => dealSpell(ec, 13),
      },
    },
    {
      id: "satori-oboro",
      name: "想起【朦胧的表意识】",
      power: 6,
      text: "本回合复制对方符卡效果（只复制效果，不复制威力）",
      tags: ["reverse"],
      script: {
        turnStart: (ec) => {
          // 只复制对方符卡的效果（script），保留本符卡的基础威力 6（“只执行能力效果部分”）。
          const oppCard = ec.ctx.cards[ec.foe];
          const selfCard = ec.ctx.cards[ec.self];
          if (oppCard?.script && selfCard) {
            ec.ctx.cards[ec.self] = { ...oppCard, power: selfCard.power };
          }
        },
      },
    },
    {
      id: "satori-shinka",
      name: "心花【羞于留影之蔷薇】",
      power: 6,
      text: "回复6点HP",
      tags: ["heal"],
      script: {
        damage: (ec) => heal(ec, 6),
      },
    },
    {
      id: "satori-mushin",
      name: "心理【无心之书】",
      power: 3,
      text: "下回合产生法术伤害时，恢复等量的生命",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "satori-mushin-buff",
            name: "无心之书",
            owner: ec.self,
            turns: 1,
            triggers: 1,
            text: "下回合产生法术伤害时，恢复等量的生命",
            category: "heal",
            script: {
              apply: (e) => {
                if (e.ctx.dealt[e.foe].spell > 0) heal(e, e.ctx.dealt[e.foe].spell);
              },
            },
          }),
      },
    },
    {
      id: "satori-shimon",
      name: "脑符【脑指纹测谎法】",
      power: 5,
      text: "本回合互换双方打出的符卡",
      tags: ["reverse"],
      script: {
        // 互换双方打出的符卡：在 preTurnStart 阶段互换（先于 turnStart 收集效果源），
        // 使本回合双方从 turnStart 起即执行对方的符卡脚本；同步互换威力基数，
        // 使威力计算跟随互换后的符卡。仅互换 ctx.cards 引用，不修改角色全局符卡对象。
        preTurnStart: (ec) => {
          const selfCard = ec.ctx.cards[ec.self];
          const foeCard = ec.ctx.cards[ec.foe];
          if (selfCard && foeCard) {
            ec.ctx.cards[ec.self] = foeCard;
            ec.ctx.cards[ec.foe] = selfCard;
            const tempBase = ec.ctx.power[ec.self].base;
            ec.ctx.power[ec.self].base = ec.ctx.power[ec.foe].base;
            ec.ctx.power[ec.foe].base = tempBase;
          }
        },
      },
    },
    {
      id: "satori-butai",
      name: "想起【心身的舞台】",
      power: 8,
      text: "本回合对方的技能无效化",
      tags: ["negate-effect"],
      script: {
        priority: (ec) => {
          ec.ctx.state.players[ec.foe].flags["_skills_negated_turn"] = ec.ctx.turn;
        },
      },
    },
    {
      id: "satori-daigata",
      name: "暗示【意识的代替形态】",
      power: 0,
      text: "本回合受到伤害减半，下回合造成的法术伤害与回复量翻倍",
      tags: ["buff"],
      script: {
        damage: (ec) => {
          ec.ctx.damageConfig[ec.self].physical.mults.push(0.5);
          ec.ctx.damageConfig[ec.self].spell.mults.push(0.5);
        },
        apply: (ec) =>
          addBuff(ec, {
            id: "satori-daigata-buff",
            name: "意识的代替形态",
            owner: ec.self,
            turns: 1,
            triggers: 1,
            text: "下回合造成的法术伤害与回复量翻倍",
            category: "heal",
            script: {
              damage: (e) => {
                multTakenDamage(e, e.foe, "spell", 2);
              },
              apply: (e) => {
                const dealt = e.ctx.dealt[e.foe];
                if (dealt.spell > 0) {
                  dealSpell(e, dealt.spell);
                }
              },
            },
          }),
      },
    },
    {
      id: "satori-nihanshoku",
      name: "心结【二反色】",
      power: 5,
      text: "接下来的三回合中，每回合产生一点法术伤害",
      tags: ["buff", "spell-damage"],
      script: {
        turnEnd: (ec) =>
          addBuff(ec, {
            id: "satori-nihanshoku-buff",
            name: "二反色",
            owner: ec.self,
            turns: 3,
            text: "接下来三回合中，每回合产生 1 点法术伤害",
            category: "delayed-damage",
            script: { damage: (e) => dealSpell(e, 1) },
          }),
      },
    },
    {
      id: "satori-suishou",
      name: "心晶【水色孪晶】",
      power: 6,
      text: "本回合可选择造成双方符卡威力差2倍的法术伤害，或回复双方符卡威力差2倍的HP",
      tags: ["spell-damage", "heal"],
      script: {
        turnStart: async (ec) => {
          const diff = Math.abs(cardPowerOf(ec, ec.self) - cardPowerOf(ec, ec.foe)) * 2;
          const i = await requestDecision(
            ec,
            ec.self,
            "水色孪晶：造成法术 或 回复？",
            [`造成${diff}法术伤害`, `回复${diff}HP`],
          );
          if (i === 0) dealSpell(ec, diff);
          else heal(ec, diff);
        },
      },
    },
  ],
};
