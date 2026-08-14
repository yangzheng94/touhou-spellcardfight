/**
 * 核心类型定义 —— 东方符卡对战引擎
 *
 * 设计要点：
 * - 数据驱动：角色/符卡为纯数据；效果由「原子操作 + 阶段钩子」组合表达。
 * - 引擎权威、纯逻辑：无 IO，可复现（RNG 种子化），供服务器运行与单测。
 * - 严格对齐规则文档的结算顺序与优先级。
 */

export type PlayerId = "A" | "B";

export function other(p: PlayerId): PlayerId {
  return p === "A" ? "B" : "A";
}

export type DamageType = "physical" | "spell";

// ---------------------------------------------------------------------------
// 角色 / 符卡 / 技能（静态数据）
// ---------------------------------------------------------------------------

/** 符卡效果的分类标签，用于优先级裁定与钩子筛选 */
export type CardTag =
  | "negate-cast" //   发动无效（如「本回合无法打出符卡」）
  | "negate-effect" // 效果无效（如「使对方效果无效」「无视对方效果」）
  | "reverse" //       反转系（如「作用对象反转」「互换符卡」「威力互换」）
  | "immune" //        含免疫伤害
  | "reflect" //       含反弹伤害
  | "absorb" //        含吸收护盾
  | "heal" //          含回复
  | "drain" //         含生命流失
  | "spell-damage" //  含法术伤害
  | "buff" //          产生延时/持续效果
  | "manual"; //       无法完全自动化，需玩家仲裁

/** 一张符卡 */
export interface Card {
  id: string;
  name: string;
  power: number;
  text: string;
  tags: CardTag[];
  /** 效果脚本：在结算的各阶段注册钩子（见 EffectScript）。 */
  script: EffectScript;
}

/** 角色技能 */
export interface Skill {
  id: string;
  name: string;
  text: string;
  /** 冷却：每 cooldown 回合可用一次；0/1 表示每回合可用（被动技能用 passive=true）。 */
  cooldown: number;
  /** 被动技能：自动生效，无需宣告。 */
  passive: boolean;
  /** 是否需要在回合对抗开始前宣告发动。 */
  declaredAtTurnStart: boolean;
  script: EffectScript;
}

/** 角色 */
export interface Character {
  id: string;
  name: string;
  hp: number; // 直接使用给定 HP（属性装饰化，不用 20+耐）
  skills: Skill[];
  cards: Card[];
}

// ---------------------------------------------------------------------------
// 运行时状态
// ---------------------------------------------------------------------------

/** BUFF 效果分类，用于战斗日志展示。 */
export type BuffCategory =
  | "power" // 加减威力、翻倍、设定威力
  | "damage-taken" // 承受伤害增减
  | "negate" // 效果无效、发动无效、无视威力
  | "reverse" // 作用对象反转、威力互换
  | "immune-reflect-absorb" // 免疫、反弹、吸收
  | "delayed-damage" // 延迟/持续伤害
  | "heal" // 回复
  | "hp-lock" // HP 锁定
  | "other"; // 其他资源/标记类

/** 延时/持续 BUFF（历史遗留效果 / 技能造成的状态，不受本回合无效系影响） */
export interface Buff {
  id: string; // 唯一标识，便于叠加/移除
  name: string;
  owner: PlayerId; // 该 buff 归属的玩家
  createdTurn: number; // 创建于哪个回合（该回合末不计时，实现「从下回合开始」）
  remainingTurns: number; // 剩余生效回合数（-1 表示直到触发次数耗尽）
  remainingTriggers: number; // 剩余触发次数（-1 表示不限）
  script: EffectScript; // 每回合注册钩子
  data?: Record<string, number>; // buff 自身携带的数值
  activateOnCreate?: boolean; // 当回合立即生效（默认 false，下回合开始才触发）
  text?: string; // 面向玩家的效果描述
  category?: BuffCategory; // 效果分类
}

