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
import { addBuff, getRes, setRes, consumeTrigger } from "../buffs.js";
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
      text: "打出伤害时可选择将其延迟至下一回合计算",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        apply: (ec) => {
          // 只在实际造成伤害时才触发选择
          const d = ec.ctx.dealt[ec.foe];
          const totalDmg = d.physical + d.spell;
          if (totalDmg > 0) {
            const choice = requestDecision(
              ec,
              ec.self,
              "花开夜：是否将本回合造成的伤害延迟至下一回合？",
              ["立即结算", "延迟至下一回合"],
            );
            if (choice === 1) {
              // 记录当前伤害到资源中，然后清除
              setRes(ec, ec.self, "_hanahiraku_p", d.physical);
              setRes(ec, ec.self, "_hanahiraku_s", d.spell);
              d.physical = 0;
              d.spell = 0;
              
              // 添加 buff，在下一回合 damage 阶段应用延迟的伤害
              addBuff(ec, {
                id: "sakuya-hanahiraku-delay",
                name: "花开夜-延迟伤害",
                owner: ec.self,
                turns: 2,
                triggers: 1,
                script: {
                  damage: (e) => {
                    const p = getRes(e, e.self, "_hanahiraku_p");
                    const s = getRes(e, e.self, "_hanahiraku_s");
                    if (p > 0) dealPhysical(e, p);
                    if (s > 0) dealSpell(e, s);
                    // 清除存储的伤害
                    setRes(e, e.self, "_hanahiraku_p", 0);
                    setRes(e, e.self, "_hanahiraku_s", 0);
                    consumeTrigger(e, e.self, "sakuya-hanahiraku-delay");
                  },
                },
              });
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
        damage: (ec) => {
          const phys = ec.ctx.dealt[ec.foe].physical;
          if (phys > 0) {
            const choice = requestDecision(
              ec,
              ec.self,
              `杀人玩偶：本回合造成了 ${phys} 物理伤害，是否转换为法术伤害？`,
              ["保持物理伤害", "转换为法术伤害"],
            );
            if (choice === 1) {
              dealSpell(ec, phys);
              ec.ctx.dealt[ec.foe].physical = 0;
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
        apply: (ec) =>
          addBuff(ec, {
            id: "sakuya-world-buff",
            name: "THE WORLD",
            owner: ec.self,
            turns: 2,
            triggers: 1,
            script: {
              turnStart: (e) => {
                e.ctx.state.players["A"].flags["_world_delay"] = true;
                e.ctx.state.players["B"].flags["_world_delay"] = true;
              },
              damage: (e) => {
                multTakenDamage(e, e.self, "physical", 0.5);
                multTakenDamage(e, e.self, "spell", 0.5);
                multTakenDamage(e, e.foe, "physical", 2);
                multTakenDamage(e, e.foe, "spell", 2);
              },
              turnEnd: (e) => {
                const dmgToA = e.ctx.dealt.A;  // A 受到的伤害（B 对 A 造成的）
                const dmgToB = e.ctx.dealt.B;  // B 受到的伤害（A 对 B 造成的）
                if (dmgToA.physical > 0 || dmgToA.spell > 0 || dmgToB.physical > 0 || dmgToB.spell > 0) {
                  addBuff(e, {
                    id: "sakuya-world-delayed",
                    name: "THE WORLD-延迟伤害",
                    owner: e.self,
                    turns: 2,
                    triggers: 1,
                    script: {
                      damage: (ee) => {
                        // A 对 B 造成的伤害（B 受到的伤害）
                        if (dmgToB.physical > 0) dealPhysical(ee, dmgToB.physical, "B", "A");
                        if (dmgToB.spell > 0) dealSpell(ee, dmgToB.spell, "B", "A");
                        // B 对 A 造成的伤害（A 受到的伤害）
                        if (dmgToA.physical > 0) dealPhysical(ee, dmgToA.physical, "A", "B");
                        if (dmgToA.spell > 0) dealSpell(ee, dmgToA.spell, "A", "B");
                      },
                    },
                  });
                }
                e.ctx.dealt.A = { physical: 0, spell: 0 };
                e.ctx.dealt.B = { physical: 0, spell: 0 };
                delete e.ctx.state.players["A"].flags["_world_delay"];
                delete e.ctx.state.players["B"].flags["_world_delay"];
              },
            },
          }),
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
        power: (ec) => {
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
          const choice = requestDecision(
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
        damage: (ec) => {
          const choice = requestDecision(
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
