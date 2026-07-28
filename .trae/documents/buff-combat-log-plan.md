# 战斗结算 BUFF 与优先级日志方案

## 背景

用户希望战斗结算日志能完整列出：
1. 双方本回合打出的符卡及其效果；
2. 双方本回合宣告的技能及其效果；
3. 双方当前生效的 BUFF（加减威力、无效效果、免疫/反弹/吸收、延迟伤害等）及其剩余时长；
4. 上述效果的优先级/生效顺序。

目前 `resolver.ts` 已能记录符卡名称、技能名称和优先级顺序，但 BUFF 只有内部 `name`，没有面向玩家的效果描述和分类，无法在日志中清晰展示。

## 推荐方案：增量式给 Buff 增加描述与分类

给 `BuffSpec` / `Buff` 增加两个可选字段：
- `text?: string`：面向玩家的效果描述。
- `category?: BuffCategory`：效果分类，用于在日志中标记 `[威力]`、`[无效]`、`[免疫/反弹/吸收]`、`[延迟伤害]` 等。

未填写时降级显示为 `[其他] {name}`，避免一次性改全量数据文件导致改动过大。本次实现会同步为现有核心 BUFF 补齐 `text` 与 `category`。

## 具体修改

### 1. 类型层（packages/engine/src/types.ts）

新增分类类型：

```ts
export type BuffCategory =
  | "power"              // 加减威力、翻倍、设定威力
  | "damage-taken"       // 承受伤害增减
  | "negate"             // 效果无效、发动无效、无视威力
  | "reverse"            // 作用对象反转、威力互换
  | "immune-reflect-absorb"
  | "delayed-damage"     // 延迟/持续伤害
  | "heal"               // 回复
  | "hp-lock"            // HP 锁定
  | "other";
```

`Buff` 接口增加：

```ts
text?: string;
category?: BuffCategory;
```

### 2. BUFF 辅助层（packages/engine/src/buffs.ts）

`BuffSpec` 接口同样增加 `text?` 与 `category?`。
`addBuff` 生成 `Buff` 时把这两个字段透传过去。

### 3. 结算日志（packages/engine/src/resolver.ts）

在 `resolveTurn` 中调整日志顺序为：
1. 双方符卡 + 效果文本；
2. 双方宣告技能 + 效果文本；
3. 当前生效 BUFF 列表（`turnStart` 阶段，type="buff"）；
4. 优先级顺序与生效顺序说明。

新增辅助函数：
- `formatBuffRemaining(b)`：格式化剩余回合/触发次数。
- `logActiveBuffs(state, turn, order, log)`：按 `prio.order` 列出双方生效 BUFF，过滤规则为 `!(b.createdTurn === turn && !b.activateOnCreate)`（本回合新建且非立即生效的 buff 不显示）。

BUFF 列表日志格式示例：

```
T2 turnStart 妖梦（A）当前生效 BUFF（共 1 个）：
T2 turnStart   [威力] 现世斩-威力降低：下回合对方符卡威力降低 4 点（剩余 1 回合 / 1 次）
T2 turnStart BUFF/技能生效顺序：先处理 A，再处理 B；同玩家按上表从上至下
```

### 4. 角色数据（packages/engine/src/data/*.ts）

为所有 `addBuff` 调用补充 `text` 与 `category`。典型改法示例：

```ts
addBuff(ec, {
  id: "genseizan-debuff",
  name: "现世斩-威力降低",
  owner: ec.self,
  turns: 2,
  triggers: 1,
  text: "下回合对方符卡威力降低 4 点",
  category: "power",
  script: { power: (e) => addPower(e, -4, e.foe) },
});
```

动态数值使用模板字符串，例如：

```ts
text: `下回合吸收 ${ratio} 点伤害`,
category: "immune-reflect-absorb",
```

涉及文件（按优先级分批补齐）：
- 核心角色：`youmu.ts`、`cirno.ts`、`koishi.ts`、`satori.ts`、`sakuya.ts`、`reisen.ts`、`flandre.ts` 等；
- 其余角色文件按相同模式补齐。

### 5. 客户端（可选，本次不包含）

`packages/client/main.ts` 的 `appendLog` 已把 `entry.type` 作为 CSS class，`style.css` 已存在 `.log-line.buff` 样式，因此 BUFF 日志会自然显示为绿色。如需按 `category` 着色，可在后续迭代中读取 `entry.data.category` 动态追加 class，本次不做。

## 验证方案

1. **类型检查**：运行项目类型检查，确保新增可选字段不破坏现有调用。
2. **回归测试**：运行全部测试，检查是否有测试因日志条数/内容变化而失败。
3. **新增测试**：在 `packages/engine/tests/` 下补充日志断言：
   - 符卡/技能效果文本被记录；
   - BUFF 在生效回合出现在 `turnStart` 日志中；
   - 本回合新建且 `activateOnCreate=false` 的 BUFF 被过滤；
   - `activateOnCreate=true` 的 BUFF 本回合即显示；
   - BUFF 列表顺序与 `prio.order` 一致。
4. **联调验证**：启动服务端与客户端，实际对局检查日志显示与样式。

## 关键注意点

- `text` 是面向玩家的描述，后续修改 BUFF 脚本逻辑时必须同步更新 `text`，否则日志会误导玩家。
- 动态数值的 BUFF 在 `addBuff` 时应把具体数值写入 `text`，避免显示模糊的模板。
- 日志在 `turnStart` 阶段输出，因此本回合新建的非立即生效 BUFF 会被过滤，这与 BUFF 的实际生效时机保持一致。
