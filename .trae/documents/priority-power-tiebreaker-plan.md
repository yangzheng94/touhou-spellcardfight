# 优先级同等级时按威力判定先攻计划

## 背景与问题

当前 `packages/engine/src/priority.ts` 的优先级规则为：

1. `negate-cast`（发动无效）> `negate-effect`（效果无效）> `reverse`（反转系）> `other`（其余）。
2. 当两张符卡优先级等级相同时，采用**随机**决定先攻方（`rng.next() < 0.5`）。

这会导致同等级符卡的效果执行顺序不稳定。例如「幻想风靡」（power 10，等级 other）与「冰瀑」（power 6，等级 other）相遇时，结果可能因随机种子而不同，玩家难以通过出牌策略影响结果。

## 目标

在保持「无效系 > 反转系 > 其余」这一优先级层次的前提下，当**非无效系**符卡处于同一优先级等级时，改为按**符卡基础威力**判定先攻：威力高者先结算；威力相同再回退到随机。

## 方案

### 修改点 1：`packages/engine/src/priority.ts`

调整 `computePriorityOrder` 的同级处理逻辑：

- 若 `rankA > rankB`：A 先攻。
- 若 `rankB > rankA`：B 先攻。
- 若等级相同且均为非无效系（rank < `PRIORITY_RANK["negate-effect"]`）：比较两张卡的基础 `power`，高者先攻；`power` 相同则随机。
- 若等级相同且至少一方为无效系：维持原有随机规则，确保发动无效/效果无效的对抗仍保持原有不确定性（或按用户后续要求再调整）。

### 修改点 2：相关测试更新

- 检查 `packages/engine/tests/golden.test.ts`、`packages/engine/tests/battle_sim.test.ts`、`packages/engine/tests/resolver-log.test.ts` 等是否对具体先攻方有强断言。
- 若存在依赖旧随机顺序的测试，改为断言符合新规则（高威力先攻）或调整期望值。
- 可新增一个专门测试：同等级时高威力符卡先攻。

### 修改点 3：日志与客户端

优先级日志已经输出 `优先级顺序: A → B（先攻 A）`，无需额外改动。客户端仅展示该日志，无需修改。

## 验证

1. 运行 `npm run test`，确保全部测试通过。
2. 运行 `npm run typecheck`，确保无类型错误。
3. 手动验证：幻想风靡（power 10）vs 冰瀑（power 6）时，幻想风靡先攻。
