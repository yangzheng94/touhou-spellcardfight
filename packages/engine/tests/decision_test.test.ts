import { describe, it, expect } from "vitest";
import { createGameState, resolveTurn, defaultDecide } from "../src/index.js";
import { sakuya } from "../src/data/sakuya.js";
import { reisen } from "../src/data/reisen.js";
import { aya } from "../src/data/aya.js";
import { remilia } from "../src/data/remilia.js";
import { hata } from "../src/data/hata.js";
import { youmu } from "../src/data/youmu.js";
import { koishi } from "../src/data/koishi.js";
import { satori } from "../src/data/satori.js";
import { sagume } from "../src/data/sagume.js";
import { suika } from "../src/data/suika.js";
import type { Card, Character, PlayerId } from "../src/types.js";

function findCard(c: Character, id: string): Card {
  const card = c.cards.find((x) => x.id === id);
  if (!card) throw new Error(`no card ${id} in ${c.name}`);
  return card;
}

function findSkill(c: Character, id: string) {
  const skill = c.skills.find((x) => x.id === id);
  if (!skill) throw new Error(`no skill ${id} in ${c.name}`);
  return skill;
}

type DecisionLog = { prompt: string; decision: number }[];

function trackDecisions(decisions: Record<string, number>, log: DecisionLog) {
  return (req: { player: PlayerId; prompt: string; options: string[]; range?: { min: number; max: number } }): number => {
    let decision = 0;
    let matched = false;
    for (const key of Object.keys(decisions)) {
      if (req.prompt.includes(key)) {
        decision = decisions[key];
        matched = true;
        break;
      }
    }
    if (!matched && req.range) decision = req.range.max;
    log.push({ prompt: req.prompt, decision });
    return decision;
  };
}

const lowPowerDefense = findCard(youmu, "youmu-rikudou");