/** 单个玩家的运行时状态 */
export interface PlayerState {
  id: PlayerId;
  character: Character;
  hp: number;
  maxHp: number;
  usedCardIds: string[]; // 已使用（一次性）
  skillLastUsedTurn: Record<string, number>; // 技能上次发动回合，用于冷却
  buffs: Buff[];
  /** 角色专属资源：奏数/面具/幻觉计数/魔虚罗/元素等，按需存放。 */
  resources: Record<string, number>;
  /** 秦心情绪等离散标记。 */
  flags: Record<string, string | number | boolean>;
}

/** 完整对局状态 */
export interface GameState {
  turn: number; // 从 1 开始
  players: Record<PlayerId, PlayerState>;
  rngState: number; // 种子化 RNG 的当前状态
  /** 每回合末的 HP 快照历史，供「回溯到 N 回合前 HP」等效果使用（index = 回合末）。 */
  hpHistory: Array<Record<PlayerId, number>>;
  /** 每回合双方所受伤害/回复总量历史，供「上回合双方所受伤害总和」等效果使用。 */
  damageHistory: Array<{
    A: { physical: number; spell: number; healed: number };
    B: { physical: number; spell: number; healed: number };
  }>;
  /** 本局出现过的最高符卡威力 / 最高法术伤害等历史统计。 */
  stats: {
    maxCardPower: number;
    maxSpellDamage: number;
    totalHealBySide: Record<PlayerId, number>; // 累计回复
  };
  log: LogEntry[];
  winner: PlayerId | "draw" | null;
}

// ---------------------------------------------------------------------------
// 回合结算上下文（可变，效果钩子在其上操作）
// ---------------------------------------------------------------------------

/** 一方本回合的威力计算累加器（顺序：+X → *M → =X） */
export interface PowerCalc {
  base: number;
  adds: number[]; //  加减法（可为负）
  mults: number[]; // 乘除法（翻倍=2，减半=0.5）
  set: number | null; // 直接赋值，最后生效
}

/** 一方对某伤害包的修正层（顺序：+X → *M → =X；随后 免疫>至少/至多>反弹；再吸收） */
export interface DamageMods {
  adds: number[];
  mults: number[];
  set: number | null;
  immune: boolean; //     免疫（最高优先）
  atLeast: number | null; // 至少受到
  atMost: number | null; //  至多受到
  reflect: boolean; //    反弹给来源
  reflectMult: number; // 反弹倍率（如双倍反还=2）
}

/** 一方本回合的伤害承受配置（分物理/法术），以及吸收护盾 */
export interface SideDamageConfig {
  physical: DamageMods;
  spell: DamageMods;
  absorb: number; // 吸收护盾（先抵物理后抵法术）
  totalAtMost: number | null; // 本回合所受总伤害（物理+法术）上限，每波结算后扣减
}

/** 待结算的一次伤害/生命变动指令 */
export interface PendingDamage {
  type: DamageType;
  amount: number;
  source: PlayerId;
  target: PlayerId;
  /** 生命流失：绕过免疫/反弹（但固定HP类可挡）。 */
  isDrain?: boolean;
  /** 直接回复（正值）。 */
  isHeal?: boolean;
  /** 不吃当回合增伤，仍吃免疫/护盾/减伤（用于THE WORLD延迟结算伤害）。 */
  noBoost?: boolean;
}

/** 回合结算过程中的可变上下文 */
export interface TurnContext {
  state: GameState;
  turn: number;
  /** 本回合双方所选符卡（已揭示）。 */
  cards: Record<PlayerId, Card | null>;
  /** 本回合宣告发动的技能。 */
  activeSkills: Record<PlayerId, Skill[]>;

  power: Record<PlayerId, PowerCalc>;
  damageConfig: Record<PlayerId, SideDamageConfig>;

  /** 效果无效标记：该方的符卡「效果」被无效。 */
  effectNegated: Record<PlayerId, boolean>;
  /** 发动无效标记：该方本回合无法打出符卡。 */
  castNegated: Record<PlayerId, boolean>;
  /** 威力无视标记：该方符卡威力在对抗时视为0（不影响技能）。 */
  powerIgnored: Record<PlayerId, boolean>;
  /** 固定HP：该方本回合 HP 不会改变（可挡流失）。 */
  hpLocked: Record<PlayerId, boolean>;
  /** 互换符卡效果标记：该方本回合执行对方符卡的效果（阴阳螺旋，威力不换）。 */
  swapCardEffect: Record<PlayerId, boolean>;

