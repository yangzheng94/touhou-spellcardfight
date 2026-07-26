# 角色数据录入指南（供子代理）

你要把**一名东方角色**编码为一个 TypeScript 数据文件，放在
`packages/engine/src/data/<角色英文id>.ts`，导出一个 `Character` 对象。

## 引擎 API（全部从相对路径导入）

```ts
import type { Character, EffectContext, PlayerId } from "../types.js";
import {
  // 威力（顺序 +X→翻倍→=X）
  addPower, multPower, setPower,
  // 伤害承受配置（作用于「承受方」）
  immune, reflect, immuneAndReflect, addAbsorb,
  addTakenDamage, multTakenDamage,
  // 产生伤害/回复/流失（排队，稍后统一结算）
  dealSpell, dealPhysical, drainLife, heal,
  // 无效/反转/固定HP/无视威力
  negateEffect, negateCast, ignorePower, lockHp,
  // 直接 HP 操作（非伤害）
  setHp, adjustHp, hpOf,
  // 其它
  requestRepeatClash, cardPowerOf,
} from "../effects.js";
import { addBuff, consumeTrigger, getRes, setRes, addRes, getFlag, setFlag } from "../buffs.js";
```

**只 import 你实际用到的函数**（tsconfig 开启 noUnusedLocals，多余导入会编译报错）。

## 类型速览

```ts
interface Character { id: string; name: string; hp: number; skills: Skill[]; cards: Card[]; }
interface Skill {
  id: string; name: string; text: string;
  cooldown: number;               // 每 N 回合一次；被动填 1
  passive: boolean;               // 被动技能=true，自动生效
  declaredAtTurnStart: boolean;   // 需回合开始前宣告=true
  script: EffectScript;
}
interface Card {
  id: string; name: string; power: number; text: string;
  tags: CardTag[];                // 见下「标签」
  script: EffectScript;
}
type EffectScript = Partial<Record<Phase, (ec: EffectContext) => void>>;
type Phase = "turnStart"|"priority"|"power"|"clash"|"damage"|"apply"|"turnEnd";
```

`EffectContext`：`ec.self`（效果拥有者 PlayerId）、`ec.foe`（对手）、`ec.ctx`（回合上下文）。
常用 `ec.ctx` 字段：
- `ec.ctx.turn` 当前回合数
- `ec.ctx.cards[who]` 本回合某方符卡（可能 null），`.power` 是基础威力
- `ec.ctx.dealt[who]` = `{physical, spell}` 本回合已对 who 造成的伤害（apply 阶段后有效）
- `ec.ctx.state.players[who].hp` 当前 HP；`.maxHp`、`.resources`、`.flags`、`.buffs`
- `ec.ctx.state.stats` = `{ maxCardPower, maxSpellDamage, totalHealBySide }` 本局统计
- `ec.ctx.decide({player, prompt, options, range})` 请求玩家二选一/选数值，返回索引或数值
- `ec.ctx.rng.d(n)` 掷 1dN

## 各阶段用途（按结算顺序）

1. **turnStart** —— 回合开始：资源自增（奏数/面具）、施放持续 buff、条件预判。
2. **priority** —— 只放**无效/反转**类效果（`negateEffect`/`negateCast`/反转），并给卡打对应 tag。
3. **power** —— 威力增减：`addPower/multPower/setPower`（可对 ec.self 或 ec.foe）。
4. **clash** —— 威力对抗刚产生物理伤害后（此时可改「对方受到的物理伤害」倍率等）。
5. **damage** —— 配置承受：`immune/reflect/addAbsorb/addTakenDamage/multTakenDamage`；产生法术伤害 `dealSpell`。
6. **apply** —— 伤害结算后追加：读 `ec.ctx.dealt` 判断「若造成/受到伤害」再 `dealSpell` 等。
7. **turnEnd** —— 回合结束：回复/流失、`requestRepeatClash`、双方 HP 减半（`setHp`）、施放下回合 buff。

> 关键：**产生伤害**（dealSpell/dealPhysical）会排队并在当前阶段末统一结算，可被目标的
> immune/reflect/absorb 影响。**drainLife/heal/setHp/adjustHp** 是直接生命变动，不算伤害
> （免疫/反弹挡不住流失；但 `lockHp` 固定HP能挡流失、回复、伤害）。

## 延时/持续效果 → 用 buff

「下回合…」「接下来N回合…」「直到触发X次」用 `addBuff`：
```ts
addBuff(ec, {
  id: "unique-id", name: "显示名", owner: ec.self,
  turns: 2,       // 生效回合数；创建当回合不计，故「下回合」用 turns:2 + triggers:1
  triggers: 3,    // 触发次数上限（可选，-1不限）
  script: { power: (e) => addPower(e, -4, e.foe) },  // buff 每回合注册的钩子
});
```
- 「下回合对方威力-4」→ `turns:2, triggers:1`，script 用 `power`。
- 「接下来3回合每回合对方受3物理」→ `turns:4`（覆盖之后3个回合），script 用 `turnEnd: e=>dealPhysical(e,3)`。
  （turns 比回合数多1，因为创建回合不计。）
- buff 属于 BUFF 类，**不受对方无效系影响**（符合规则）。

## 专属资源（用 resources / flags）

- 奏数、面具数、幻觉计数、魔虚罗计数、元素记录等 → `addRes/getRes/setRes`（数值），`setFlag/getFlag`（字符串状态如情绪）。
- 例：面具 `addRes(ec, ec.self, "masks", 1)`；情绪 `setFlag(ec, ec.self, "emotion", "喜")`。

## 标签（CardTag）—— 供优先级裁定，务必正确标注

- `negate-cast`：发动无效（如「本回合无法打出符卡」）
- `negate-effect`：效果无效（如「使对方效果无效」「无视对方效果」）
- `reverse`：反转系（如「作用对象反转」「互换符卡/威力」）
- 其余可选描述性标签：`immune reflect absorb heal drain spell-damage buff manual`
- **无法用现有 API 精确实现的复杂效果**：仍尽力实现主体，并加 `manual` 标签 + 代码注释说明取舍。

## 无视威力/无视效果的实现

- 「本回合无视对方威力（符卡威力视为0，不影响技能）」→ `priority: ec => ignorePower(ec, ec.foe)`，tag 加 `ignore-power`
- 「无视对方一半威力（全部威力来源）」→ `power: ec => multPower(ec, 0.5, ec.foe)`
- 「使对方效果无效」→ `priority: ec => negateEffect(ec, ec.foe)`，tag 加 `negate-effect`
- 「本回合无法打出符卡/无视对方符卡」→ `priority: ec => negateCast(ec, ec.foe)`，tag 加 `negate-cast`
  - 「无视对方符卡」= 同时无效威力+效果，组合使用：`priority: ec => { ignorePower(ec, ec.foe); negateEffect(ec, ec.foe); }`

## 参照实现

完整范例见 `packages/engine/src/data/youmu.ts`（妖梦），已通过测试。**请严格模仿其结构与风格。**

## 交付要求

1. 文件 `packages/engine/src/data/<id>.ts`，导出 `export const <id>: Character = {...}`。
2. id 用角色英文小写（见分配表）。技能/符卡 id 用 `<角色id>-<拼音简写>`，保证全局唯一。
3. 逐字对照规则原文，`text` 字段填**原文描述**。
4. 尽量自动化；实在无法表达的用 `manual` 标签+注释，不要臆造规则。
5. 不要修改引擎其它文件。若发现缺少某个原语，在文件顶部注释里写明「需要引擎补充：XXX」，并用最接近的现有 API 近似实现。
