import type { Character } from "../types.js";
import {
  multPower,
  setPower,
  dealSpell,
  drainLife,
  heal,
  immune,
  negateEffect,
  cardPowerOf,
  hpOf,
  requestDecision,
} from "../effects.js";
import { addBuff, setFlag, getFlag, getRes, setRes } from "../buffs.js";

/**
 * 铃仙·优昙华院·因幡  HP25
 */
export const reisen: Character = {
  id: "reisen",
  name: "铃仙优昙华院因幡",
  hp: 25,
  skills: [
    {
      id: "reisen-seiran",
      name: "晴岚的红眼",
      text: "被动：当自己的符卡效果触发时，可选择将其延后至下一回合生效",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: async (ec) => {
          const heldCardId = ec.ctx.state.players[ec.self].flags["_seiran_card_id"];
          if (heldCardId) {
            const char = ec.ctx.state.players[ec.self].character;
            const card = char.cards.find((c) => c.id === heldCardId);
            if (card?.script) {
              const choice = await requestDecision(
                ec,
                ec.self,
                `晴岚的红眼：是否触发延后的「${card.name}」？`,
                ["立即触发", "继续等待"],
              );
              if (choice === 0) {
                ec.ctx.cards[ec.self] = card;
                ec.ctx.effectNegated[ec.self] = true;
                ec.ctx.log({ type: "info", msg: `晴岚的红眼：执行延后的「${card.name}」效果` });
                if (card.script.priority) await card.script.priority(ec);
                if (card.script.power) await card.script.power(ec);
                if (card.script.clash) await card.script.clash(ec);
                if (card.script.damage) await card.script.damage(ec);
                if (card.script.apply) await card.script.apply(ec);
                if (card.script.turnEnd) await card.script.turnEnd(ec);
                ec.ctx.state.players[ec.self].flags["_seiran_card_id"] = "";
              }
            }
          }
        },
        priority: async (ec) => {
          const card = ec.ctx.cards[ec.self];
          if (!card) return;
          // 如果已有延后的符卡，不再询问
          if (ec.ctx.state.players[ec.self].flags["_seiran_card_id"]) return;
          const choice = await requestDecision(
            ec,
            ec.self,
            `是否将「${card.name}」的效果延后至后续回合？`,
            ["延后", "正常使用"],
          );
          if (choice === 0) {
            ec.ctx.state.players[ec.self].flags["_seiran_card_id"] = card.id;
            ec.ctx.effectNegated[ec.self] = true;
          }
        },
      },
    },
    {
      id: "reisen-kyouki",
      name: "狂气之瞳",
      text: "每2回合一次，本回合使用符卡能力不会被无效",
      cooldown: 2,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        turnStart: (ec) => setFlag(ec, ec.self, "ability_uninterruptable", true),
      },
    },
    {
      id: "reisen-infrared",
      name: "红外线之月",
      text: "每3回合一次，可复制对方符卡能力替换本回合己方的符卡能力",
      cooldown: 3,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        turnStart: (ec) => {
          const oppCard = ec.ctx.cards[ec.foe];
          if (oppCard) {
            ec.ctx.cards[ec.self] = { ...oppCard };
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "reisen-gennotsuki",
      name: "波符【幻之月】",
      power: 8,
      text: "恢复1~8点HP，此后在该数字一半的回合中，每回合结束时流失1点生命",
      tags: ["heal", "buff"],
      script: {
        damage: (ec) => {
          const n = ec.ctx.rng.d(8);
          heal(ec, n);
          setRes(ec, ec.self, "_gennotsuki_n", n);
        },
        apply: (ec) => {
          const n = getRes(ec, ec.self, "_gennotsuki_n");
          const turns = Math.floor(n / 2);
          if (turns > 0) {
            addBuff(ec, {
              id: "reisen-gennotsuki-drain",
              name: "幻之月-流失",
              owner: ec.self,
              turns: turns + 1, // +1因为当前回合末不计时
              script: { turnEnd: (e) => drainLife(e, 1, e.self, e.self) },
            });
          }
        },
      },
    },
    {
      id: "reisen-getsugan",
      name: "月眼【月兔远隔催眠术】",
      power: 5,
      text: "若威力低于对方，则本回合无视对方符卡威力和能力",
      tags: ["negate-effect"],
      script: {
        priority: (ec) => {
          if (cardPowerOf(ec, ec.self) < cardPowerOf(ec, ec.foe)) negateEffect(ec, ec.foe);
        },
        power: (ec) => {
          if (cardPowerOf(ec, ec.self) < cardPowerOf(ec, ec.foe)) setPower(ec, 0, ec.foe);
        },
      },
    },
    {
      id: "reisen-shinjitsu",
      name: "散符【真实之月】",
      power: 5,
      text: "回合结束后使对方流失等同于本回合己方HP变化值的生命",
      tags: ["drain"],
      script: {
        turnStart: (ec) => setRes(ec, ec.self, "_hp_at_start", hpOf(ec, ec.self)),
        turnEnd: (ec) => {
          const change = Math.abs(hpOf(ec, ec.self) - getRes(ec, ec.self, "_hp_at_start"));
          if (change > 0) drainLife(ec, change, ec.foe);
        },
      },
    },
    {
      id: "reisen-gerou",
      name: "狂视【幻胧月睨】",
      power: 6,
      text: "本回合免疫法术伤害，下回合免疫物理伤害",
      tags: ["immune", "buff"],
      script: {
        damage: (ec) => immune(ec, ec.self, "spell"),
        apply: (ec) =>
          addBuff(ec, {
            id: "reisen-gerou-next",
            name: "幻胧月睨-免疫物理",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            script: {
              damage: (e) => {
                immune(e, e.self, "physical");
                // 触发后移除buff
                e.ctx.state.players[e.self].buffs = e.ctx.state.players[e.self].buffs.filter(
                  (b) => b.id !== "reisen-gerou-next",
                );
              },
            },
          }),
      },
    },
    {
      id: "reisen-kakan",
      name: "幻惑【花冠视线】",
      power: 5,
      text: "产生（己方产生伤害总量）X2点法术伤害",
      tags: ["spell-damage"],
      script: {
        apply: (ec) => {
          const total = ec.ctx.dealt[ec.foe].physical + ec.ctx.dealt[ec.foe].spell;
          if (total > 0) dealSpell(ec, total * 2);
        },
      },
    },
    {
      id: "reisen-kokushi",
      name: "生药【国士无双之药】",
      power: 5,
      text: "本回合己方所受伤害翻倍，下回合己方威力翻倍，对方所受伤害翻倍",
      tags: ["buff"],
      script: {
        damage: (ec) => {
          ec.ctx.damageConfig[ec.self].physical.mults.push(2);
          ec.ctx.damageConfig[ec.self].spell.mults.push(2);
        },
        apply: (ec) =>
          addBuff(ec, {
            id: "reisen-kokushi-next",
            name: "国士无双-下回合",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            script: {
              power: (e) => {
                multPower(e, 2);
                // 触发后移除power效果
              },
              damage: (e) => {
                e.ctx.damageConfig[e.foe].physical.mults.push(2);
                e.ctx.damageConfig[e.foe].spell.mults.push(2);
                // 触发后移除buff
                e.ctx.state.players[e.self].buffs = e.ctx.state.players[e.self].buffs.filter(
                  (b) => b.id !== "reisen-kokushi-next",
                );
              },
            },
          }),
      },
    },
    {
      id: "reisen-tsuiseki",
      name: "狂视【幻迹追踪者】",
      power: 8,
      text: "若本回合双方有恢复生命值，则己方威力翻倍",
      tags: [],
      script: {
        // 在apply阶段检查本回合是否有回复，若有则添加下回合威力翻倍的buff
        apply: (ec) => {
          if (ec.ctx.healed.A > 0 || ec.ctx.healed.B > 0) {
            addBuff(ec, {
              id: "reisen-tsuiseki-buff",
              name: "幻迹追踪者-威力翻倍",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              script: {
                power: (e) => {
                  multPower(e, 2);
                  // 触发后移除buff
                  e.ctx.state.players[e.self].buffs = e.ctx.state.players[e.self].buffs.filter(
                    (b) => b.id !== "reisen-tsuiseki-buff",
                  );
                },
              },
            });
          }
        },
      },
    },
    {
      id: "reisen-bakuha",
      name: "赤眼【月狂爆破】",
      power: 8,
      text: "己方可受到当前HP一半的法术伤害，来使本回合的符卡威力翻倍",
      tags: [],
      script: {
        power: async (ec) => {
          const choice = await requestDecision(
            ec,
            ec.self,
            "月狂爆破：是否承受当前HP一半的法术伤害来使威力翻倍？",
            ["否", "是"],
          );
          if (choice === 1) {
            multPower(ec, 2);
            setFlag(ec, ec.self, "_bakuha_active", true);
          }
        },
        damage: (ec) => {
          if (getFlag(ec, ec.self, "_bakuha_active")) {
            dealSpell(ec, Math.floor(hpOf(ec, ec.self) / 2), ec.self, ec.self);
            setFlag(ec, ec.self, "_bakuha_active", false);
          }
        },
      },
    },
    {
      id: "reisen-seishi",
      name: "惰性【心灵制止】",
      power: 4,
      text: "若受到物理伤害，则免疫该伤害并对对方造成5点法术伤害",
      tags: ["immune", "spell-damage"],
      script: {
        damage: (ec) => {
          // 如果本回合自己受到物理伤害（包括clash伤害）
          const hasPhysicalDamage = ec.ctx.pending.some(
            (p) => p.target === ec.self && p.type === "physical" && !p.isHeal && !p.isDrain,
          );
          if (hasPhysicalDamage || (ec.ctx.clashDamage && ec.ctx.clashDamage.target === ec.self)) {
            immune(ec, ec.self, "physical");
            setFlag(ec, ec.self, "_seishi_trigger", true);
          }
        },
        apply: (ec) => {
          if (getFlag(ec, ec.self, "_seishi_trigger")) {
            dealSpell(ec, 5);
            setFlag(ec, ec.self, "_seishi_trigger", false);
          }
        },
      },
    },
    {
      id: "reisen-hanabi",
      name: "幻爆【心灵烟花】",
      power: 7,
      text: "可选择对对方造成5点法术伤害，或回复5点HP",
      tags: ["spell-damage", "heal"],
      script: {
        damage: async (ec) => {
          const i = await requestDecision(
            ec,
            ec.self,
            "心灵烟花：造成5法术 或 回复5HP？",
            ["造成5点法术伤害", "回复5点HP"],
          );
          if (i === 0) dealSpell(ec, 5);
          else heal(ec, 5);
        },
      },
    },
  ],
};
