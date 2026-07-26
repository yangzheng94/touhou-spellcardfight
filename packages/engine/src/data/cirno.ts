import type { Character } from "../types.js";
import {
  dealSpell,
  heal,
  lockHp,
  cardPowerOf,
  multTakenDamage,
  immune,
  addAbsorb,
  hpOf,
} from "../effects.js";
import { addBuff, getRes, setRes } from "../buffs.js";
import { totalDamageTurnsAgo } from "../state.js";

/**
 * 琪露诺  HP26
 */
export const cirno: Character = {
  id: "cirno",
  name: "琪露诺",
  hp: 26,
  skills: [
    {
      id: "cirno-lake",
      name: "湖之妖精",
      text: "当自己的HP不高于9时，每回合所受伤害的上限为3",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        damage: (ec) => {
          if (hpOf(ec, ec.self) <= 9) {
            ec.ctx.damageConfig[ec.self].physical.atMost = 3;
            ec.ctx.damageConfig[ec.self].spell.atMost = 3;
          }
        },
      },
    },
    {
      id: "cirno-icemaker",
      name: "剑式制冰器",
      text: "每3回合一次，对自己造成3点法术伤害，下回合对对方造成6点法术伤害",
      cooldown: 3,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        damage: (ec) => dealSpell(ec, 3, ec.self, ec.self),
        turnEnd: (ec) =>
          addBuff(ec, {
            id: "cirno-icemaker-next",
            name: "制冰器-延迟6法术",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            script: {
              damage: (e) => {
                dealSpell(e, 6, e.foe);
                // 触发后移除buff
                e.ctx.state.players[e.self].buffs = e.ctx.state.players[e.self].buffs.filter(
                  (b) => b.id !== "cirno-icemaker-next",
                );
              },
            },
          }),
      },
    },
    {
      id: "cirno-cold",
      name: "不自然的冷气",
      text: "每2回合结束后令自己受到1点法术伤害，对对方造成2点法术伤害",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnEnd: (ec) => {
          if (ec.ctx.turn % 2 === 0) {
            dealSpell(ec, 1, ec.self, ec.self);
            dealSpell(ec, 2, ec.foe);
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "cirno-bakufu",
      name: "冰符【冰瀑】",
      power: 6,
      text: "下回合吸收（本回合己方威力/对方威力）四倍的伤害",
      tags: ["buff", "absorb"],
      script: {
        apply: (ec) => {
          const ratio = Math.floor(cardPowerOf(ec, ec.self) / Math.max(1, cardPowerOf(ec, ec.foe))) * 4;
          // 在turnEnd添加buff，确保下回合的damage阶段生效
          addBuff(ec, {
            id: "cirno-bakufu-shield",
            name: "冰瀑-吸收",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            script: {
              damage: (e) => {
                addAbsorb(e, e.self, ratio);
                // 触发后移除buff
                e.ctx.state.players[e.self].buffs = e.ctx.state.players[e.self].buffs.filter(
                  (b) => b.id !== "cirno-bakufu-shield",
                );
              },
            },
          });
        },
      },
    },
    {
      id: "cirno-icebeam",
      name: "冰符【冰柱机枪】",
      power: 8,
      text: "产生与本回合所受法伤等值的法术伤害",
      tags: ["spell-damage"],
      script: {
        apply: (ec) => dealSpell(ec, ec.ctx.dealt[ec.self].spell),
      },
    },
    {
      id: "cirno-sprinkler",
      name: "冰块【冷冻洒水器】",
      power: 9,
      text: "本回合对方所受伤害X1.5",
      tags: [],
      script: {
        damage: (ec) => {
          multTakenDamage(ec, ec.foe, "physical", 1.5);
          multTakenDamage(ec, ec.foe, "spell", 1.5);
        },
      },
    },
    {
      id: "cirno-negk",
      name: "冻符【负K】",
      power: 3,
      text: "产生上回合双方所受伤害总和的法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => dealSpell(ec, totalDamageTurnsAgo(ec.ctx.state, 1)),
      },
    },
    {
      id: "cirno-freeze",
      name: "冻符【完美冻结】",
      power: 6,
      text: "使自己下回合的HP不会改变",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "cirno-freeze-lock",
            name: "完美冻结-HP锁定",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            script: {
              turnStart: (e) => {
                lockHp(e, e.self);
                // 触发后移除buff
                e.ctx.state.players[e.self].buffs = e.ctx.state.players[e.self].buffs.filter(
                  (b) => b.id !== "cirno-freeze-lock",
                );
              },
            },
          }),
      },
    },
    {
      id: "cirno-hail",
      name: "雹符【冰雹暴风】",
      power: 4,
      text: "回复双方威力之和的HP",
      tags: ["heal"],
      script: {
        damage: (ec) => heal(ec, cardPowerOf(ec, ec.self) + cardPowerOf(ec, ec.foe)),
      },
    },
    {
      id: "cirno-frost",
      name: "霜符【冰袭方阵】",
      power: 4,
      text: "使包括本回合在内的三回合内，己方受伤的总上限为6",
      tags: ["buff"],
      script: {
        turnStart: (ec) => {
          // 初始化剩余可承受伤害为6
          setRes(ec, ec.self, "frost_shield", 6);
        },
        damage: (ec) => {
          const left = getRes(ec, ec.self, "frost_shield");
          if (left > 0) {
            ec.ctx.damageConfig[ec.self].physical.atMost = left;
            ec.ctx.damageConfig[ec.self].spell.atMost = left;
          }
        },
        apply: (ec) => {
          const taken = ec.ctx.dealt[ec.self].physical + ec.ctx.dealt[ec.self].spell;
          const remaining = Math.max(0, getRes(ec, ec.self, "frost_shield") - taken);
          setRes(ec, ec.self, "frost_shield", remaining);

          // 添加buff延续到后续两回合（共三回合）
          addBuff(ec, {
            id: "cirno-frost-buff",
            name: "冰袭方阵",
            owner: ec.self,
            turns: 3,
            script: {
              damage: (e) => {
                const l = getRes(e, e.self, "frost_shield");
                if (l > 0) {
                  e.ctx.damageConfig[e.self].physical.atMost = l;
                  e.ctx.damageConfig[e.self].spell.atMost = l;
                }
              },
              apply: (e) => {
                const t = e.ctx.dealt[e.self].physical + e.ctx.dealt[e.self].spell;
                setRes(e, e.self, "frost_shield", Math.max(0, getRes(e, e.self, "frost_shield") - t));
              },
            },
          });
        },
      },
    },
    {
      id: "cirno-diamond",
      name: "雪符【钻石风暴】",
      power: 5,
      text: "若本回合双方均受到伤害，则下回合自己打出伤害翻倍，免疫对方伤害",
      tags: ["buff"],
      script: {
        apply: (ec) => {
          if (
            ec.ctx.dealt[ec.self].physical + ec.ctx.dealt[ec.self].spell > 0 &&
            ec.ctx.dealt[ec.foe].physical + ec.ctx.dealt[ec.foe].spell > 0
          ) {
            // 在turnEnd添加buff，确保下回合生效
            addBuff(ec, {
              id: "cirno-diamond-buff",
              name: "钻石风暴",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              script: {
                damage: (e) => {
                  immune(e, e.self, "all");
                  // 触发后移除buff
                  e.ctx.state.players[e.self].buffs = e.ctx.state.players[e.self].buffs.filter(
                    (b) => b.id !== "cirno-diamond-buff",
                  );
                },
                clash: (e) => {
                  multTakenDamage(e, e.foe, "physical", 2);
                  multTakenDamage(e, e.foe, "spell", 2);
                },
              },
            });
          }
        },
      },
    },
    {
      id: "cirno-spin",
      name: "冰符【妖精旋转】",
      power: 4,
      text: "包括本回合在内的五回合内，每当己方受到伤害，在回合结束时回复2HP",
      tags: ["buff"],
      script: {
        turnEnd: (ec) => {
          // 当前回合如果受伤，在回合结束时回复
          if (ec.ctx.dealt[ec.self].physical + ec.ctx.dealt[ec.self].spell > 0) {
            heal(ec, 2);
          }
          // 添加buff延续到后续四回合（共五回合）
          addBuff(ec, {
            id: "cirno-spin-buff",
            name: "妖精旋转",
            owner: ec.self,
            turns: 5,
            script: {
              turnEnd: (e) => {
                if (e.ctx.dealt[e.self].physical + e.ctx.dealt[e.self].spell > 0) heal(e, 2);
              },
            },
          });
        },
      },
    },
    {
      id: "cirno-carnival",
      name: "冰王【冰雪狂欢】",
      power: 4,
      text: "恢复上回合双方所受伤害总和的HP",
      tags: ["heal"],
      script: {
        damage: (ec) => heal(ec, totalDamageTurnsAgo(ec.ctx.state, 1)),
      },
    },
  ],
};
