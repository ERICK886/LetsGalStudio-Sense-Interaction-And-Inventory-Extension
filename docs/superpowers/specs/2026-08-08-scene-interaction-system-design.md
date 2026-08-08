# 场景交互系统 — 设计规格

| 项 | 内容 |
|----|------|
| 文件名 | `2026-08-08-scene-interaction-system-design.md` |
| 扩展 | `ext-27b96b` / 场景交互系统 |
| 作者 | 池水三两升 |
| 日期 | 2026-08-08 |
| 版本 | 0.1.0-draft |
| 状态 | 已批准；实现计划见 `docs/superpowers/plans/2026-08-08-scene-interaction-system.md` |
| 参考 | 编辑器范式参考 `ext-5f4afa`（大地图系统）；**数据 JSON 独立定义，不对齐大地图格式；不做与大地图互跳** |

---

## 1. 目标与范围

### 1.1 目标

为 LetsGal Studio 提供「场景交互」程序扩展：作者用内置可视化编辑器配置多场景底图与交互图片、物品库与物品栏外观；玩家运行时可点击交互点执行动作链（跳转场景、给予物品并轻提示），并通过左侧 8 格快捷栏与完整背包查看物品。

### 1.2 v0.1 范围（已批准）

- 架构：重度复用大地图的分层与编辑器壳（方案 1），自建领域 JSON
- 场景编辑器：底图 + 交互图片（hotspot）、设计分辨率画布、悬浮阴影默认开启
- 动作列表：`none` / `openScene` / `giveItem`（含 toast 文案与进退场动画）；类型可扩展
- 交互点：`once`（仅触发一次）、`visibleByDefault`
- 物品库编辑器：与场景编辑器并列入口；物品可配置是否堆叠
- 运行时：8 格快捷栏（最近获得优先）、完整背包、点击查看大图
- 物品栏显示模式（settings）：`withScene` | `always`
- 物品栏/背包外观：位置与基础样式（Schema + 自定义 CSS），默认靠左
- 增强纳入 v0.1：悬浮名称标签、自有格式 JSON 导入导出、撤销/重做、轻提示队列
- 剧本方法：`openScene`、`setEditMode`、`getCurrentSceneId`、`giveItem`、`hasItem`、`getItemCount`、`setHotspotVisible`

### 1.3 明确不在 v0.1

- 合成配方编辑与合成 UI（下一版）
- 图层分组、场景文本组件、地点连线
- 与大地图扩展互跳（`openMap` / 跨扩展 `openScene`）
- 对齐或兼容大地图 `mapsLibraryJson` / 地点 JSON 结构
- 获得音效、条件可见（拥有物品才显示）、背包分类/稀有度、「使用物品」完整逻辑（可留扩展点）

### 1.4 非目标

- 不做成完整关卡/瓦片地图编辑器
- 不修改 `sdk/`；不手改 `dist/`
- 不改变 `extension.json.id`（`ext-27b96b`）

---

## 2. 整体架构

沿用大地图「领域模型 + Schema 驱动属性面板 + 编辑/运行双壳」：

| 分层 | 职责 |
|------|------|
| `domain/` | 场景、交互点、物品、库存、动作链的纯类型与纯逻辑 |
| `schema/` | 属性表单（场景 / 交互点 / 物品 / 物品栏外观） |
| `editor/` | 场景编辑器、物品库编辑器、左中右壳、画布 |
| `runtime/` | 场景画布、快捷栏、背包、轻提示 |
| `store/` | settings（作者库）与 save（玩家进度） |
| `methods/` | 剧本可调用方法 |

**UI 入口：** 单个主 Extension（如 `scene-interaction`）。顶栏切换 **场景** / **物品库**；运行态渲染场景 + 按设置显示物品栏。`always` 模式下背包 HUD 可独立于场景显示，但共享同一份 inventory save。

**数据落点：**

