# 场景交互系统 v0.2 — 设计规格

| 项 | 内容 |
|----|------|
| 文件名 | `2026-08-08-scene-interaction-v02-design.md` |
| 扩展 | `ext-27b96b` / 场景交互系统（**同一扩展，非新建 extension**） |
| 作者 | 池水三两升 |
| 日期 | 2026-08-08 |
| 版本 | 0.2.0 |
| 状态 | 已实现（计划 Tasks 1–11 + 双模块拆分）；计划见 `docs/superpowers/plans/2026-08-08-scene-interaction-v02.md` |
| 前置 | v0.1 规格 `2026-08-08-scene-interaction-system-design.md` |
| 参考 | 大地图 `openMap` + `ctx.ui.show`；SDK `UIAPI` / 方法 async 等待 |

---

## 1. 目标与范围

### 1.1 目标

在 v0.1 之上交付：

1. **物品配方**：编辑器可配置；玩家背包内可合成（扣原料、发产物）。
2. **玩家运行时界面**：本扩展内**另一套 UI**（非新扩展），由剧本方法打开；存在于**对话框层之下**；打开期间**阻塞剧情**。
3. **文案打磨**：物品「可堆叠」说明改为简短中文。

### 1.2 已确认决策

| 决策 | 选择 |
|------|------|
| 扩展边界 | 仍为包 id `ext-27b96b`；包内多个 `@extension` 程序 |
| 模块划分 | `editor`（编辑器）+ `scene-interaction`（游戏运行时）；日后 `backpack-hud` |
| 数据归属 | **A**：settings（场景/物品/配方库等）挂 `editor`；save（库存/进度/当前场景）挂 `scene-interaction` |
| 跨模块读库 | 运行时用 `ctx.settings.cross.get("editor", key)` |
| 打开方式 | 剧本方法显式开关（方案 A） |
| 预览 vs 玩家 | `scene-interaction` 内 RuntimeShell 预览 + PlayerShell 阻塞会话 |
| 配方范围 | 编辑器 + 背包合成 UI（方案 A） |
| 架构路径 | 对齐大地图：`ui.show` + async 等待关闭（方案 1） |

### 1.3 v0.2 范围

- 编辑器顶栏增加 **配方** 分区（列表 + 属性：原料/产物选自物品库）
- settings：`recipesLibraryJson`
- domain：合成可行性、扣减、发放；`consumeItem`；可选 `craftRecipe` 方法
- **PlayerShell**（玩家界面）：场景交互 + 快捷栏 + 背包（含合成页）+ toast + 退出
- 方法：`openSceneInteraction` / `closeSceneInteraction`（阻塞语义见 §4）
- 堆叠 checkbox 描述简化为：`开启后相同物品合并数量；关闭则每次独立获得`

### 1.4 明确不在 v0.2

- 新建独立 extension / 独立安装包
- 配方失败概率、工作台、解锁条件、合成动画特效
- 交互点动作「打开合成面板」（可再下一版）
- 与大地图互跳
- 修改 `sdk/`；不手改 `dist/`
- 不改变 `extension.json.id`

---

## 2. 整体架构

同包多程序（对齐 phone-sdk 具名导出多个 `@extension`）：

```
ext-27b96b（extension.json.id，不变）
├── @extension id: "editor"              → EditorShell（场景 | 物品库 | 配方）
├── @extension id: "scene-interaction" → RuntimeShell / PlayerShell + 剧本方法 + save
└── @extension id: "backpack-hud"（后续）→ 快捷栏/背包 HUD
```

| 程序 id | label | settings | save | render | 主要方法 |
|---------|-------|----------|------|--------|----------|
| `editor` | 编辑器 | 场景/物品/配方库、设计分辨率、编辑器栏宽、主题等 | 无（或仅编辑态草稿） | EditorShell | 可选 `openEditor` |
| `scene-interaction` | 场景交互 | 可保留 HUD 相关（至 backpack-hud 迁出前） | inventory / progress / currentSceneId | RuntimeShell 或 PlayerShell | `openSceneInteraction` / `close` / `giveItem`… |
| `backpack-hud`（后续） | 背包HUD | HUD 外观 | 读同一套库存（跨模块约定） | 快捷栏+背包 | — |