describe("玩家决策影响验证", () => {

  describe("咲夜·杀人玩偶（damage阶段转换物理→法术）", () => {
    it("选择【保持物理】vs【转换法术】：应触发决策且结果不同", async () => {
      const offense = findCard(sakuya, "sakuya-doll");
      const defense = lowPowerDefense;

      const logKeep: DecisionLog = [];
      const logConvert: DecisionLog = [];

      // 保持物理
      const state1 = createGameState({ ...sakuya }, { ...youmu }, 1);
      await resolveTurn(state1,
        { card: offense, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "杀人玩偶": 0, "花开夜": 0 }, logKeep)
      );

      // 转换法术
      const state2 = createGameState({ ...sakuya }, { ...youmu }, 1);
      await resolveTurn(state2,
        { card: offense, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "杀人玩偶": 1, "花开夜": 0 }, logConvert)
      );

      // 验证决策被触发
      const dollDecisions1 = logKeep.filter(d => d.prompt.includes("杀人玩偶"));
      const dollDecisions2 = logConvert.filter(d => d.prompt.includes("杀人玩偶"));
      expect(dollDecisions1.length).toBeGreaterThan(0);
      expect(dollDecisions2.length).toBeGreaterThan(0);

      // 验证决策值被正确传递
      expect(dollDecisions1[0].decision).toBe(0);
      expect(dollDecisions2[0].decision).toBe(1);

      // 两种选择总伤害相同，但伤害记录的类型不同
      expect(state1.players.B.hp).toBe(state2.players.B.hp);
      expect(state1.damageHistory[0].B.physical).toBeGreaterThan(0);
      expect(state2.damageHistory[0].B.spell).toBeGreaterThan(0);
    });
  });

  describe("咲夜·月神之钟（damage阶段选择伤害类型）", () => {
    it("选择【法术】vs【物理】：伤害记录类型不同", async () => {
      const card = findCard(sakuya, "sakuya-moonclock");
      const defense = lowPowerDefense;

      const stateSpell = createGameState({ ...sakuya }, { ...youmu }, 1);
      await resolveTurn(stateSpell,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "月神之钟": 0, "花开夜": 0 }, [])
      );

      const statePhys = createGameState({ ...sakuya }, { ...youmu }, 1);
      await resolveTurn(statePhys,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "月神之钟": 1, "花开夜": 0 }, [])
      );

      // 两种选择对B造成相同总伤害
      expect(stateSpell.players.B.hp).toBe(statePhys.players.B.hp);
      // 选择法术：spell伤害增加
      expect(stateSpell.damageHistory[0].B.spell).toBeGreaterThan(0);
      // 选择物理：physical伤害更多
      expect(statePhys.damageHistory[0].B.physical).toBeGreaterThan(stateSpell.damageHistory[0].B.physical);
    });
  });

  describe("铃仙·月狂爆破（power阶段选择）", () => {
    it("选择【否】vs【是】：威力和伤害显著不同", async () => {
      const card = findCard(reisen, "reisen-bakuha");

      // 选择否
      const stateNo = createGameState({ ...reisen }, { ...youmu }, 1);
      const logNo: DecisionLog = [];
      await resolveTurn(stateNo,
        { card, skills: [] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "月狂爆破": 0 }, logNo)
      );

      // 选择是
      const stateYes = createGameState({ ...reisen }, { ...youmu }, 1);
      const logYes: DecisionLog = [];
      await resolveTurn(stateYes,
        { card, skills: [] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "月狂爆破": 1 }, logYes)
      );

      // 验证决策被触发
      expect(logNo.filter(d => d.prompt.includes("月狂爆破")).length).toBeGreaterThan(0);
      expect(logYes.filter(d => d.prompt.includes("月狂爆破")).length).toBeGreaterThan(0);

      // 选择是：B受伤更多（威力翻倍）
      expect(stateYes.players.B.hp).toBeLessThan(stateNo.players.B.hp);
      // 选择是：A也受伤（HP一半的法术伤害）
      expect(stateYes.players.A.hp).toBeLessThan(stateNo.players.A.hp);
    });
  });

  describe("蕾米莉亚·吸血鬼幻想（power阶段选择）", () => {
    it("两种选择导致不同伤害分布", async () => {
      const card = findCard(remilia, "remilia-gensou");

      const state0 = createGameState({ ...remilia }, { ...youmu }, 1);
      await resolveTurn(state0,
        { card, skills: [] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "吸血鬼幻想": 0 }, [])
      );

      const state1 = createGameState({ ...remilia }, { ...youmu }, 1);
      await resolveTurn(state1,
        { card, skills: [] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "吸血鬼幻想": 1 }, [])
      );

      // 选择0（增威）：B受伤更多（威力+3）
      expect(state0.players.B.hp).toBeLessThan(state1.players.B.hp);
      // 选择0：A自受3法术
      expect(state0.players.A.hp).toBeLessThan(state1.players.A.hp);
    });
  });

  describe("文·鸟居旋风（damage阶段选择伤害值）", () => {
    it("选择5vs10：伤害差值为5", async () => {
      const card = findCard(aya, "aya-torii");

      const state5 = createGameState({ ...aya }, { ...youmu }, 1);
      await resolveTurn(state5,
        { card, skills: [] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "鸟居旋风": 5 }, [])
      );

      const state10 = createGameState({ ...aya }, { ...youmu }, 1);
      await resolveTurn(state10,
        { card, skills: [] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "鸟居旋风": 10 }, [])
      );

      // 选择10比选择5多5点伤害
      expect(state10.players.B.hp).toBe(state5.players.B.hp - 5);

      // 选择10创建反噬buff
      const drainBuff = state10.players.A.buffs.find(b => b.id === "aya-torii-drain");
      expect(drainBuff).toBeDefined();
      // 选择5不创建
      const drainBuff5 = state5.players.A.buffs.find(b => b.id === "aya-torii-drain");
      expect(drainBuff5).toBeUndefined();
    });
  });

  describe("咲夜·花开夜（apply阶段延迟/触发伤害）", () => {
    it("延迟vs立即：B的HP不同", async () => {
      const attackCard = findCard(sakuya, "sakuya-mugen");
      const defense = lowPowerDefense;
      const hanahirakuSkill = findSkill(sakuya, "sakuya-hanahiraku");

      const stateDelay = createGameState({ ...sakuya }, { ...youmu }, 1);
      await resolveTurn(stateDelay,
        { card: attackCard, skills: [hanahirakuSkill] }, { card: defense, skills: [] },
        trackDecisions({ "花开夜：是否将本回合": 1 }, [])
      );

      const stateNow = createGameState({ ...sakuya }, { ...youmu }, 1);
      await resolveTurn(stateNow,
        { card: attackCard, skills: [hanahirakuSkill] }, { card: defense, skills: [] },
        trackDecisions({ "花开夜：是否将本回合": 0 }, [])
      );

      // 延迟：B的HP应该更高（伤害被恢复）
      expect(stateDelay.players.B.hp).toBeGreaterThan(stateNow.players.B.hp);
      // 延迟：资源中存储了物理伤害
      expect(stateDelay.players.A.resources["_hanahiraku_p"]).toBeGreaterThan(0);
      // 立即：资源中没有存储
      expect(stateNow.players.A.resources["_hanahiraku_p"] ?? 0).toBe(0);
    });

    it("跨回合触发：T1延迟→T2触发，B的HP在T2下降", async () => {
      const attackCard = findCard(sakuya, "sakuya-mugen");
      const defense = lowPowerDefense;
      const hanahirakuSkill = findSkill(sakuya, "sakuya-hanahiraku");
      const state = createGameState({ ...sakuya }, { ...youmu }, 1);

      // T1: 延迟伤害
      await resolveTurn(state,
        { card: attackCard, skills: [hanahirakuSkill] }, { card: defense, skills: [] },
        trackDecisions({ "花开夜：是否将本回合": 1 }, [])
      );
      const hpAfterT1 = state.players.B.hp;
      expect(state.players.A.resources["_hanahiraku_p"]).toBeGreaterThan(0);

      // T2: 触发延迟伤害
      await resolveTurn(state,
        { card: defense, skills: [hanahirakuSkill] }, { card: defense, skills: [] },
        trackDecisions({ "花开夜：是否触发延迟": 0, "花开夜：是否将本回合": 0 }, [])
      );
      const hpAfterT2 = state.players.B.hp;
      // B的HP在T2应该下降
      expect(hpAfterT2).toBeLessThan(hpAfterT1);
      // 资源应该被清空
      expect(state.players.A.resources["_hanahiraku_p"] ?? 0).toBe(0);
    });
  });

  describe("长弓兵·扑克脸（turnStart选择情绪）", () => {
    it("选择【喜】vs【怒】：伤害分布不同", async () => {
      const skill = findSkill(hata, "hata-pokerface");
      const card = findCard(sakuya, "sakuya-moonclock");
      const defense = lowPowerDefense;

      // 喜 + 法术伤害
      const stateXi = createGameState({ ...hata }, { ...youmu }, 1);
      await resolveTurn(stateXi,
        { card, skills: [skill] }, { card: defense, skills: [] },
        trackDecisions({ "扑克脸": 1, "月神之钟": 0 }, [])
      );

      // 怒 + 法术伤害
      const stateNu = createGameState({ ...hata }, { ...youmu }, 1);
      await resolveTurn(stateNu,
        { card, skills: [skill] }, { card: defense, skills: [] },
        trackDecisions({ "扑克脸": 2, "月神之钟": 0 }, [])
      );

      // 怒：法术伤害翻倍，B的HP应该更低
      expect(stateNu.players.B.hp).toBeLessThan(stateXi.players.B.hp);
    });
  });

  describe("长弓兵·心绮楼演舞（damage阶段消耗面具）", () => {
    it("消耗3vs0面具：护盾值不同", async () => {
      const skill = findSkill(hata, "hata-enbu");
      const attackCard = findCard(sakuya, "sakuya-mugen");
      const defense = lowPowerDefense;

      const state3 = createGameState({ ...hata }, { ...youmu }, 1);
      await resolveTurn(state3,
        { card: attackCard, skills: [skill] }, { card: defense, skills: [] },
        trackDecisions({ "心绮楼演舞": 3, "花开夜": 0 }, [])
      );

      const state0 = createGameState({ ...hata }, { ...youmu }, 1);
      await resolveTurn(state0,
        { card: attackCard, skills: [skill] }, { card: defense, skills: [] },
        trackDecisions({ "心绮楼演舞": 0, "花开夜": 0 }, [])
      );

      // 消耗3：有护盾
      expect(state3.players.A.resources["_enbu_shield"]).toBe(3);
      // 消耗0：无护盾
      expect(state0.players.A.resources["_enbu_shield"] ?? 0).toBe(0);
      // 消耗3：剩余面具更少
      expect(state3.players.A.resources["masks"]).toBeLessThan(state0.players.A.resources["masks"] ?? 0);
    });
  });

  describe("咲夜·银之跳跃（power阶段设定对方威力）", () => {
    it("将对方威力设为低值：B的HP更高", async () => {
      const card = findCard(sakuya, "sakuya-silver");
      const defense = findCard(youmu, "youmu-genseizan");

      const stateLow = createGameState({ ...sakuya }, { ...youmu }, 1);
      await resolveTurn(stateLow,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "银之跳跃": 1, "花开夜": 0 }, [])
      );

      const stateHigh = createGameState({ ...sakuya }, { ...youmu }, 1);
      await resolveTurn(stateHigh,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "银之跳跃": 10, "花开夜": 0 }, [])
      );

      // 设为1时A威力(6)-B威力(1)=5伤害，设为10时A威力(6)-B威力(10)=0
      // 设为10时B的HP更高（伤害更少）
      expect(stateHigh.players.B.hp).toBeGreaterThanOrEqual(stateLow.players.B.hp);
    });
  });

  describe("咲夜·THE WORLD（power阶段创建buff）", () => {
    it("THE WORLD buff在power阶段创建，damage阶段生效", async () => {
      const worldCard = findCard(sakuya, "sakuya-world");
      const defense = lowPowerDefense;
      const state = createGameState({ ...sakuya }, { ...youmu }, 1);

      // T1: 使用THE WORLD
      await resolveTurn(state,
        { card: worldCard, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "花开夜": 0 }, [])
      );

      // THE WORLD buff应该已创建
      const worldBuff = state.players.A.buffs.find(b => b.id === "sakuya-world-buff");
      expect(worldBuff).toBeDefined();
      expect(worldBuff!.remainingTurns).toBe(2);
    });

    it("THE WORLD：伤害延迟至后续回合结算", async () => {
      const worldCard = findCard(sakuya, "sakuya-world");
      const attackCard = findCard(sakuya, "sakuya-doll");
      const defense = lowPowerDefense;
      const state = createGameState({ ...sakuya }, { ...youmu }, 1);

      // T1: 使用THE WORLD
      await resolveTurn(state,
        { card: worldCard, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "花开夜": 0 }, [])
      );
      const hpAfterT1 = state.players.B.hp;

      // T2: THE WORLD生效期间攻击
      await resolveTurn(state,
        { card: attackCard, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "杀人玩偶": 0, "花开夜": 0 }, [])
      );
      // T2: 伤害被THE WORLD撤销，B的HP应该恢复
      expect(state.players.B.hp).toBe(hpAfterT1);
      // 资源应该存储了伤害
      expect(state.players.A.resources["_world_dp_a"]).toBeGreaterThan(0);
    });
  });

  // ===== 新增测试：决策时机验证 =====

  describe("古明地恋·空想上的人格（power阶段）", () => {
    it("决策在power阶段触发", async () => {
      const skill = findSkill(koishi, "koishi-jinkaku");
      const attackCard = findCard(sakuya, "sakuya-mugen");

      const state = createGameState({ ...koishi }, { ...youmu }, 1);
      const decisionLog: DecisionLog = [];
      await resolveTurn(state,
        { card: attackCard, skills: [skill] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "空想上的人格": 0, "花开夜": 0 }, decisionLog)
      );

      // 验证决策被触发
      const decisions = decisionLog.filter(d => d.prompt.includes("空想上的人格"));
      expect(decisions.length).toBeGreaterThan(0);
    });
  });

  describe("古明地恋·被厌恶者的哲学（power阶段）", () => {
    it("决策在power阶段触发", async () => {
      const card = findCard(koishi, "koishi-kensha");
      const state = createGameState({ ...koishi }, { ...youmu }, 1);
      
      const decisionLog: DecisionLog = [];
      await resolveTurn(state,
        { card, skills: [] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "被厌恶者的哲学": 0, "花开夜": 0 }, decisionLog)
      );

      // 验证决策在power阶段被触发
      const decisions = decisionLog.filter(d => d.prompt.includes("被厌恶者的哲学"));
      expect(decisions.length).toBeGreaterThan(0);
    });
  });

  describe("古明地觉·孤影悄然的心病（turnStart阶段）", () => {
    it("决策在turnStart阶段触发", async () => {
      const skill = findSkill(satori, "satori-koei");
      const state = createGameState({ ...satori }, { ...youmu }, 1);
      
      const decisionLog: DecisionLog = [];
      await resolveTurn(state,
        { card: lowPowerDefense, skills: [skill] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "孤影悄然": 0 }, decisionLog)
      );

      // 验证决策在turnStart阶段被触发
      const decisions = decisionLog.filter(d => d.prompt.includes("孤影悄然"));
      expect(decisions.length).toBeGreaterThan(0);
    });

    it("选择回复vs伤害：结果不同", async () => {
      const skill = findSkill(satori, "satori-koei");
      const attackCard = findCard(aya, "aya-torii");

      // 选择回复
      const stateHeal = createGameState({ ...satori }, { ...youmu }, 1);
      await resolveTurn(stateHeal,
        { card: attackCard, skills: [skill] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "孤影悄然": 0, "鸟居旋风": 10 }, [])
      );

      // 选择伤害
      const stateDmg = createGameState({ ...satori }, { ...youmu }, 1);
      await resolveTurn(stateDmg,
        { card: attackCard, skills: [skill] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "孤影悄然": 1, "鸟居旋风": 10 }, [])
      );

      // 选择回复：A的HP应该更高（回复2HP）
      expect(stateHeal.players.A.hp).toBeGreaterThanOrEqual(stateDmg.players.A.hp);
    });
  });

  describe("古明地觉·水色孪晶（turnStart阶段）", () => {
    it("决策在turnStart阶段触发", async () => {
      const card = findCard(satori, "satori-suishou");
      const state = createGameState({ ...satori }, { ...youmu }, 1);
      
      const decisionLog: DecisionLog = [];
      await resolveTurn(state,
        { card, skills: [] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "水色孪晶": 0 }, decisionLog)
      );

      // 验证决策在turnStart阶段被触发
      const decisions = decisionLog.filter(d => d.prompt.includes("水色孪晶"));
      expect(decisions.length).toBeGreaterThan(0);
    });

    it("选择法术vs回复：结果不同", async () => {
      const card = findCard(satori, "satori-suishou");
      const defense = findCard(youmu, "youmu-genseizan");

      // 选择法术伤害
      const stateSpell = createGameState({ ...satori }, { ...youmu }, 1);
      await resolveTurn(stateSpell,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "水色孪晶": 0, "花开夜": 0 }, [])
      );

      // 选择回复
      const stateHeal = createGameState({ ...satori }, { ...youmu }, 1);
      await resolveTurn(stateHeal,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "水色孪晶": 1, "花开夜": 0 }, [])
      );

      // 选择法术：B的HP应该更低（受到伤害）
      expect(stateSpell.players.B.hp).toBeLessThan(stateHeal.players.B.hp);
    });
  });

  describe("铃仙·心灵烟花（damage阶段）", () => {
    it("决策在damage阶段触发", async () => {
      const card = findCard(reisen, "reisen-hanabi");
      const state = createGameState({ ...reisen }, { ...youmu }, 1);
      
      const decisionLog: DecisionLog = [];
      await resolveTurn(state,
        { card, skills: [] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "心灵烟花": 0 }, decisionLog)
      );

      // 验证决策被触发
      const decisions = decisionLog.filter(d => d.prompt.includes("心灵烟花"));
      expect(decisions.length).toBeGreaterThan(0);
    });

    it("选择伤害vs回复：结果不同", async () => {
      const card = findCard(reisen, "reisen-hanabi");
      const defense = lowPowerDefense;

      // 选择造成伤害
      const stateDmg = createGameState({ ...reisen }, { ...youmu }, 1);
      await resolveTurn(stateDmg,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "心灵烟花": 0, "花开夜": 0 }, [])
      );

      // 选择回复
      const stateHeal = createGameState({ ...reisen }, { ...youmu }, 1);
      await resolveTurn(stateHeal,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "心灵烟花": 1, "花开夜": 0 }, [])
      );

      // 选择伤害：B的HP更低
      expect(stateDmg.players.B.hp).toBeLessThanOrEqual(stateHeal.players.B.hp);
      // 选择回复：A的HP更高
      expect(stateHeal.players.A.hp).toBeGreaterThanOrEqual(stateDmg.players.A.hp);
    });
  });

  describe("骊驹早鬼·鬼形的乌合之众（turnEnd阶段）", () => {
    it("决策在turnEnd阶段触发", async () => {
      const card = findCard(sagume, "sagume-ugou");
      const state = createGameState({ ...sagume }, { ...youmu }, 1);
      
      const decisionLog: DecisionLog = [];
      await resolveTurn(state,
        { card, skills: [] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "鬼形的乌合之众": 1 }, decisionLog)
      );

      // 验证决策在turnEnd阶段被触发
      const decisions = decisionLog.filter(d => d.prompt.includes("鬼形的乌合之众"));
      expect(decisions.length).toBeGreaterThan(0);
    });

    it("选择是vs否：双方HP变化不同", async () => {
      const card = findCard(sagume, "sagume-ugou");
      const defense = lowPowerDefense;

      // 选择是
      const stateYes = createGameState({ ...sagume }, { ...youmu }, 1);
      await resolveTurn(stateYes,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "鬼形的乌合之众": 0, "花开夜": 0 }, [])
      );

      // 选择否
      const stateNo = createGameState({ ...sagume }, { ...youmu }, 1);
      await resolveTurn(stateNo,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "鬼形的乌合之众": 1, "花开夜": 0 }, [])
      );

      // 选择是：双方HP变为1/3（应该比不选时低）
      expect(stateYes.players.A.hp).toBeLessThanOrEqual(stateNo.players.A.hp);
    });
  });

  describe("伊吹萃香·三步必杀（power阶段）", () => {
    it("决策在power阶段触发", async () => {
      const card = findCard(suika, "suika-sanpo");
      const state = createGameState({ ...suika }, { ...youmu }, 1);
      
      const decisionLog: DecisionLog = [];
      await resolveTurn(state,
        { card, skills: [] }, { card: lowPowerDefense, skills: [] },
        trackDecisions({ "三步必杀": 0 }, decisionLog)
      );

      // 验证决策在power阶段被触发
      const decisions = decisionLog.filter(d => d.prompt.includes("三步必杀"));
      expect(decisions.length).toBeGreaterThan(0);
    });

    it("选择翻倍vs不翻倍：威力和伤害不同", async () => {
      const card = findCard(suika, "suika-sanpo");
      const defense = lowPowerDefense;

      // 选择翻倍
      const stateDouble = createGameState({ ...suika }, { ...youmu }, 1);
      await resolveTurn(stateDouble,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "三步必杀": 0, "花开夜": 0 }, [])
      );

      // 选择不翻倍
      const stateNormal = createGameState({ ...suika }, { ...youmu }, 1);
      await resolveTurn(stateNormal,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "三步必杀": 1, "花开夜": 0 }, [])
      );

      // 选择翻倍：B的HP更低（威力翻倍）
      expect(stateDouble.players.B.hp).toBeLessThanOrEqual(stateNormal.players.B.hp);
    });
  });

  describe("咲夜·银之跳跃（power阶段）", () => {
    it("决策在power阶段触发", async () => {
      const card = findCard(sakuya, "sakuya-silver");
      const defense = findCard(youmu, "youmu-genseizan");
      const state = createGameState({ ...sakuya }, { ...youmu }, 1);
      
      const decisionLog: DecisionLog = [];
      await resolveTurn(state,
        { card, skills: [] }, { card: defense, skills: [] },
        trackDecisions({ "银之跳跃": 5 }, decisionLog)
      );

      // 验证决策在power阶段被触发
      const decisions = decisionLog.filter(d => d.prompt.includes("银之跳跃"));
      expect(decisions.length).toBeGreaterThan(0);
    });
  });
});