- 作者内容 → **settings**：`scenesLibraryJson`、`itemsLibraryJson`、物品栏布局/主题、显示模式等
- 玩家进度 → **save（slot）**：库存、交互点已触发/可见性、当前场景、编辑模式等

---

## 3. 数据模型（自有 JSON，不对齐大地图）

### 3.1 场景库（settings：`scenesLibraryJson`）

```ts
interface SceneDefinition {
  id: string;
  name: string;
  baseImage: string;
  hotspots: HotspotElement[];
  letterboxMode?: "black" | "white" | "custom";
  letterboxColor?: string;
  customCss?: string;
  motion?: ElementMotion;
}
```

序列化根结构建议：

```ts
interface ScenesLibraryFile {
  version: 1;
  scenes: SceneDefinition[];
}
```

### 3.2 交互点

```ts
interface HotspotElement {
  type: "hotspot";
  id: string;
  name: string;
  x: number; // 相对底图 [0,1]
  y: number;
  visual: { kind: "image"; src: string; width?: number; height?: number };
  hoverShadow: { enabled: boolean };
  label?: HotspotLabel; // hover | always | hidden
  actions: SceneAction[];
  once: boolean;
  visibleByDefault: boolean;
  customCss: string;
  motion: ElementMotion;
}
```

`ElementMotion` / `MotionSide` / `MotionPresetId` 语义可参考大地图实现，但字段落在本扩展自有类型文件中，不共享大地图包。

### 3.3 动作（可扩展联合类型）

```ts
type SceneAction =
  | { type: "none" }
  | { type: "openScene"; sceneIdOrName: string }
  | {
      type: "giveItem";
      itemId: string;
      amount: number;
      toastText: string;
      toastMotion: ElementMotion;
    };
```

执行约定：按数组顺序执行；单步失败（如场景不存在）→ `warn` 后 **继续** 后续动作。

### 3.4 物品库（settings：`itemsLibraryJson`）

```ts
interface ItemsLibraryFile {
  version: 1;
  items: ItemDefinition[];
}

interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  detailImage: string;
  stackable: boolean;
  maxStack?: number;
}
```

### 3.5 玩家库存与进度（save slot）

```ts
interface InventoryState {
  entries: InventoryEntry[]; // 逻辑上按 lastGainedAt 降序维护或读取时排序
}

type InventoryEntry =
  | { kind: "stack"; itemId: string; count: number; lastGainedAt: number }
  | { kind: "unique"; instanceId: string; itemId: string; lastGainedAt: number };

interface SceneProgress {
  consumed: Record<string, boolean>;
  visibility?: Record<string, boolean>;
}
```

快捷栏：按 `lastGainedAt` 降序取前 **8** 格；堆叠条目占一格并显示数量。

### 3.6 建议 `saveSchema` / `settings` 字段

**save（slot）：**

| 字段 | 类型 | 含义 |
|------|------|------|
| `inventoryJson` | string | `InventoryState` |
| `progressJson` | string | `SceneProgress` |
| `isEditMode` | boolean | 内置编辑开关 |
| `currentSceneId` | string | 当前场景 |

**settings：**

| 字段 | 含义 |
|------|------|
| `allowEdit` | 是否允许进入编辑器 |
| `theme` | light / dark |
| `defaultSceneId` | 默认场景 |
| `scenesLibraryJson` | 场景库 |
| `itemsLibraryJson` | 物品库 |
| `inventoryHudMode` | `withScene` \| `always` |
| `inventoryHudJson` | 快捷栏/背包外观与位置 |
| `editorLeftWidth` / `editorRightWidth` | 编辑器栏宽 |
| `designWidth` / `designHeight` | 设计分辨率 |

---

## 4. 编辑器

### 4.1 场景编辑器

- **左：** 场景列表 + 当前场景交互点列表
- **中：** 设计分辨率画布；底图；拖入交互图片；移动/缩放；悬浮阴影预览
- **右：** Schema 属性（场景 / 选中 hotspot，含动作列表、once、label、motion、CSS）
- **组件栏：** 交互图片（精简；无分组/文本）

