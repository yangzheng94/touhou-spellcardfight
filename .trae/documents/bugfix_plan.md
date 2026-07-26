# Bug修复与功能验证计划

## 概述
按照优先度顺序依次完成功能验证和近似实现修正任务。

---

## 第一阶段：高优先级功能验证

### 任务 1: t13 - 验证咲夜-花开夜触发条件
**目标**: 确保"花开夜"技能只在造成伤害时才弹出选择提示

**检查点**:
1. 检查 `sakuya.ts` 中 `sakuya-hanahiraku` 技能实现
2. 验证 `apply` 阶段的伤害判断逻辑
3. 确认只有 `totalDmg > 0` 时才会调用 `requestDecision`

**相关文件**:
- `packages/engine/src/data/sakuya.ts`

---

### 任务 2: t10 - 验证未来视机制完整流程
**目标**: 测试未来视（圣娅-未来视技能）的完整工作流程

**检查点**:
1. 检查服务器端 `room.ts` 中的 `submitMove` 处理逻辑
2. 验证 `foresightReveal` 消息正确发送
3. 确认客户端正确显示对方已选符卡
4. 验证双方选择后正常结算

**相关文件**:
- `packages/server/src/room.ts`
- `packages/client/main.ts`
- `packages/engine/src/data/seija.ts`

---

### 任务 3: t9 - 验证咲夜-幻世【THE WORLD】伤害延迟结算
**目标**: 确保伤害正确延迟至下下回合结算

**检查点**:
1. 检查 `sakuya.ts` 中 `sakuya-world` 符卡的实现
2. 验证 buff 的触发时机（turnStart → damage → turnEnd）
3. 确认伤害存储和释放逻辑正确
4. 验证双方伤害都被正确延迟

**相关文件**:
- `packages/engine/src/data/sakuya.ts`

---

## 第二阶段：中优先级近似实现修正

### 任务 4: t5 - 修正古明地恋-紧闭的恋之瞳
**目标**: 真正监听威力调整事件，而非检查数组长度

**当前问题**:
```typescript
// 当前实现：检查 power 数组长度
const changed = ec.ctx.power[ec.self].adds.length + 
  ec.ctx.power[ec.self].mults.length + 
  ec.ctx.power[ec.foe].adds.length + 
  ec.ctx.power[ec.foe].mults.length > 0;
```

**修正方案**:
- 需要在 `resolver.ts` 中的威力计算阶段添加事件标志
- 或者在 `power` 阶段执行后检查是否有修改发生

**相关文件**:
- `packages/engine/src/data/koishi.ts`
- `packages/engine/src/resolver.ts` (可能需要修改)

---

### 任务 5: t6 - 修正帕秋莉-花昙的魔女
**目标**: 实现自身法术伤害X1.5，而非对方法术伤害X1.5

**当前问题**:
```typescript
// 当前实现：对方法术伤害X1.5
damage: (ec) => ec.ctx.damageConfig[ec.foe].spell.mults.push(1.5),
```

**正确实现**:
```typescript
// 应改为：对方受到的法术伤害X1.5（即自身造成的法术伤害X1.5）
damage: (ec) => ec.ctx.damageConfig[ec.foe].spell.mults.push(1.5),
```

**说明**: 经过分析，当前实现实际上是正确的！`damageConfig[ec.foe].spell.mults` 是作用在对方身上的法术伤害倍率，也就是己方造成的法术伤害。但需要验证这个理解是否正确。

**相关文件**:
- `packages/engine/src/data/patchouli.ts`
- `packages/engine/src/resolver.ts` (验证 damageConfig 逻辑)

---

### 任务 6: t7 - 修正骊驹早鬼-圣德太子的天马
**目标**: 实现"双方无视对方威力造成伤害"，而非威力清零

**当前问题**:
```typescript
// 近似实现：双方威力清零后按符卡效果结算
power: (ec) => {
  setPower(ec, 0, ec.self);
  setPower(ec, 0, ec.foe);
},
```

**正确逻辑**:
- "无视对方威力" 应该是指伤害计算时不考虑对方的威力加成/减免
- 而不是将威力清零

**修正方案**:
- 需要理解引擎中"无视威力"的正确实现方式
- 可能需要添加新的引擎原语或使用现有机制

**相关文件**:
- `packages/engine/src/data/sagume.ts`
- `packages/engine/src/resolver.ts` (检查威力计算逻辑)
- `packages/engine/src/effects.ts` (检查是否有 ignorePower 函数)

---

## 第三阶段：中优先级功能验证

### 任务 7: t11 - 验证秦心-情绪系统
**目标**: 验证情绪切换对伤害和回复的影响

**检查点**:
1. 检查 `hata.ts` 中情绪系统的实现
2. 验证"忧"状态下回复量是否翻倍
3. 验证"喜"状态下物理伤害是否翻倍
4. 验证"怒"状态下法术伤害是否翻倍

**相关文件**:
- `packages/engine/src/data/hata.ts`

---

### 任务 8: t12 - 验证蕾米莉亚-七重奏
**目标**: 验证奏数计算和威力归零逻辑

**检查点**:
1. 检查 `remilia.ts` 中奏数的初始化和递增逻辑
2. 验证奏数超过7时是否变回1
3. 验证当己方威力为奏数倍数时，对方威力是否归零

**相关文件**:
- `packages/engine/src/data/remilia.ts`

---

### 任务 9: t14 - 验证古明地觉-脑指纹测谎法
**目标**: 验证符卡互换的正确性

**检查点**:
1. 检查 `satori.ts` 中 `satori-shimon` 符卡的实现
2. 验证 `turnStart` 阶段的符卡互换逻辑
3. 确认互换后威力和效果都正确切换

**相关文件**:
- `packages/engine/src/data/satori.ts`

---

### 任务 10: t15 - 检查其他潜在问题
**目标**: 全面检查所有角色数据文件的其他潜在问题

**检查点**:
1. 检查所有技能和符卡的 `text` 描述是否与 TXT 文件一致
2. 检查所有导入的函数是否实际被使用（编译时会报错）
3. 检查 buff 的 `turns` 和 `triggers` 设置是否正确
4. 检查资源和标志的命名是否规范
5. 检查是否有遗漏的效果实现

**相关文件**:
- `packages/engine/src/data/*.ts` (所有角色数据文件)

---

## 执行步骤

1. **从高优先级任务开始** (t13 → t10 → t9)
2. **每个任务**:
   a. 阅读相关源码
   b. 分析当前实现是否正确
   c. 如有问题则进行修复
   d. 编译验证
   e. 总结验证结果
3. **按顺序执行**，完成一个任务后再开始下一个

## 风险处理
- 如遇到引擎级别的问题（如需要新增API），记录下来并跳过，待所有角色数据修正完成后再处理
- 如遇到逻辑复杂的功能（如七曜魔法融合），标记为"需要引擎支持"并跳过
- 每完成一个任务后进行编译验证，确保没有引入新错误
