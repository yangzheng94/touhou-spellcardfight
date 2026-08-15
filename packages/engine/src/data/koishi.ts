import type { Character } from "../types.js";
import {
  addPower,
  multPower,
  dealSpell,
  immune,
  negateEffect,
  cardPowerOf,
  requestDecision,
} from "../effects.js";
import { addBuff } from "../buffs.js";
import { resolvePower } from "../power.js";

/**
 * 古明地恋  HP27
 */
export const koishi: Character = {
  id: "koishi",
  name: "古明地恋",
  hp: 27,
  skills: [
    {
      id: "koishi-hitomi",
      name: "紧闭的恋之瞳",
      text: "每当自己或对方的威力调整时，对对方造成一点法术伤害",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        // 必须在 power 阶段全部威力调整完成后检测，因此放在 apply 阶段
        apply: (ec) => {
          const selfChanged =
            ec.ctx.power[ec.self].adds.length + ec.ctx.power[ec.self].mults.length > 0;
          const foeChanged =
            ec.ctx.power[ec.foe].adds.length + ec.ctx.power[ec.foe].mults.length > 0;
          if (selfChanged || foeChanged) {
            dealSpell(ec, 1);
          }
        },
      },
    },
    {
      id: "koishi-jinkaku",
      name: "空想上的人格",
      text: "每两回合一次，选择己方或对方的符卡使其威力上升或下降一点",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        power: async (ec) => {
          const i = await requestDecision(
            ec,
            ec.self,
            "空想上的人格：选择目标",
            ["己方威力+1", "对方威力+1", "己方威力-1", "对方威力-1"],
          );
          if (i === 0) addPower(ec, 1, ec.self);
          else if (i === 1) addPower(ec, 1, ec.foe);
          else if (i === 2) addPower(ec, -1, ec.self);
          else addPower(ec, -1, ec.foe);
        },
      },
    },
    {
      id: "koishi-hartmann",
      name: "哈德曼的妖怪少女",
      text: "每三回合一次，本回合让对方打出一张由自己选择的符卡",
      cooldown: 3,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        // manual 近似：引擎没有「替对方选卡」的出牌协议，改为出牌揭示后由己方
        // 从对方未使用过的符卡中选择一张，替换对方本回合打出的符卡。
        turnStart: async (ec) => {
          const foe = ec.ctx.state.players[ec.foe];
          const unused = foe.character.cards.filter((c) => !foe.usedCardIds.includes(c.id));
          if (unused.length === 0) {
            ec.ctx.log({ type: "info", msg: "哈德曼的妖怪少女：对方已无可用符卡，效果无效" });
            return;
          }
          const idx = await requestDecision(
            ec,
            ec.self,
            "哈德曼的妖怪少女：选择让对方本回合打出的符卡",
            unused.map((c) => c.name),
          );
          const chosen = unused[idx];
          if (!chosen) return;
          const oldCard = ec.ctx.cards[ec.foe];
          if (oldCard) {
            const i = foe.usedCardIds.indexOf(oldCard.id);
            if (i >= 0) foe.usedCardIds.splice(i, 1);
          }
          ec.ctx.cards[ec.foe] = chosen;
          ec.ctx.power[ec.foe].base = chosen.power;
          foe.usedCardIds.push(chosen.id);
          ec.ctx.log({ type: "info", msg: `哈德曼的妖怪少女：强制对方打出「${chosen.name}」` });
        },
      },
    },
  ],
  cards: [
    {
      id: "koishi-bara",
      name: "无意识【蔷薇地狱】",
      power: 13,
      text: "若对方威力低于己方，则本回合双方免疫伤害，下回合己方符卡威力提升本回合威力差值",
      tags: ["immune", "buff"],
      script: {
        damage: (ec) => {
          if (cardPowerOf(ec, ec.foe) < cardPowerOf(ec, ec.self)) {
            immune(ec, "A", "all");
            immune(ec, "B", "all");
          }
        },
        apply: (ec) => {
          const diff = cardPowerOf(ec, ec.self) - cardPowerOf(ec, ec.foe);
          if (diff > 0) {
            addBuff(ec, {
              id: "koishi-bara-buff",
              name: "蔷薇地狱-威力提升",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              text: `下回合己方符卡威力提升 ${diff} 点`,
              category: "power",
              script: { power: (e) => addPower(e, diff) },
            });
          }
        },
      },
    },
    {
      id: "koishi-sosen",
      name: "表象【先祖托梦】",
      power: 5,
      text: "本回合己方符卡威力翻倍",
      tags: [],
      script: {
        power: (ec) => multPower(ec, 2),
      },
    },
    {
      id: "koishi-fukunen",
      name: "复燃【恋爱的埋火】",
      power: 6,
      text: "对对方产生5点法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => dealSpell(ec, 5),
      },
    },
    {
      id: "koishi-paranoia",
      name: "表象【弹幕偏执症】",
      power: 7,
      text: "本回合提升（对方符卡威力-4）点威力",
      tags: [],
      script: {
        power: (ec) => addPower(ec, Math.max(0, cardPowerOf(ec, ec.foe) - 4)),
      },
    },
    {
      id: "koishi-superego",
      name: "抑制【超我】",
      power: 6,
      text: "下回合对方符卡威力下降6点",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "koishi-superego-buff",
            name: "超我-威力-6",
            owner: ec.self,
            turns: 1,
            triggers: 1,
            text: "下回合对方符卡威力下降 6 点",
            category: "power",
            script: { power: (e) => addPower(e, -6, e.foe) },
          }),
      },
    },
    {
      id: "koishi-dna",
      name: "记忆【DNA的瑕疵】",
      power: 6,
      text: "产生本次对战中出现过最高符卡威力一半的法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => dealSpell(ec, Math.floor(ec.ctx.state.stats.maxCardPower / 2)),
      },
    },
    {
      id: "koishi-rorschach",
      name: "无意识【弹幕墨迹测验】",
      power: 5,
      text: "无视对方一半的符卡威力与能力",
      tags: ["negate-effect"],
      script: {
        priority: (ec) => negateEffect(ec, ec.foe),
        power: (ec) => multPower(ec, 0.5, ec.foe),
      },
    },
    {
      id: "koishi-uso",
      name: "反应【妖怪测谎仪】",
      power: 2,
      text: "本回合双方威力互换",
      tags: ["reverse"],
      script: {
        power: (ec) => {
          // 按双方修正后的最终威力互换（set 覆盖最终值）。
          const a = resolvePower(ec.ctx.power.A);
          const b = resolvePower(ec.ctx.power.B);
          ec.ctx.power.A.set = b;
          ec.ctx.power.B.set = a;
        },
      },
    },
    {
      id: "koishi-kaihou",
      name: "本能【本我的解放】",
      power: 5,
      text: "接下来的三回合中，己方符卡威力上升一点",
      tags: ["buff"],
      script: {
        turnEnd: (ec) =>
          addBuff(ec, {
            id: "koishi-kaihou-buff",
            name: "本我的解放",
            owner: ec.self,
            turns: 3,
            text: "接下来三回合中，己方符卡威力上升 1 点",
            category: "power",
            script: { power: (e) => addPower(e, 1) },
          }),
      },
    },
    {
      id: "koishi-kensha",
      name: "抑制【被厌恶者的哲学】",
      power: 6,
      text: "本回合可选择己方提升双方符卡威力差2倍的威力，或降低对方双方符卡威力差2倍的威力",
      tags: [],
      script: {
        power: async (ec) => {
          const diff = Math.abs(cardPowerOf(ec, ec.self) - cardPowerOf(ec, ec.foe)) * 2;
          const i = await requestDecision(
            ec,
            ec.self,
            "被厌恶者的哲学：己方提升 或 降低对方？",
            [`己方威力+${diff}`, `对方威力-${diff}`],
          );
          if (i === 0) addPower(ec, diff);
          else addPower(ec, -diff, ec.foe);
        },
      },
    },
  ],
};
