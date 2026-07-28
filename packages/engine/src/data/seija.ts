import type { Character, EffectContext } from "../types.js";
import {
  addPower,
  setPower,
  multPower,
  dealSpell,
  dealPhysical,
  immune,
  negateEffect,
  cardPowerOf,
  requestDecision,
} from "../effects.js";
import { addBuff, getRes, setRes, addRes, setFlag, getFlag } from "../buffs.js";
import type { PlayerId } from "../types.js";

/** 为复制对方效果创建 EffectContext（self/foe 互换）。 */
function ecForCopy(ec: EffectContext): EffectContext {
  return { ctx: ec.ctx, self: ec.foe, foe: ec.self };
}

/** 给目标施加一层幻觉，同时造成 1 点法术伤害，并更新/创建显示层数的 BUFF。 */
function addIllusion(ec: EffectContext, target: PlayerId) {
  addRes(ec, target, "illusion", 1);
  dealSpell(ec, 1, target, ec.self);
  const layers = getRes(ec, target, "illusion");
  const player = ec.ctx.state.players[target];
  const existing = player.buffs.find((b) => b.id === "seija-illusion");
  const text = `幻觉层数 ${layers}：触发特定效果时结算`;
  if (existing) {
    existing.text = text;
  } else {
    addBuff(ec, {
      id: "seija-illusion",
      name: "幻觉",
      owner: target,
      turns: -1,
      text,
      category: "other",
      script: {},
    });
  }
  ec.ctx.log({ type: "info", msg: `幻觉判定：${player.character.name} 陷入幻觉（当前 ${layers} 层），受到 1 点法术伤害` });
}

/** 更新幻觉层数显示 BUFF 的文本；若层数为 0 则移除。 */
function updateIllusionBuff(ec: EffectContext, target: PlayerId) {
  const layers = getRes(ec, target, "illusion");
  const player = ec.ctx.state.players[target];
  if (layers <= 0) {
    player.buffs = player.buffs.filter((b) => b.id !== "seija-illusion");
  } else {
    const existing = player.buffs.find((b) => b.id === "seija-illusion");
    if (existing) {
      existing.text = `幻觉层数 ${layers}：触发特定效果时结算`;
    }
  }
}

/**
 * 圣娅  HP24
 *
 * 核心机制：幻觉计数，存于敌方 resources["illusion"]。多张符卡会「追加幻觉判定」。
 */