  /** 结算过程中排队的伤害/回复/流失指令。 */
  pending: PendingDamage[];
  /** 本回合已对某方实际造成的伤害记录（供追加效果判断「若造成伤害」）。 */
  dealt: Record<PlayerId, { physical: number; spell: number }>;
  /** 本回合按伤害波记录的实际伤害（供「每次成功造成伤害」按波触发类技能）。 */
  waveDealt: Record<PlayerId, { physical: number; spell: number }[]>;
  /** 最近一次结算完成的伤害波（实际造成伤害，供 applyWave 读取）。 */
  currentWave: { target: PlayerId; physical: number; spell: number } | null;
  /** 本回合某方实际回复的生命总量。 */
  healed: Record<PlayerId, number>;

  /** 本回合威力对抗产生的物理伤害快照（供「彼岸剑：重复对抗」等）。 */
  clashDamage: { source: PlayerId; target: PlayerId; amount: number } | null;
  /** 请求在回合末重复一次本回合对抗（彼岸剑）。 */
  repeatClash: boolean;

  rng: Rng;
  log: (entry: Omit<LogEntry, "turn">) => void;
  /** 请求玩家决策（可选效果），MVP 阶段由调用方注入解析器。支持同步或异步返回。 */
  decide: (req: DecisionRequest) => number | Promise<number>;
}

// ---------------------------------------------------------------------------
// 效果脚本 —— 阶段钩子
// ---------------------------------------------------------------------------

/** 结算阶段 */
export type Phase =
  | "preTurnStart" // 回合开始前的互换类效果（阴阳螺旋）
  | "turnStart" //   回合开始
  | "priority" //    优先级裁定（无效/反转）
  | "power" //       威力计算
  | "clash" //       威力对抗 → 生成物理伤害
  | "damage" //      伤害配置（免疫/反弹/吸收/增减）
  | "apply" //       结算伤害/回复/流失后的追加触发
  | "turnEnd"; //    回合结束

export interface EffectContext {
  ctx: TurnContext;
  self: PlayerId; // 效果拥有者
  foe: PlayerId; // 对手
  /** 当日截稿：当前处于己方符卡负面效果转移状态时，addBuff 会把 self 类 BUFF 转交给 foe */
  transferActive?: boolean;
}

/**
 * 效果脚本：为若干阶段注册处理函数。
 * 通过组合原子效果（effects.ts）或直接写 handler 表达符卡/技能/ buff。
 * 支持同步或异步返回（用于需要等待玩家决策的场景）。
 */
export type EffectScript = Partial<Record<Phase, (ec: EffectContext) => unknown | Promise<unknown>>> & {
  /** 按伤害波触发：每次成功造成伤害的波结算后立即执行（含彼岸剑「重复对抗」波）。读取 ctx.currentWave。 */
  applyWave?: (ec: EffectContext) => unknown | Promise<unknown>;
};

// ---------------------------------------------------------------------------
// 玩家决策请求（「可选择」类效果）
// ---------------------------------------------------------------------------

export interface DecisionRequest {
  player: PlayerId;
  prompt: string;
  /** 选项索引 → 描述。返回所选索引。 */
  options: string[];
  /** 数值选择（如「提升1至8点威力」），返回 [min,max] 内整数。 */
  range?: { min: number; max: number };
}

// ---------------------------------------------------------------------------
// 日志 & RNG
// ---------------------------------------------------------------------------

export interface LogEntry {
  turn: number;
  phase?: Phase;
  msg: string;
  data?: Record<string, unknown>;
  type?: "physical" | "spell" | "hp" | "buff" | "info";
}

export interface Rng {
  /** 掷 1dN，返回 [1,n]。 */
  d(n: number): number;
  /** [0,1) 随机数。 */
  next(): number;
  /** 返回当前内部状态，供快照。 */
  getState(): number;
}
