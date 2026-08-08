# HUD / 全屏背包自由布局编辑（方案 1）设计规格

- **日期**: 2026-08-08
- **状态**: 已批准；实现计划见 docs/superpowers/plans/2026-08-08-hud-backpack-free-layout.md
- **包**: `ext-27b96b`（`editor` / `backpack-hud` / `scene-interaction`）
- **作者侧目标**: 在扩展内「UI」分区，对快捷栏 HUD 与全屏背包的**固定角色节点**做接近 VisualUI 的选中、拖拽、resize 与样式编辑；配置仍写入现有 settings 键。

---

## 1. 背景与决策

### 1.1 现状

- 快捷栏可调：`left` / `top` / `slotSize` / `gap` / `accent` / `openBagLabel` / `customCss`
- 全屏背包可调：`pagePaddingX/Y` / `detailRatio` / `gridCellMin` / `heroHeight` / `accent`
- 其余颜色、圆角、字号、遮罩、顶栏、关闭钮、面板底板等多为硬编码

### 1.2 已确认方向

| 项 | 选择 |
|----|------|
| 自定义深度 | C：接近 VisualUI（选中 / 拖拽 / 属性） |
| 编辑器落点 | B：扩展内自建，不接入宿主 VisualUI |
| 实现路径 | **方案 1：固定角色节点 + 绝对定位** |
| 存储键 | 不变：`inventoryHudJson`、`backpackScreenJson`（`backpack-hud` settings） |

**明确不做（本规格范围外）**：任意增删组件树、嵌套容器编辑器、撤销栈、宿主 `ui/*.json` 对接。

---

## 2. 节点清单

坐标系：设计分辨率（与场景/UI 编辑器 letterbox 一致）。

### 2.1 快捷栏 HUD

| 节点 id | 角色 | 可编辑 |
|---------|------|--------|
| `quickbarRoot` | 快捷栏整体锚点（槽位组容器） | `x/y`、排列方向（竖/横）、`gap`、`slotSize`、槽位圆角/底色/边框色 |
| `openBagButton` | 「打开背包」按钮 | `layout: belowRoot \| absolute`；absolute 时 `x/y/w/h`；文案、字号、圆角、底色/文字色/边框 |

- 8 个槽位**不**单独成节点，由 `quickbarRoot` 统一生成。
- 数量角标样式挂在 `quickbarRoot.badgeStyle`（底色 / 文字色 / 字号 / 圆角）。

### 2.2 全屏背包

| 节点 id | 角色 | 可编辑 |
|---------|------|--------|
| `backdrop` | 全屏遮罩 | 颜色 / 透明度；默认铺满，**不拖不缩** |
| `panelChrome` | 主面板底板（网格+详情外框） | `x/y/w/h`、圆角、背景、阴影强度 |
| `titleBlock` | 顶栏标题区 | `x/y/w`、eyebrow / 标题 / 模式切换链的文案与颜色/字号 |
| `closeButton` | 关闭按钮 | `x/y/w/h`、样式、文案或符号 |
| `itemGrid` | 道具/合成网格区 | `x/y/w/h`、`cellMin`、圆角、底色/选中色 |
| `detailPanel` | 右侧详情区 | `x/y/w/h`、内边距、底色、`heroHeight` |
| `craftButton` | 合成确认按钮 | 文案、颜色、圆角、字号；默认贴详情底部，可调 `offsetY` |

全局保留 `accent`：未单独指定的选中/高亮边框等默认由其派生。

**坐标约定**：除 `backdrop`（铺满舞台）外，背包各节点 `rect` 均为**设计舞台绝对坐标**（与 `panelChrome` 同级坐标系）。运行时可为动画/裁剪将子节点视觉挂在 `panelChrome` 下，但序列化位置始终按舞台绝对坐标读写，避免父子偏移歧义。

---

## 3. 数据模型

### 3.1 公共片段

```ts
interface UiRect {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

interface UiBoxStyle {
  background?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  /** 0–1，运行时映射为 boxShadow */
  shadow?: number;
}

interface UiTextStyle {
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  /** 覆写文案；空/缺省则用内置默认 */
  label?: string;
}
```

### 3.2 `inventoryHudJson`（version 2）

```ts
interface InventoryHudConfigV2 {
  version: 2;
  accent: string;
  customCss: string;
  nodes: {
    quickbarRoot: {
      rect: { x: number; y: number };
      direction: "column" | "row";
      slotSize: number;
      gap: number;
      slotStyle: UiBoxStyle;
      badgeStyle: UiBoxStyle & UiTextStyle;
    };
    openBagButton: {
      layout: "belowRoot" | "absolute";
      rect?: UiRect;
      style: UiBoxStyle & UiTextStyle;
    };
  };
}
```

### 3.3 `backpackScreenJson`（version 2）