export const seija: Character = {
  id: "seija",
  name: "圣娅",
  hp: 24,
  skills: [
    {
      id: "seija-shusgen",
      name: "终之幻象",
      text: "当敌方陷入幻觉时追加1点法术伤害",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        // 新机制：每次施加幻觉已由 addIllusion 附带 1 点法术伤害，
        // 此处不再额外追加，避免重复结算。
      },
    },
    {
      id: "seija-genwaku",
      name: "幻惑之狐",
      text: "每两回合可使用一次，回合结束时使敌方陷入一次幻像",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        turnEnd: (ec) => addIllusion(ec, ec.foe),
      },
    },
    {
      id: "seija-miraishi",
      name: "获知",
      text: "每三回合可使用一次，下回合对方必须先选择符卡并让己方知晓",
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
      id: "seija-ginjou",
      name: "幻狐【银色荆棘】",
      power: 6,
      text: "若使敌方受到伤害，追加一次幻觉效果，使对方下回合符卡威力减半",
      tags: ["buff"],
      script: {
        apply: (ec) => {
          const d = ec.ctx.dealt[ec.foe];
          if (d.physical + d.spell > 0) {
            addIllusion(ec, ec.foe);
            addBuff(ec, {
              id: "seija-ginjou-half",
            name: "银色荆棘-威力减半",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            text: "下回合对方符卡威力减半",
            category: "power",
            script: { power: (e) => multPower(e, 0.5, e.foe) },
            });
          }
        },
      },
    },
    {
      id: "seija-mange",
      name: "狐镜【万华之筒】",
      power: 3,
      text: "根据双方威力差的一半造成伤害，若造成伤害则追加一次幻觉判定",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          const diff = Math.abs(cardPowerOf(ec, ec.self) - cardPowerOf(ec, ec.foe));
          const dmg = Math.floor(diff / 2);
          if (dmg > 0) {
            dealSpell(ec, dmg);
            addIllusion(ec, ec.foe);
          }
        },
      },
    },
    {
      id: "seija-gyoukou",
      name: "幻狐【凝光幻剑】",
      power: 5,
      text: "按双方威力差直接对敌方造成物理伤害，并进行1次幻觉判定；若威力差大于5则再追加1次幻觉判定",
      tags: ["spell-damage"],
      script: {
        // 替代正常 clash：先记录双方威力，再将双方威力设为 0，
        // 由 damage 阶段按威力差直接造成物理伤害。
        power: (ec) => {
          setRes(ec, ec.self, "_gyoukou_self_power", cardPowerOf(ec, ec.self));
          setRes(ec, ec.self, "_gyoukou_foe_power", cardPowerOf(ec, ec.foe));
          setPower(ec, 0, ec.self);
          setPower(ec, 0, ec.foe);
        },
        damage: (ec) => {
          const selfPower = getRes(ec, ec.self, "_gyoukou_self_power");
          const foePower = getRes(ec, ec.self, "_gyoukou_foe_power");
          const diff = selfPower - foePower;
          if (diff > 0) {
            dealPhysical(ec, diff);
            addIllusion(ec, ec.foe);
            if (diff > 5) addIllusion(ec, ec.foe);
          }
        },
      },
    },
    {
      id: "seija-shitsurakuen",
      name: "终焉【失乐园】",
      power: 6,
      text: "在之后１－５回合内，每回合开始前进行一次幻觉判定",
      tags: ["buff"],
      script: {
        turnEnd: (ec) => {
          const dur = ec.ctx.rng.d(5);
          addBuff(ec, {
            id: "seija-shitsurakuen-illu",
            name: "失乐园-持续幻觉",
            owner: ec.self,
            turns: dur,
            text: `接下来 ${dur} 回合每回合开始时对方陷入一次幻觉`,
            category: "other",
            script: { turnStart: (e) => addIllusion(e, e.foe) },
          });
        },
      },
    },
    {
      id: "seija-kyouka",
      name: "幻惑【镜花水月】",
      power: 2,
      text: "降低对方符卡一半威力，并对敌方追加一次幻觉判定",
      tags: [],
      script: {
        power: (ec) => multPower(ec, 0.5, ec.foe),
        turnStart: (ec) => addIllusion(ec, ec.foe),
      },
    },
    {
      id: "seija-soumoku",
      name: "灵智【草木皆兵】",
      power: 4,
      text: "使对方效果无效，并追加一次幻觉判定",
      tags: ["negate-effect"],
      script: {
        priority: (ec) => negateEffect(ec, ec.foe),
        turnStart: (ec) => addIllusion(ec, ec.foe),
      },
    },
    {
      id: "seija-genku",
      name: "心像【幻空之境】",
      power: 3,
      text: "根据幻觉判定次数造成次数ｘ２的法术伤害，并无效之前次数／２次的幻觉判定",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          const n = getRes(ec, ec.foe, "illusion");
          dealSpell(ec, n * 2);
          setRes(ec, ec.foe, "illusion", Math.floor(n / 2));
          updateIllusionBuff(ec, ec.foe);
        },
      },
    },
    {
      id: "seija-pandora",
      name: "禁忌【潘多拉的魔盒】",
      power: 0,
      text: "威力增强1d12，造成1d12法伤",
      tags: ["spell-damage"],
      script: {
        power: (ec) => addPower(ec, ec.ctx.rng.d(12)),
        damage: (ec) => dealSpell(ec, ec.ctx.rng.d(12)),
      },
    },
    {
      id: "seija-inyou",
      name: "无想【阴阳螺旋】",
      power: 4,
      text: "复制对方符卡效果，同时将对手的符卡效果无效",
      tags: ["reverse"],
      script: {
        priority: (ec) => {
          // 使对方符卡效果无效
          ec.ctx.effectNegated[ec.foe] = true;
        },
        // 复制对方符卡效果：在对方符卡的所有阶段执行对方的 script
        turnStart: (ec) => {
          const foeCard = ec.ctx.cards[ec.foe];
          if (foeCard?.script?.turnStart) foeCard.script.turnStart(ecForCopy(ec));
        },
        power: (ec) => {
          const foeCard = ec.ctx.cards[ec.foe];
          if (foeCard?.script?.power) foeCard.script.power(ecForCopy(ec));
        },
        clash: (ec) => {
          const foeCard = ec.ctx.cards[ec.foe];
          if (foeCard?.script?.clash) foeCard.script.clash(ecForCopy(ec));
        },
        damage: (ec) => {
          const foeCard = ec.ctx.cards[ec.foe];
          if (foeCard?.script?.damage) foeCard.script.damage(ecForCopy(ec));
        },
        apply: (ec) => {
          const foeCard = ec.ctx.cards[ec.foe];
          if (foeCard?.script?.apply) foeCard.script.apply(ecForCopy(ec));
        },
        turnEnd: (ec) => {
          const foeCard = ec.ctx.cards[ec.foe];
          if (foeCard?.script?.turnEnd) foeCard.script.turnEnd(ecForCopy(ec));
        },
      },
    },
    {
      id: "seija-shinku",
      name: "接续【心空妙有】",
      power: 0,
      text: "本回合免疫物理伤害，当本回合受到法术伤害时，可追加使用一张效果中带有幻觉判定的符卡",
      tags: ["immune"],
      script: {
        damage: (ec) => immune(ec, ec.self, "physical"),
        apply: async (ec) => {
          // 如果受到法术伤害，请求选择一张幻觉符卡
          if (ec.ctx.dealt[ec.self].spell > 0) {
            const illuCards = ec.ctx.state.players[ec.self].character.cards.filter(
              (c) => c.text.includes("幻觉")
            );
            if (illuCards.length > 0) {
              const idx = await requestDecision(
                ec,
                ec.self,
                "受到法术伤害，选择一张幻觉符卡追加使用",
                illuCards.map((c) => c.name)
              );
              const chosen = illuCards[idx];
              if (chosen) {
                // 执行所选符卡的效果
                if (chosen.script.turnStart) await chosen.script.turnStart(ec);
                if (chosen.script.power) await chosen.script.power(ec);
                if (chosen.script.clash) await chosen.script.clash(ec);
                if (chosen.script.damage) await chosen.script.damage(ec);
                if (chosen.script.apply) await chosen.script.apply(ec);
                if (chosen.script.turnEnd) await chosen.script.turnEnd(ec);
              }
            }
          }
        },
      },
    },
  ],
};