**入口导出（`src/index.tsx`）**

```ts
export { EditorExtension } from "./modules/editor-extension";
export { SceneInteractionExtension } from "./modules/scene-interaction-extension";
export default SceneInteractionExtension; // 默认游戏运行时
```

**数据**

- 作者内容 → **`editor` settings**：`scenesLibraryJson`、`itemsLibraryJson`、`recipesLibraryJson`、设计分辨率等
- 玩家进度 → **`scene-interaction` save**：库存、hotspot 进度、`currentSceneId`
- 运行时读库：`ctx.settings.cross.get("editor", "scenesLibraryJson")` 等
- UI：`ctx.ui.show("editor")` / `ctx.ui.show("scene-interaction")`（scoped 路径由宿主补全）

**界面**

| 界面 | 程序 | 谁打开 |
|------|------|--------|
| 编辑器壳 | `editor` | Studio 显示界面 / `openEditor` |
| 预览壳 RuntimeShell | `scene-interaction` | Studio 预览该程序（非 modal） |
| 玩家壳 PlayerShell | `scene-interaction` | 仅 `openSceneInteraction`（modal 阻塞） |

**层级**

- 程序 UI 经宿主 `ctx.ui.show` 挂载，默认叠在对话框层之下。
- 阻塞剧情靠 `openSceneInteraction` async 等待关闭。

---

## 3. 配方数据与合成规则

### 3.1 settings：`recipesLibraryJson`

```ts
interface RecipesLibrary {
  version: 1;
  recipes: RecipeDefinition[];
}

interface RecipeDefinition {
  id: string;
  name: string;
  /** 原料列表；同一 itemId 允许多条，运行时按 itemId 合计需求 */
  ingredients: { itemId: string; count: number }[];
  /** 产物列表；成功后按 count 发放（走现有堆叠/唯一规则） */
  products: { itemId: string; count: number }[];
  description?: string;
}
```

序列化：与物品库同级；非法 JSON 回退 `{ version: 1, recipes: [] }`；导入导出可单独 JSON 或并入扩展导出策略（实现计划定）。

### 3.2 合成规则

1. **可行性**：对每个 `itemId`，`getItemCount(inventory, itemId) >= 需求合计`。
2. **不足**：合成按钮禁用；可选一行「原料不足」。
3. **成功**：
   - 按原料 `consumeItem`（堆叠减 count；unique 按实例移除对应份数）；
   - 再按产物多次/批量 `giveItem`（复用 v0.1 堆叠逻辑）。
4. **原子性**：同一 tick 内先校验再扣再发；中途物品定义缺失则整次失败并 log，不半扣。
5. **不做**：概率、冷却、工作台、解锁条件。

### 3.3 编辑器

- 顶栏 Tab：**场景 | 物品库 | 配方**
- 左：配方列表（新建/删除/选中）
- 中：只读摘要或简易预览（原料 → 产物）
- 右：Schema 属性（name、description、ingredients[]、products[]；itemId 下拉来自物品库）

### 3.4 玩家合成 UI

- 入口：玩家界面背包内「合成」页/标签
- 列表：全部配方；可合成与不可合成视觉区分
- 操作：选中 → 确认合成 → 刷新库存与列表

---

## 4. 玩家界面、方法与阻塞

### 4.1 PlayerShell

- 全屏：`SceneView` + 快捷栏 + 背包（含合成）+ toast
- 无编辑器顶栏；显式 **退出/关闭** 控件
- 通过 `render()` props 区分，例如：
  - 预览：`playerPresentation: true`（现有）且非 modal 会话
  - 玩家：`playerPresentation: true` + `playerSession: "modal"`（或等价标志）
- 复用 alpha-hit、库存 HUD 设置（`withScene` / `always` 在玩家会话中按「场景已打开」处理，默认显示）

### 4.2 剧本方法

| 方法 id | 标题 | 行为 |
|---------|------|------|
| `open-scene-interaction` | 打开场景交互 | 可选 `sceneIdOrName`；写入 `currentSceneId`、`isEditMode=false`；`ctx.ui.show` 挂载玩家界面；**await 关闭 Promise**；可选 `resultVariable` |
| `close-scene-interaction` | 关闭场景交互 | `ctx.ui.hide`；resolve 等待；可选 `resultVariable` |
| `craft-recipe`（可选） | 按配方合成 | 无 UI，纯逻辑；供剧本直接合成 |