```ts
interface BackpackScreenConfigV2 {
  version: 2;
  accent: string;
  nodes: {
    backdrop: { style: UiBoxStyle };
    panelChrome: { rect: UiRect; style: UiBoxStyle };
    titleBlock: {
      rect: UiRect;
      eyebrow?: UiTextStyle;
      title?: UiTextStyle;
      modeLink?: UiTextStyle;
    };
    closeButton: { rect: UiRect; style: UiBoxStyle & UiTextStyle };
    itemGrid: {
      rect: UiRect;
      cellMin: number;
      style: UiBoxStyle;
      selectedStyle?: UiBoxStyle;
    };
    detailPanel: {
      rect: UiRect;
      heroHeight: number;
      padding: number;
      style: UiBoxStyle;
    };
    craftButton: {
      offsetY?: number;
      style: UiBoxStyle & UiTextStyle;
    };
  };
}
```

### 3.4 兼容与迁移

- **读**：无 `version` 或 `version < 2` 的扁平 v1 字段 → `normalize*` 填入默认 `nodes`（视觉尽量贴近当前默认 UI）。
- **写**：编辑器保存始终写出 `version: 2`。
- 缺节点 / 非法字段：回填该节点默认值，不抛崩。
- `rect` 越界或 `w/h ≤ 0`：钳制到合法范围。
- 非法颜色：回退默认或 `accent` 派生色。

默认布局数值在实现计划中从当前 `defaultInventoryHud` / `defaultBackpackScreen` 与现有 JSX 硬编码推导，保证「重置全部」≈ 今日默认外观。

---

## 4. 编辑器交互

### 4.1 画布

- 入口：现有「UI」分区；子 Tab「快捷栏」/「全屏背包」。
- letterbox 设计分辨率；节点按 `rect` 绝对绘制。
- HUD：`openBagButton.layout === "belowRoot"` 时跟随 `quickbarRoot` 之后，不使用独立 `rect`。
- 点击选中：高亮描边；有 `w/h` 的节点提供四角/边中点 resize。
- `backdrop`：可选中改样式，**禁止拖拽与 resize**。
- 拖拽改 `x/y`；Shift 约束单轴；对其它节点边缘轻量吸附（约 4px）。
- 点空白或 Esc：取消选中。

### 4.2 属性面板

- **未选中**：全局（`accent`；HUD 另有 `customCss`）；「全部重置为默认布局」。
- **选中节点**：仅该节点字段（几何 + `UiBoxStyle` / `UiTextStyle` + 特有项）。
- 颜色字段：现有 FormRenderer 色板（对齐大地图 ColorField）。
- 变更即时写回 settings（沿用 `writeHudSetting` + 进程内订阅热更新）。

### 4.3 辅助

- 节点列表（画布侧栏或顶条）：点击等同选中。
- 「重置此节点」「全部重置」。
- **不做**撤销栈（v1）。

---

## 5. 运行时渲染

- `BackpackShell` / `BackpackScreen`（及编辑器预览画布）读取 v2 `nodes`，绝对定位渲染各角色节点。
- 交互绑定不变：开背包、点槽、详情、合成、关闭、模式切换。
- **共享** `config → 样式` 工具（如 `applyUiBoxStyle` / `resolveHudLayout`），预览与玩家运行时共用，避免漂移。
- 入场/退场动画保留，作用在 `backdrop` + `panelChrome`（或其子树）。
- 设计坐标 → 舞台：沿用现有 letterbox / scale。

### 5.1 主要代码落点（预期）

| 区域 | 职责 |
|------|------|
| `domain/types.ts` + `inventory-hud.ts` + `backpack-screen-config.ts` | v2 类型、默认值、normalize/迁移 |
| `domain/ui-style.ts`（新） | `UiRect` / box/text → CSS、钳制、accent 派生 |
| `schema/*` + 节点级 Form schema | 全局与按节点属性表单 |
| `editor/ui/*-visual-canvas.tsx` | 选中、拖拽、resize、吸附、节点列表 |
| `editor/ui/ui-editor-panel.tsx` | 选中态驱动右侧表单 |
| `backpack/backpack-shell.tsx` / `backpack-screen.tsx` | 按 nodes 渲染 |

---

## 6. 错误处理与验证

| 场景 | 行为 |
|------|------|
| JSON 损坏 | 回退完整默认 v2 |
| 缺节点 | 仅补该节点默认 |
| 几何非法 | 钳制 |
| 颜色非法 | 回退默认 / accent |
| v1 旧档 | 自动迁移，作者无感 |

**验证清单**

1. `npm run build` 通过  
2. v1 → v2 迁移后默认外观与迁移前一致（目视）  
3. 拖拽 / resize / 改色持久化，热更新预览  
4. 编辑器预览与玩家运行时（含程序预览内嵌 `BackpackShell`）一致  
5. 单节点重置与全部重置  

---

## 7. 成功标准

- 作者可在扩展 UI 编辑器中选中上述全部角色节点（backdrop 仅样式），调整位置/尺寸（适用者）与样式/文案，并在运行时生效。
- 不引入宿主 VisualUI 依赖；不扩大到任意组件树。
- 旧工程 settings 无需手工迁移。

---

## 8. 后续可演进（非本规格）

- 方案 3：更多 chrome 拆分（独立 `modeLink` 节点等）
- 方案 2：迷你组件树
- 撤销/重做、多选对齐工具
- 与宿主 VisualUI 双向同步
