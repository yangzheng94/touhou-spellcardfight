import type { Character } from "../types.js";
import {
  setPower,
  dealSpell,
  dealPhysical,
  heal,
  setHp,
  negateEffect,
  cardPowerOf,
  multTakenDamage,
  requestDecision,
} from "../effects.js";
import { addBuff, getRes, setRes, getFlag, setFlag } from "../buffs.js";
import { hpTurnsAgo } from "../state.js";

export const sakuya: Character = {
  id: "sakuya",
  name: "十六夜咲夜",
  hp: 26,
  skills: [
    {
      id: "sakuya-tsukidokei",
      name: "月时计",
      text: "同时打出物理和法术伤害时，将较低的一方替换为较高一方的数值",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        apply: (ec) => {
          const p = ec.ctx.dealt[ec.foe].physical;
          const s = ec.ctx.dealt[ec.foe].spell;
          if (p > 0 && s > 0) {
            const max = Math.max(p, s);
            ec.ctx.dealt[ec.foe].physical = max;
            ec.ctx.dealt[ec.foe].spell = max;
          }
        },
      },
    },
    {
      id: "sakuya-hanahiraku",
      name: "花开夜",
      text: "打出伤害时可选择将其延迟，可一直延后直到玩家决定触发（物理/法术分开存储）",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        apply: async (ec) => {
          // 1. 先检查是否触发之前延迟的伤害（玩家决定何时触发）
          const pending = getFlag(ec, ec.self, "_hanahiraku_pending");
          if (pending) {
            const p = getRes(ec, ec.self, "_hanahiraku_p");
            const s = getRes(ec, ec.self, "_hanahiraku_s");
            if (p > 0 || s > 0) {
              const choice = await requestDecision(
                ec,
                ec.self,
                `花开夜：是否触发延迟的伤害（物理${p}+法术${s}）？`,
                ["触发", "继续延迟"],
              );
              if (choice === 0) {
                // 严格分开物理和法术伤害
                if (p > 0) dealPhysical(ec, p);
                if (s > 0) dealSpell(ec, s);
                setRes(ec, ec.self, "_hanahiraku_p", 0);
                setRes(ec, ec.self, "_hanahiraku_s", 0);
                setFlag(ec, ec.self, "_hanahiraku_pending", false);
                ec.ctx.log({ type: "info", msg: `花开夜：触发延迟的伤害（物理${p}+法术${s}）` });
              }
            } else {
              setFlag(ec, ec.self, "_hanahiraku_pending", false);
            }
          }

          // 2. 检查本回合是否造成新伤害，询问是否延迟
          const d = ec.ctx.dealt[ec.foe];
          const totalDmg = d.physical + d.spell;
          if (totalDmg > 0) {
            const choice = await requestDecision(
              ec,
              ec.self,
              "花开夜：是否将本回合造成的伤害延迟？",
              ["立即结算", "延迟"],
            );
            if (choice === 1) {
              // 撤销本回合已造成的伤害（恢复对手HP），实现真正的"延迟"
              const foe = ec.ctx.state.players[ec.foe];
              const before = foe.hp;
              foe.hp = Math.min(foe.maxHp, foe.hp + totalDmg);
              const restored = foe.hp - before;
              if (restored > 0) {
                ec.ctx.log({ type: "info", msg: `花开夜：撤销本回合对 ${foe.character.name} 造成的 ${totalDmg} 伤害（HP ${before} → ${foe.hp}），延迟至后续回合触发` });
              }
              // 累加存储伤害（严格分开物理和法术，可跨回合累积）
              const prevP = getRes(ec, ec.self, "_hanahiraku_p");
              const prevS = getRes(ec, ec.self, "_hanahiraku_s");
              setRes(ec, ec.self, "_hanahiraku_p", prevP + d.physical);
              setRes(ec, ec.self, "_hanahiraku_s", prevS + d.spell);
              d.physical = 0;
              d.spell = 0;
              setFlag(ec, ec.self, "_hanahiraku_pending", true);
            }
          }
        },
      },
    },
    {
      id: "sakuya-maid",
      name: "完美潇洒的女仆",
      text: "四回合一次，本回合无视对方符卡",
      cooldown: 4,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        priority: (ec) => negateEffect(ec, ec.foe),
        power: (ec) => setPower(ec, 0, ec.foe),
      },
    },
  ],
  cards: [
    {
      id: "sakuya-doll",
      name: "幻符【杀人玩偶】",
      power: 9,
      text: "可选择将打出的伤害全部转换为法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: async (ec) => {
          const physItems = ec.ctx.pending.filter(
            (p) => p.target === ec.foe && p.type === "physical" && !p.isHeal && !p.isDrain,
          );
          const phys = physItems.reduce((sum, p) => sum + p.amount, 0);
          if (phys > 0) {
            const choice = await requestDecision(
              ec,
              ec.self,
              `杀人玩偶：本回合有 ${phys} 物理伤害待结算，是否转换为法术伤害？`,
              ["保持物理伤害", "转换为法术伤害"],
            );
            if (choice === 1) {
              // 从pending中移除物理伤害
              ec.ctx.pending = ec.ctx.pending.filter(
                (p) => !(p.target === ec.foe && p.type === "physical" && !p.isHeal && !p.isDrain),
              );
              // 添加等量法术伤害
              dealSpell(ec, phys);
              ec.ctx.log({ type: "info", msg: `杀人玩偶：将${phys}物理伤害转换为法术伤害` });
            }
          }
        },
      },
    },
    {
      id: "sakuya-musabetsu",
      name: "幻符【无差别伤害】",
      power: 6,
      text: "若双方均可对对方造成伤害，则产生4点法术伤害，恢复5点生命",
      tags: ["spell-damage", "heal"],
      script: {
        apply: (ec) => {
          if (
            ec.ctx.dealt[ec.self].physical + ec.ctx.dealt[ec.self].spell > 0 &&
            ec.ctx.dealt[ec.foe].physical + ec.ctx.dealt[ec.foe].spell > 0
          ) {
            dealSpell(ec, 4);
            heal(ec, 5);
          }
        },
      },
    },
    {
      id: "sakuya-mugen",
      name: "幻葬【雾夜幻影杀人鬼】",
      power: 9,
      text: "若本回合造成物理伤害，则下回合符卡威力+3",
      tags: ["buff"],
      script: {
        apply: (ec) => {
          if (ec.ctx.dealt[ec.foe].physical > 0) {
            addBuff(ec, {
              id: "sakuya-mugen-buff",
              name: "雾夜-威力+3",
              owner: ec.self,
              turns: 2,
              triggers: 1,
              text: "下回合符卡威力 +3",
              category: "power",
              script: { power: (e) => e.ctx.power[e.self].adds.push(3) },
            });
          }
        },
      },
    },
    {
      id: "sakuya-perfect",
      name: "时符【完美空间】",
      power: 2,
      text: "伤害结算后，将自己的HP调整为 2回合之前的数值",
      tags: [],
      script: {
        turnEnd: (ec) => setHp(ec, ec.self, hpTurnsAgo(ec.ctx.state, ec.self, 2)),
      },
    },
    {
      id: "sakuya-soul",
      name: "伤魂【灵魂雕塑】",
      power: 4,
      text: "若受到物理伤害，则产生（该伤害+对方威力）点法伤，若受到法术伤害，则恢复该伤害2倍的HP",
      tags: ["spell-damage", "heal"],
      script: {
        apply: (ec) => {
          const taken = ec.ctx.dealt[ec.self];
          if (taken.physical > 0) dealSpell(ec, taken.physical + cardPowerOf(ec, ec.foe));
          if (taken.spell > 0) heal(ec, taken.spell * 2);
        },
      },
    },
    {
      id: "sakuya-world",
      name: "幻世【THE WORLD】",
      power: 5,
      text: "下回合己方所受伤害减半，对方所受伤害加倍，双方伤害必须延迟至下下回合进行结算",
      tags: ["buff"],
      script: {
        power: (ec) => {
          addBuff(ec, {
            id: "sakuya-world-buff",
            name: "THE WORLD",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            // 打出回合不生效，从下一回合（remainingTurns===2）开始生效
            activateOnCreate: false,
            text: "下回合己方所受伤害减半，对方所受伤害加倍，双方伤害延迟至下下回合结算",
            category: "delayed-damage",
            script: {
              // 生效回合（打出后的下一回合）：施加己方减伤伤/对方增伤伤。
              // 结算回合（remainingTurns===1）不再施加减半/加倍，仅由结算 buff 造成延迟伤害。
              damage: (e) => {
                const worldBuff = e.ctx.state.players[e.self].buffs.find(b => b.id === "sakuya-world-buff");
                const remainingTurns = worldBuff?.remainingTurns ?? 0;
                if (remainingTurns === 2) {
                  e.ctx.log({ type: "info", msg: `THE WORLD：damage阶段生效，己方减伤/对方增伤` });
                  multTakenDamage(e, e.self, "physical", 0.5);
                  multTakenDamage(e, e.self, "spell", 0.5);
                  multTakenDamage(e, e.foe, "physical", 2);
                  multTakenDamage(e, e.foe, "spell", 2);
                }
              },
              turnEnd: (e) => {
                const self = e.self;
                const foe = e.foe;
                const worldBuff = e.ctx.state.players[self].buffs.find(b => b.id === "sakuya-world-buff");
                const remainingTurns = worldBuff?.remainingTurns ?? 0;
                e.ctx.log({ type: "info", msg: `THE WORLD：turnEnd, remainingTurns=${remainingTurns}` });

                // 生效回合（打出后的下一回合）：撤销本回合伤害并累积，创建结算 buff
                if (remainingTurns === 2) {
                  const dmgA = e.ctx.dealt[foe];
                  const dmgB = e.ctx.dealt[self];
                  const totalA = dmgA.physical + dmgA.spell;
                  const totalB = dmgB.physical + dmgB.spell;

                  e.ctx.log({ type: "info", msg: `THE WORLD：撤销本回合伤害(${self}→${foe}=${totalA}, ${foe}→${self}=${totalB})` });

                  if (totalA > 0) {
                    const pA = e.ctx.state.players[foe];
                    pA.hp = Math.min(pA.maxHp, pA.hp + totalA);
                  }
                  if (totalB > 0) {
                    const pB = e.ctx.state.players[self];
                    pB.hp = Math.min(pB.maxHp, pB.hp + totalB);
                  }

                  const dpA = dmgA.physical;
                  const dsA = dmgA.spell;
                  const dpB = dmgB.physical;
                  const dsB = dmgB.spell;
                  const total = totalA + totalB;

                  e.ctx.log({ type: "info", msg: `THE WORLD：结算累积伤害(${self}→${foe}物理${dpA}+法术${dsA}, ${foe}→${self}物理${dpB}+法术${dsB})，下回合结算` });

                  if (total > 0) {
                    addBuff(e, {
                      id: "sakuya-world-final",
                      name: "THE WORLD-延迟结算",
                      owner: self,
                      turns: 1,
                      triggers: 1,
                      activateOnCreate: true,
                      text: `结算累积延迟伤害（${self}→${foe} 物理${dpA}+法术${dsA}，${foe}→${self} 物理${dpB}+法术${dsB}）`,
                      category: "delayed-damage",
                      data: { dpA, dsA, dpB, dsB },
                      script: {
                        damage: (ee) => {
                          const buff = ee.ctx.state.players[ee.self].buffs.find(b => b.id === "sakuya-world-final");
                          if (buff?.data) {
                            const d = buff.data;
                            // 走正常伤害通道：吃结算当回合的免疫/护盾/减伤，也可被花开夜延后
                            if (d.dpA > 0) dealPhysical(ee, d.dpA, ee.foe, ee.self);
                            if (d.dsA > 0) dealSpell(ee, d.dsA, ee.foe, ee.self);
                            if (d.dpB > 0) dealPhysical(ee, d.dpB, ee.self, ee.foe);
                            if (d.dsB > 0) dealSpell(ee, d.dsB, ee.self, ee.foe);
                            ee.ctx.log({ type: "info", msg: `THE WORLD：结算延迟伤害(${ee.self}→${ee.foe}物理${d.dpA}+法术${d.dsA}, ${ee.foe}→${ee.self}物理${d.dpB}+法术${d.dsB})` });
                          }
                        },
                      },
                    });
                  }
                }
                // 结算回合（remainingTurns===1）：延迟伤害已由结算 buff 在下回合 damage 阶段造成，无需再处理
              },
            },
          });
        },
      },
    },
    {
      id: "sakuya-clock",
      name: "幻在【钟表的残骸】",
      power: 6,
      text: "若下回合受到物理伤害，则产生8点法术伤害",
      tags: ["buff"],
      script: {
        apply: (ec) =>
          addBuff(ec, {
            id: "sakuya-clock-buff",
            name: "钟表的残骸",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            text: "下回合受到物理伤害时，产生 8 点法术伤害",
            category: "delayed-damage",
            script: {
              apply: (e) => {
                if (e.ctx.dealt[e.self].physical > 0) dealSpell(e, 8);
              },
            },
          }),
      },
    },
    {
      id: "sakuya-tender",
      name: "奇术【永恒的温柔】",
      power: 1,
      text: "本回合无视对方符卡",
      tags: ["negate-effect"],
      script: {
        priority: (ec) => negateEffect(ec, ec.foe),
        power: (ec) => setPower(ec, 0, ec.foe),
      },
    },
    {
      id: "sakuya-silver",
      name: "银符【银之跳跃】",
      power: 7,
      text: "本回合可将对手的符卡威力调整至（当前回合数至10）",
      tags: [],
      script: {
        power: async (ec) => {
          const min = ec.ctx.turn;
          const max = 10;
          if (min > max) {
            setPower(ec, max, ec.foe);
            return;
          }
          const options = [];
          for (let i = min; i <= max; i++) {
            options.push(`${i}`);
          }
          const choice = await requestDecision(
            ec,
            ec.self,
            `银之跳跃：请选择对方符卡的威力（${min}-${max}）`,
            options,
          );
          setPower(ec, min + choice, ec.foe);
        },
      },
    },
    {
      id: "sakuya-moonclock",
      name: "幻象【月神之钟】",
      power: 4,
      text: "产生6点法术伤害，可选择将本符卡打出的伤害转换为物理伤害",
      tags: ["spell-damage"],
      script: {
        damage: async (ec) => {
          const choice = await requestDecision(
            ec,
            ec.self,
            "月神之钟：本符卡产生6点伤害，选择伤害类型？",
            ["法术伤害", "物理伤害"],
          );
          if (choice === 0) dealSpell(ec, 6);
          else dealPhysical(ec, 6);
        },
      },
    },
  ],
};