**与现有 `openScene` 关系**

- `openScene`：保留；用于预览/轻量切场景；**不**承诺阻塞剧情。
- 需要「打开并卡住剧情直到玩家退出」时，作者应使用 `openSceneInteraction`。

### 4.3 阻塞实现

```
openSceneInteraction:
  1. 解析并写入 currentSceneId / isEditMode
  2. await ctx.ui.show(UI_ID, { playerPresentation, playerSession: "modal" }, fullScreen)
  3. await waitUntilPlayerUiClosed()   // 模块内 Promise；关闭时 resolve
  4. 写 resultVariable = true 并返回  → 引擎继续后续剧情

close / 界面退出:
  1. ctx.ui.hide(UI_ID)
  2. resolve waitUntilPlayerUiClosed()
```

- 若宿主后续对程序 UI 的 `show` 支持 `modal` 字段，可叠加传入（类型允许则写入 options）。
- 重复打开：若已在等待中，二次 `open` 应 no-op 或排队策略在实现计划中定为「复用同一等待 / 忽略二次打开」。

### 4.4 关闭途径

1. 玩家界面内「退出」
2. 剧本 `closeSceneInteraction`
3. （可选）宿主 `ui.hideAll` —— 需在 `onRegister` 或壳层侦听可见性，避免 Promise 永挂；实现计划必须覆盖

---

## 5. 库存扣减（新）

```ts
/** 从库存扣除指定物品数量；不足则失败不改动 */
function consumeItem(
  state: InventoryState,
  itemId: string,
  count: number,
  items: ItemDefinition[],
): { ok: true; state: InventoryState } | { ok: false; reason: string }
```

- 堆叠：优先减 stack.count，减到 0 移除条目
- unique：按 `lastGainedAt` 从旧到新或新到旧移除 N 条（实现计划固定一种并测）
- `craftRecipe` / 合成 UI 均走此函数 + `giveItem`

---

## 6. 文案

| 位置 | 原文 | 新文案 |
|------|------|--------|
| 物品 Schema「可堆叠」description | 开启后同 id 物品合并为一条 stack；关闭则为 unique 实例 | 开启后相同物品合并数量；关闭则每次独立获得 |

预览面板「不可堆叠（唯一实例）」可保留或改为「不可堆叠」——实现时与上表语气一致即可。

---

## 7. 测试要点

- recipes 序列化 round-trip；非法 JSON 回退空库
- `canCraft` / `craft`：原料不足失败；成功扣减与发放；unique 消耗份数
- `consumeItem`：堆叠截断、不足回滚
- 方法层：可用 mock `ui.show/hide` 验证等待 Promise 在 close 后结束（若测试环境可注入）
- 回归：v0.1 场景/物品/库存/alpha-hit 单测仍通过

---

## 8. 风险与宿主依赖

| 风险 | 缓解 |
|------|------|
| 程序 UI `show` 无官方 modal 字段 | 用 async 方法等待关闭阻塞剧情；文档写明作者用法 |
| `hideAll` 导致 Promise 泄漏 | 壳层/注册钩子在不可见时 resolve |
| 配方引用已删物品 | 编辑器警告；运行时该配方不可用 |
| PlayerShell 与预览壳行为分叉 | 共享 SceneView / inventory 逻辑，仅壳不同 |

---

## 9. 里程碑（实现计划将拆任务）

1. 文案 + `recipes` 类型/序列化/consume/craft 纯逻辑与单测  
2. 编辑器「配方」分区 + Schema  
3. PlayerShell + App 分流 props  
4. `openSceneInteraction` / `closeSceneInteraction` 等待关闭  
5. 背包合成 UI  
6. 打磨与构建验收  

---

## 10. 规格自检

- [x] 无「TBD/稍后决定」占位（重复打开策略留实现计划二选一）
- [x] 与「非新扩展、对话框下、阻塞剧情」一致
- [x] 配方范围与已选方案 A 一致
- [x] 未把预览壳与玩家壳合并
- [x] 未引入修改 sdk/ 或改 extension id