动作列表：添加 / 排序 / 删除；`giveItem` 从物品库选 id，配置 toast 与 `toastMotion`。

### 4.2 物品库编辑器

- **左：** 物品列表（搜索、新建、删除）
- **中：** 小图 + 大图 + 文案预览
- **右：** id、名称、描述、icon、detailImage、stackable、maxStack

删除仍被动作引用的物品：软警告，不强制级联清理。

### 4.3 物品栏外观

通过 `inventoryHudJson` + Schema：默认左侧锚点、8 槽、打开背包按钮、基础样式/CSS。不做完整可视化搭界面引擎。

### 4.4 编辑体验（v0.1）

- 撤销/重做
- 设计分辨率预设
- 场景库 / 物品库 **自有格式** JSON 导入导出（带 `version` 字段）
- `allowEdit` 控制玩家端是否暴露编辑 UI

---

## 5. 运行时

### 5.1 场景

- 打开指定或默认场景；底图与可见 hotspot 按 motion 入场
- 默认悬浮阴影；点击执行 `actions`
- `once` 触发后写入 `consumed`，默认隐藏
- 透明图优先 alpha 点击判定

### 5.2 给予物品与轻提示

- 按 `stackable` 合并或新建 unique 条目，更新 `lastGainedAt`
- Toast 锚在交互点上方，使用 `toastMotion`；多条 **排队** 显示，避免叠爆

### 5.3 快捷栏与背包

- 快捷栏 8 格，最近获得在前
- 点击格子 → 大图预览（名称 + 描述）
- 「打开背包」→ 完整网格；再点物品看大图；关闭后回到场景层（或仅关背包）
- v0.1 无合成、无使用消耗（可预留 `use` 扩展点但不实现）

### 5.4 HUD 模式

| `inventoryHudMode` | 行为 |
|--------------------|------|
| `withScene` | 仅场景交互 UI 打开时显示快捷栏 |
| `always` | 常驻 HUD，可无场景时开背包；库存共用 |

---

## 6. 错误处理

- 库/库存 JSON 损坏：回退空数据 + `console.error`，UI 不崩溃
- 缺失物品/场景引用：执行 skip + warn；编辑器显示警告态
- 异步路径 try/catch，避免一次点击打挂预览
- 禁止无作用域全局引擎单例；订阅在卸载/预览重启时清理

---

## 7. 验收标准（Studio 人工 + 构建）

1. 编辑：两场景、底图与交互图、动作链（给物 + 跳场景）、once、标签
2. 物品库：可堆叠/不可堆叠均可创建，动作能引用
3. 运行：悬浮阴影、toast、快捷栏顺序、背包大图
4. once 与存读档：consumed + inventory 保持
5. `withScene` / `always` 行为正确
6. 自有 JSON 导入导出往返可用
7. `npm run build` 成功

---

## 8. 后续版本（备忘）

- 合成配方编辑器与背包合成 UI
- 条件可见、音效、分类/稀有度、使用物品
- 更多 `SceneAction` 类型（`setVariable`、`gotoChapter`、`callMethod` 等）
- （明确不做）与大地图互跳，除非未来单独立项

---

## 9. 决策记录摘要

| 决策 | 结论 |
|------|------|
| v0.1 范围 | 场景 + 快捷栏 + 背包大图；合成下一版 |
| 快捷栏 | 8 格，最近获得优先 |
| 堆叠 | 物品级作者配置 |
| 动作 | 列表按序执行 |
| 一次性 | 交互点 `once` |
| HUD | settings 选 withScene / always |
| 编辑入口 | 场景编辑器 ∥ 物品库编辑器 |
| 架构 | 方案 1（复用大地图范式） |
| 大地图互跳 | 不做 |
| JSON | 自有 schema + version，不对齐大地图 |
