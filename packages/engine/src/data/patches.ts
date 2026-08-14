import type { Character } from "../types.js";
import {
  addPower,
  setPower,
  setHp,
  addTakenDamage,
  multTakenDamage,
  dealPhysical,
  immune,
  addAbsorb,
} from "../effects.js";
import { resolvePower } from "../power.js";
import { addBuff, consumeTrigger, getRes, setRes, setFlag } from "../buffs.js";
import type { Card, EffectContext } from "../types.js";

function getCopiedCard(ec: EffectContext): Card | null {
  const idx = getRes(ec, ec.self, "_riki_copy_card_idx");
  if (idx < 0) return null;
  const ownCards = ec.ctx.state.players[ec.self].character.cards.filter(
    (c) => c.id !== "patches-riki-attack" && c.id !== "patches-zuogong",
  );
  return ownCards[idx] ?? null;
}

/**
 * 帕奇  HP28
 *
 * 魂系梗角色。
 */
export const patches: Character = {
  id: "patches",
  name: "帕奇",
  hp: 28,
  skills: [
    {
      id: "patches-riki-qidong",
      name: "里技启动",
      text: "只有在使用过“后撤步，里技准备”的下回合才能够使用，获得“里技启动”Buff（持续 3 回合）：做好启动某样魂5绝学的准备！",
      cooldown: 5,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        // 发动条件：上回合必须打出过「后撤步，里技准备」。
        // 满足时，获得持续 3 回合的「里技启动」Buff，期间左弓威力为 40。
        power: (ec) => {
          const prepTurn = getRes(ec, ec.self, "_patches_riki_prep");
          if (prepTurn !== ec.ctx.turn - 1) {
            ec.ctx.log({
              type: "info",
              msg: "里技启动：上回合未进行里技准备，无法启动",
            });
            return;
          }
          addBuff(ec, {
            id: "patches-riki-qidong-buff",
            name: "里技启动",
            owner: ec.self,
            turns: 3,
            text: "战技替换准备就绪，左弓威力为 40（持续 3 回合）",
            category: "power",
            script: {},
          });
          ec.ctx.log({
            type: "info",
            msg: "里技启动：战技替换准备就绪， 3 回合内左弓威力 40",
          });
        },
      },
    },
    {
      id: "patches-fangun",
      name: "翻滚",
      text: "该回合己方符卡威力归零，不会受到物理伤害",
      cooldown: 3,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        power: (ec) => setPower(ec, 0, ec.self),
        damage: (ec) => immune(ec, ec.self, "physical"),
      },
    },
    {
      id: "patches-xibie",
      name: "惜别眼泪",
      text: "受到致死伤害时该结算轮次保留1点血",
      cooldown: 0,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: (ec) => {
          // 整局只能触发一次
          if (getRes(ec, ec.self, "_xibie_consumed")) return;
          if (!ec.ctx.state.players[ec.self].buffs.some((b) => b.id === "patches-xibie-buff")) {
            addBuff(ec, {
              id: "patches-xibie-buff",
              name: "惜别眼泪",
              owner: ec.self,
              turns: -1,
              triggers: 1,
              activateOnCreate: true,
              text: "受到致死伤害时保留 1 点 HP（整局 1 次）",
              category: "hp-lock",
              script: {
                apply: (e) => {
                  if (getRes(e, e.self, "_xibie_consumed")) return;
                  const hp = e.ctx.state.players[e.self].hp;
                  if (hp <= 0) {
                    setHp(e, e.self, 1);
                    setRes(e, e.self, "_xibie_consumed", 1);
                    consumeTrigger(e, e.self, "patches-xibie-buff");
                    e.ctx.log({
                      type: "hp",
                      msg: `惜别眼泪：${e.ctx.state.players[e.self].character.name} 保留 1 点 HP`,
                    });
                  }
                },
              },
            });
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "patches-zuogong",
      name: "【战技替换】左弓",
      power: 20,
      text: "基础威力 20；拥有“里技启动”Buff（持续 3 回合）时威力为 40",
      tags: [],
      script: {
        power: (ec) => {
          const active = ec.ctx.state.players[ec.self].buffs.some(
            (b) => b.id === "patches-riki-qidong-buff",
          );
          if (active) {
            setPower(ec, 40, ec.self);
          }
        },
      },
    },
    {
      id: "patches-danfan",
      name: "【战技】弹反",
      power: 0,
      text: "如果该回合受到物理伤害，则免疫物理伤害同时使下一张符卡威力增加4点；如果受到魔法伤害，则效果无效",
      tags: ["immune", "buff", "manual"],
      script: {
        // 先预判本回合是否会受到法术伤害：若 pending 中存在对己方的法术伤害，则弹反无效。
        damage: (ec) => {
          const willTakeSpell = ec.ctx.pending.some(
            (p) => p.target === ec.self && p.type === "spell" && !p.isHeal && !p.isDrain,
          );
          if (willTakeSpell) {
            ec.ctx.log({ type: "info", msg: "弹反：本回合将受到法术伤害，效果无效" });
            setFlag(ec, ec.self, "_danfan_physical_incoming", false);
            return;
          }
          // 记录本回合是否有物理伤害来袭（即使被免疫也算“受到物理伤害”）
          const willTakePhysical = ec.ctx.pending.some(
            (p) => p.target === ec.self && p.type === "physical" && !p.isHeal && !p.isDrain,
          );
          setFlag(ec, ec.self, "_danfan_physical_incoming", willTakePhysical);
          if (willTakePhysical) {
            immune(ec, ec.self, "physical");
            setFlag(ec, ec.self, "_danfan_success", true);
          }
        },
        apply: (ec) => {
          if (!ec.ctx.state.players[ec.self].flags["_danfan_success"]) return;
          const incoming = ec.ctx.state.players[ec.self].flags["_danfan_physical_incoming"];
          if (incoming) {
            addBuff(ec, {
              id: "patches-danfan-buff",
              name: "弹反-下次威力+4",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              text: "下回合符卡威力 +4",
              category: "power",
              script: {
                power: (e) => {
                  addPower(e, 4);
                  consumeTrigger(e, e.self, "patches-danfan-buff");
                },
              },
            });
          }
          setFlag(ec, ec.self, "_danfan_success", false);
          setFlag(ec, ec.self, "_danfan_physical_incoming", false);
        },
      },
    },
    {
      id: "patches-huabu",
      name: "【战技】滑步",
      power: 0,
      text: "本回合不会受到法术伤害，该效果不会被无效",
      tags: ["immune"],
      script: {
        // 设置 ability_uninterruptable，使本回合符卡效果不会被对方的「效果无效」跳过。
        priority: (ec) => setFlag(ec, ec.self, "ability_uninterruptable", true),
        damage: (ec) => immune(ec, ec.self, "spell"),
        turnEnd: (ec) => setFlag(ec, ec.self, "ability_uninterruptable", false),
      },
    },
    {
      id: "patches-maohuojian",
      name: "【技符】冒火剑",
      power: 6,
      text: "受到魔法与物理伤害-6（两者取高值之一生效）",
      tags: [],
      script: {
        // 结算后取物理/法术伤害中较高的一边，减免 6 点。
        apply: (ec) => {
          const dealt = ec.ctx.dealt[ec.self];
          const player = ec.ctx.state.players[ec.self];
          if (dealt.physical >= dealt.spell && dealt.physical > 0) {
            const reduce = Math.min(6, dealt.physical);
            dealt.physical -= reduce;
            player.hp = Math.min(player.maxHp, player.hp + reduce);
            ec.ctx.log({ type: "info", msg: `冒火剑：物理伤害减免 ${reduce}` });
          } else if (dealt.spell > dealt.physical && dealt.spell > 0) {
            const reduce = Math.min(6, dealt.spell);
            dealt.spell -= reduce;
            player.hp = Math.min(player.maxHp, player.hp + reduce);
            ec.ctx.log({ type: "info", msg: `冒火剑：法术伤害减免 ${reduce}` });
          }
        },
      },
    },
    {
      id: "patches-cazhilian",
      name: "【技符】擦脂镰",
      power: 3,
      text: "对对方造成2点物理伤害，随后有50%概率再次造成2点物理伤害，若成功触发则再次判定，直到失败",
      tags: [],
      script: {
        damage: (ec) => {
          while (true) {
            dealPhysical(ec, 2);
            if (ec.ctx.rng.next() >= 0.5) break;
          }
        },
      },
    },
    {
      id: "patches-banyedao",
      name: "【技符】半页刀",
      power: 6,
      text: "本回合受到的物理伤害减半",
      tags: [],
      script: {
        damage: (ec) => multTakenDamage(ec, ec.self, "physical", 0.5),
      },
    },
    {
      id: "patches-laoduan",
      name: "【技符】姥断与鬼切",
      power: 6,
      text: "该回合双方威力跳过结算直接扣除对方血量",
      tags: ["manual"],
      script: {
        // 双方都不参与 clash，改为按各自符卡结算后的实际威力直接造成物理伤害。
        // 使用 resolvePower 以兼容弹反等威力加成效果。
        power: (ec) => {
          setRes(ec, ec.self, "_laoduan_self_power", resolvePower(ec.ctx.power[ec.self]));
          setRes(ec, ec.self, "_laoduan_foe_power", resolvePower(ec.ctx.power[ec.foe]));
          setPower(ec, 0, ec.self);
          setPower(ec, 0, ec.foe);
        },
        damage: (ec) => {
          const selfPower = getRes(ec, ec.self, "_laoduan_self_power");
          const foePower = getRes(ec, ec.self, "_laoduan_foe_power");
          if (selfPower > 0) dealPhysical(ec, selfPower, ec.foe, ec.self);
          if (foePower > 0) dealPhysical(ec, foePower, ec.self, ec.foe);
        },
      },
    },
    {
      id: "patches-yousui",
      name: "【暗术】幽邃庇护",
      power: 0,
      text: "使用后获得5点护盾，下两回合的符卡威力+2",
      tags: ["absorb", "buff"],
      script: {
        damage: (ec) => addAbsorb(ec, ec.self, 5),
        apply: (ec) =>
          addBuff(ec, {
            id: "patches-yousui-buff",
            name: "幽邃庇护-威力+2",
            owner: ec.self,
            turns: 3,
            triggers: -1,
            text: "接下来 2 回合符卡威力 +2",
            category: "power",
            script: { power: (e) => addPower(e, 2) },
          }),
      },
    },
    {
      id: "patches-houtui",
      name: "【后撤步，里技准备】",
      power: 0,
      text: "至少在第四回合开始后才能打出，己方后续受到的物理伤害和法术伤害减少1点",
      tags: ["buff"],
      script: {
        turnStart: (ec) => {
          if (ec.ctx.turn < 4) {
            ec.ctx.log({ type: "info", msg: "后撤步，里技准备：回合数不足，无法准备" });
            return;
          }
          // 记录准备回合，供下回合里技启动检查
          setRes(ec, ec.self, "_patches_riki_prep", ec.ctx.turn);
          // 后续受到物理/法术伤害 -1（永久减伤）
          if (!ec.ctx.state.players[ec.self].buffs.some((b) => b.id === "patches-houtui-buff")) {
            addBuff(ec, {
              id: "patches-houtui-buff",
              name: "里技准备-减伤",
              owner: ec.self,
              turns: -1,
              text: "受到的物理伤害和法术伤害 -1",
              category: "damage-taken",
              script: {
                damage: (e) => {
                  addTakenDamage(e, e.self, "physical", -1);
                  addTakenDamage(e, e.self, "spell", -1);
                },
              },
            });
          }
        },
      },
    },
    {
      id: "patches-riki-attack",
      name: "【里技】攻击模组替换",
      power: 0,
      text: "只有在使用“后撤步，里技准备”之后才可以打出，威力有三分之二的概率变成6，三分之一的概率变成3；符卡效果变为除了【战技替换】左弓以外自己的一张符卡的效果",
      tags: ["manual"],
      script: {
        // 随机选择一张要复制的符卡（排除左弓和模组本身），并执行其对应阶段脚本。
        // 注意：这里会“视作打出”该符卡，因此该符卡的 power/apply/damage/turnEnd 等脚本都会按当前 ec 执行。
        power: async (ec) => {
          const prepTurn = getRes(ec, ec.self, "_patches_riki_prep");
          if (prepTurn <= 0) {
            ec.ctx.log({ type: "info", msg: "攻击模组替换：未进行里技准备，无法发动" });
            setPower(ec, 0, ec.self);
            setRes(ec, ec.self, "_riki_copy_card_idx", -1);
            return;
          }
          const roll = ec.ctx.rng.next();
          const power = roll < 2 / 3 ? 6 : 3;
          setPower(ec, power, ec.self);
          ec.ctx.log({ type: "info", msg: `攻击模组替换：威力变为 ${power}` });

          const ownCards = ec.ctx.state.players[ec.self].character.cards.filter(
            (c) => c.id !== "patches-riki-attack" && c.id !== "patches-zuogong",
          );
          if (ownCards.length === 0) {
            setRes(ec, ec.self, "_riki_copy_card_idx", -1);
            return;
          }
          const idx = Math.floor(ec.ctx.rng.next() * ownCards.length);
          setRes(ec, ec.self, "_riki_copy_card_idx", idx);
          const chosen = ownCards[idx];
          ec.ctx.log({ type: "info", msg: `攻击模组替换：视作打出 ${chosen.name}` });
          if (chosen.script?.power) await chosen.script.power(ec);
        },
        clash: async (ec) => {
          const chosen = getCopiedCard(ec);
          if (chosen?.script?.clash) await chosen.script.clash(ec);
        },
        damage: async (ec) => {
          const chosen = getCopiedCard(ec);
          if (chosen?.script?.damage) await chosen.script.damage(ec);
        },
        apply: async (ec) => {
          const chosen = getCopiedCard(ec);
          if (chosen?.script?.apply) await chosen.script.apply(ec);
        },
        turnEnd: async (ec) => {
          const chosen = getCopiedCard(ec);
          if (chosen?.script?.turnEnd) await chosen.script.turnEnd(ec);
          setRes(ec, ec.self, "_riki_copy_card_idx", -1);
        },
      },
    },
  ],
};
