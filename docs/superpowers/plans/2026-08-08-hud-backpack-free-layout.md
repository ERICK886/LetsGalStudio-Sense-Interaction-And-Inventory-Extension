# HUD / 全屏背包自由布局编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在扩展内「UI」分区，对快捷栏 HUD 与全屏背包的固定角色节点提供选中 / 拖拽 / resize / 样式编辑，配置以 v2 `nodes` 写入 `inventoryHudJson` / `backpackScreenJson`，运行时与预览共用布局解析。

**Architecture:** 领域层升级为 version:2 节点表（含 v1 自动迁移）；`domain/ui-style.ts` 统一 box/text → CSS；`resolveHudLayout` / `resolveBackpackLayout` 供编辑器画布与 `BackpackShell` / `BackpackScreen` 共用；编辑器增加选中态 + 共享拖拽/resize 原语，右侧 FormRenderer 按节点切换 schema。

**Tech Stack:** TypeScript、React 18、Vite 5（库模式）、`@avg-studio/sdk`（本地 `sdk/`）、Vitest 2、现有 FormRenderer 色板字段。

**Spec:** `docs/superpowers/specs/2026-08-08-hud-backpack-free-layout-design.md`

## Global Constraints

- 禁止修改 `extension.json.id`（必须保持 `ext-27b96b`）
- 禁止手改 `sdk/` 与 `dist/`；行为变更只改 `src/` 后 `npm run build`
- 新增源码：`kebab-case.ts` / `kebab-case.tsx`
- 文件头注释：文件名、作者「池水三两升」、日期 `2026-08-08`、版本；函数含详细中文注释（参数/返回值/异常/示例）
- 必要空行提高可读性
- TypeScript 严格模式，不用 `any` 掩盖 SDK 契约
- 存储键不变：`inventoryHudJson`、`backpackScreenJson`（`backpack-hud` settings）
- 不做任意组件树、宿主 VisualUI、撤销栈
- 包管理：npm
- Commit 步骤：仅当用户明确要求提交时执行；否则跳过 git commit
- 对话与注释语言：中文

---

## File Structure（锁定）

```text
src/
  domain/
    types.ts                      # UiRect/UiBoxStyle/UiTextStyle；InventoryHudConfig / BackpackScreenConfig → v2
    ui-style.ts                   # NEW: normalize rect/style、apply* → CSS、accent 派生
    inventory-hud.ts              # default/normalize v2 + migrateV1
    backpack-screen-config.ts     # default/normalize v2 + migrateV1（参考设计尺寸 1920×1080）
    hud-layout.ts                 # NEW: resolveHudLayout（槽位框、按钮框）
    backpack-layout.ts            # NEW: resolveBackpackLayout（各节点绝对 rect）
    serialize.ts                  # parse/stringify 走新 normalize（写出 version:2）
  schema/
    ui-style-fields.ts            # NEW: box/text/rect 字段片段工厂
    inventory-hud-schema.ts       # 全局 + 按节点 schema
    backpack-screen-schema.ts     # 全局 + 按节点 schema
  editor/ui/
    node-list.tsx                 # NEW: 节点列表
    free-layout-selection.ts      # NEW: 选中类型、吸附、指针拖拽/resize 纯逻辑
    selection-overlay.tsx         # NEW: 选中框 + resize 手柄
    hud-visual-canvas.tsx         # 多节点选中/拖拽/resize
    backpack-visual-canvas.tsx    # 同上（backdrop 禁拖）
    ui-editor-panel.tsx           # selectedNodeId + 重置 + 按节点表单
  backpack/
    backpack-shell.tsx            # 按 resolveHudLayout 渲染
    backpack-screen.tsx           # 按 resolveBackpackLayout 渲染
  runtime/
    inventory-quickbar.tsx        # 兼容：改读 nodes（deprecated 路径）
  editor/panels/
    property-panel.tsx            # 无场景 HUD 表单改用 v2 schema / 或引导至 UI 分区

tests/
  domain/ui-style.test.ts         # NEW
  domain/inventory-hud-v2.test.ts # NEW
  domain/backpack-screen-v2.test.ts # NEW
  domain/hud-layout.test.ts       # NEW
  domain/backpack-layout.test.ts  # NEW
  editor/free-layout-selection.test.ts # NEW
```

**类型别名约定（全计划统一）：**

- `InventoryHudConfig` = v2 形态（含 `version: 2` 与 `nodes`）
- `BackpackScreenConfig` = v2 形态
- 不再保留扁平 `left/top/pagePaddingX` 作为正式类型字段；迁移仅发生在 `normalize*` 输入侧

**默认参考设计尺寸（背包默认 rect 计算）：** `REF_W = 1920`，`REF_H = 1080`

---

### Task 1: `ui-style` 原语

**Files:**
- Modify: `src/domain/types.ts`（追加 `UiRect` / `UiBoxStyle` / `UiTextStyle`；本 Task **不**改 InventoryHudConfig）
- Create: `src/domain/ui-style.ts`
- Create: `tests/domain/ui-style.test.ts`

**Interfaces:**
- Produces（类型在 `types.ts`，函数在 `ui-style.ts`）:
  - `export interface UiRect { x: number; y: number; w?: number; h?: number }`
  - `export interface UiBoxStyle { background?: string; borderColor?: string; borderWidth?: number; borderRadius?: number; opacity?: number; shadow?: number }`
  - `export interface UiTextStyle { color?: string; fontSize?: number; fontWeight?: number; label?: string }`
  - `normalizeUiRect(raw, fallback, bounds?): UiRect`
  - `normalizeUiBoxStyle(raw, fallback): UiBoxStyle`
  - `normalizeUiTextStyle(raw, fallback): UiTextStyle`
  - `applyUiBoxStyle(style: UiBoxStyle): React.CSSProperties`（实现文件可 `import type { CSSProperties } from "react"`）
  - `applyUiTextStyle(style: UiTextStyle): React.CSSProperties`
  - `accentAlpha(accent: string, hexAlpha: string): string`（如 `"22"` → `#64e0d022`；非法 accent 回退 `#64e0d0`）

- [ ] **Step 1: 写失败单测**

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeUiRect,
  applyUiBoxStyle,
  accentAlpha,
} from "../../src/domain/ui-style";

describe("normalizeUiRect", () => {
  it("非法 w 回退 fallback.w", () => {
    expect(
      normalizeUiRect({ x: 10, y: 20, w: -1 }, { x: 0, y: 0, w: 100, h: 50 }),
    ).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });
});

describe("applyUiBoxStyle", () => {
  it("shadow 0.5 产生非空 boxShadow", () => {
    const css = applyUiBoxStyle({ shadow: 0.5 });
    expect(String(css.boxShadow || "")).not.toEqual("none");
    expect(String(css.boxShadow || "").length).toBeGreaterThan(0);
  });
});

describe("accentAlpha", () => {
  it("拼接 8 位 hex", () => {
    expect(accentAlpha("#64e0d0", "22").toLowerCase()).toBe("#64e0d022");
  });
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `npm test -- tests/domain/ui-style.test.ts`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/domain/ui-style.ts`**

实现要点：
- `normalizeUiRect`：非有限数用 fallback；`w/h` 若提供则 `Math.max(1, …)`；可选 `bounds` 将 x/y 钳进 `[0, max]`
- `applyUiBoxStyle`：`shadow` 映为 `0 ${8*s}px ${24*s}px rgba(0,0,0,${0.35*s})`；`opacity` 缺省不写
- `accentAlpha`：用现有 `normalizeHexColor`（`src/schema/color-utils.ts`）取 6 位再拼 alpha；失败回退 `#64e0d0` + alpha

- [ ] **Step 4: 跑测通过**

Run: `npm test -- tests/domain/ui-style.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit（仅用户要求时）**

```bash
git add src/domain/types.ts src/domain/ui-style.ts tests/domain/ui-style.test.ts
git commit -m "feat: add ui-style helpers for free-layout nodes"
```

---

### Task 2: `InventoryHudConfig` v2 + 迁移

**Files:**
- Modify: `src/domain/types.ts`（替换 `InventoryHudConfig` 为 v2；`Ui*` 类型已在 Task 1）
- Modify: `src/domain/inventory-hud.ts`
- Modify: `src/domain/serialize.ts`（确认 `parseInventoryHudJson` / `stringifyInventoryHud` 走新 normalize；stringify 保证 `version: 2`）
- Create: `tests/domain/inventory-hud-v2.test.ts`
- Modify: `tests/domain/serialize.test.ts`（更新仍断言 `left/top` 的用例）

**Interfaces:**
- Consumes: `UiRect`, `UiBoxStyle`, `UiTextStyle`, normalize* from Task 1
- Produces:
  - `InventoryHudConfig`（v2）
  - `defaultInventoryHud(): InventoryHudConfig`
  - `normalizeInventoryHud(raw: unknown): InventoryHudConfig`
  - `resetInventoryHudNode(cfg, nodeId: "quickbarRoot" | "openBagButton"): InventoryHudConfig`

- [ ] **Step 1: 写失败单测**

```ts
import { describe, it, expect } from "vitest";
import {
  defaultInventoryHud,
  normalizeInventoryHud,
} from "../../src/domain/inventory-hud";
import { parseInventoryHudJson, stringifyInventoryHud } from "../../src/domain/serialize";

describe("normalizeInventoryHud v2", () => {
  it("v1 flat 迁移到 nodes", () => {
    const cfg = normalizeInventoryHud({
      left: 40,
      top: 80,
      slotSize: 56,
      gap: 6,
      openBagLabel: "背包",
      accent: "#abcdef",
      customCss: "",
    });
    expect(cfg.version).toBe(2);
    expect(cfg.nodes.quickbarRoot.rect).toEqual({ x: 40, y: 80 });
    expect(cfg.nodes.quickbarRoot.slotSize).toBe(56);
    expect(cfg.nodes.openBagButton.style.label).toBe("背包");
    expect(cfg.accent).toBe("#abcdef");
  });

  it("损坏输入回退默认且 version 2", () => {
    const cfg = normalizeInventoryHud(null);
    expect(cfg).toEqual(defaultInventoryHud());
    expect(cfg.version).toBe(2);
  });

  it("stringify 写出 version 2", () => {
    const json = stringifyInventoryHud(defaultInventoryHud());
    expect(JSON.parse(json).version).toBe(2);
    expect(parseInventoryHudJson(json).nodes.quickbarRoot).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测确认失败**

Run: `npm test -- tests/domain/inventory-hud-v2.test.ts`  
Expected: FAIL

- [ ] **Step 3: 更新 `types.ts` 中 InventoryHudConfig**

```ts
export interface InventoryHudConfig {
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

- [ ] **Step 4: 重写 `inventory-hud.ts`**

- `defaultInventoryHud()`：`quickbarRoot.rect = {x:24,y:120}`，`direction:"column"`，`slotSize:64`，`gap:8`，slot/badge 默认色贴近现网，`openBagButton.layout:"belowRoot"`，`style.label:"打开背包"`，`accent:"#64e0d0"`
- `normalizeInventoryHud`：
  - 若 `obj.version === 2` 且 `nodes` 为对象 → 逐字段 normalize，缺节点用 default 对应节点
  - 否则视为 v1：读 `left/top/slotSize/gap/openBagLabel/customCss/accent` 填入默认 nodes
- `resetInventoryHudNode`：用 default 对应节点替换

- [ ] **Step 5: 修编译断裂（最小）**

暂时在 `hud-layout.ts` 未就绪前，给调用方加**薄适配**（下一 Task 删除）：

```ts
// 仅作过渡，Task 3 实现 resolve 后删除各处 .left
export function hudLegacyLeft(cfg: InventoryHudConfig): number {
  return cfg.nodes.quickbarRoot.rect.x;
}
export function hudLegacyTop(cfg: InventoryHudConfig): number {
  return cfg.nodes.quickbarRoot.rect.y;
}
```

放在 `inventory-hud.ts` 并改 `backpack-shell` / `hud-visual-canvas` / `inventory-quickbar` 使用它们（或直接 `.nodes…`）。目标：`npm run build` 能过。

- [ ] **Step 6: 跑测 + build**

Run: `npm test -- tests/domain/inventory-hud-v2.test.ts tests/domain/serialize.test.ts`  
Run: `npm run build`  
Expected: PASS

- [ ] **Step 7: Commit（仅用户要求时）**

```bash
git add src/domain/types.ts src/domain/ui-style.ts src/domain/inventory-hud.ts src/domain/serialize.ts tests/domain/inventory-hud-v2.test.ts tests/domain/serialize.test.ts src/backpack/backpack-shell.tsx src/editor/ui/hud-visual-canvas.tsx src/runtime/inventory-quickbar.tsx
git commit -m "feat: migrate inventory HUD config to v2 nodes"
```

---

### Task 3: `BackpackScreenConfig` v2 + 迁移

**Files:**
- Modify: `src/domain/types.ts`（替换 `BackpackScreenConfig`）
- Modify: `src/domain/backpack-screen-config.ts`
- Modify: `src/domain/serialize.ts`（`parseBackpackScreenJson` / `stringifyBackpackScreen`）
- Create: `tests/domain/backpack-screen-v2.test.ts`
- Modify: 所有读 `pagePaddingX` 等的文件改为过渡 helper 或下一 Task 的 resolve（本 Task 结束时 build 必须绿）

**Interfaces:**
- Produces:
  - `BackpackScreenConfig`（v2，节点齐全）
  - `defaultBackpackScreen(refW?: number, refH?: number): BackpackScreenConfig`（默认 1920×1080）
  - `normalizeBackpackScreen(raw: unknown, refW?: number, refH?: number): BackpackScreenConfig`
  - `migrateBackpackScreenV1(flat, refW, refH): BackpackScreenConfig`（内部）
  - `resetBackpackScreenNode(cfg, nodeId, refW?, refH?): BackpackScreenConfig`

**v1 → 默认节点几何（必须写死公式）：**

```ts
const padX = flat.pagePaddingX ?? 48;
const padY = flat.pagePaddingY ?? 40;
const detailRatio = flat.detailRatio ?? 0.36;
const panel = { x: padX, y: padY, w: refW - padX * 2, h: refH - padY * 2 };
const detailW = Math.round(panel.w * detailRatio);
const gridW = panel.w - detailW;
// titleBlock: { x: panel.x + 24, y: panel.y - 72, w: panel.w - 80, h: 64 }（若 y<0 则 y=padY）
// closeButton: 右上角约 { x: panel.x + panel.w - 56, y: panel.y - 64, w: 44, h: 44 }
// itemGrid: { x: panel.x, y: panel.y, w: gridW, h: panel.h }
// detailPanel: { x: panel.x + gridW, y: panel.y, w: detailW, h: panel.h }
```

- [ ] **Step 1: 写失败单测**

```ts
import { describe, it, expect } from "vitest";
import {
  defaultBackpackScreen,
  normalizeBackpackScreen,
} from "../../src/domain/backpack-screen-config";

describe("normalizeBackpackScreen v2", () => {
  it("v1 flat 产生 panelChrome 与 itemGrid", () => {
    const cfg = normalizeBackpackScreen(
      { pagePaddingX: 48, pagePaddingY: 40, detailRatio: 0.36, gridCellMin: 104, heroHeight: 280, accent: "#64e0d0" },
      1920,
      1080,
    );
    expect(cfg.version).toBe(2);
    expect(cfg.nodes.panelChrome.rect.w).toBe(1920 - 96);
    expect(cfg.nodes.itemGrid.cellMin).toBe(104);
    expect(cfg.nodes.detailPanel.heroHeight).toBe(280);
  });

  it("缺节点补默认", () => {
    const cfg = normalizeBackpackScreen({ version: 2, accent: "#fff", nodes: {} });
    expect(cfg.nodes.backdrop).toBeTruthy();
    expect(cfg.nodes.craftButton).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测失败 → 实现 → 跑测通过 → build**

Run: `npm test -- tests/domain/backpack-screen-v2.test.ts`  
Run: `npm run build`

- [ ] **Step 3: Commit（仅用户要求时）**

```bash
git commit -m "feat: migrate backpack screen config to v2 nodes"
```

---

### Task 4: `resolveHudLayout` / `resolveBackpackLayout`

**Files:**
- Create: `src/domain/hud-layout.ts`
- Create: `src/domain/backpack-layout.ts`
- Create: `tests/domain/hud-layout.test.ts`
- Create: `tests/domain/backpack-layout.test.ts`
- Modify: 删除 Task 2 的 `hudLegacyLeft/Top`（若存在），调用方改用 resolve

**Interfaces:**
- Produces:

```ts
// hud-layout.ts
export interface ResolvedHudLayout {
  root: { x: number; y: number; direction: "column" | "row"; slotSize: number; gap: number };
  slots: Array<{ x: number; y: number; w: number; h: number }>; // 8 个，舞台坐标
  openBagButton: { x: number; y: number; w: number; h: number };
  accent: string;
  slotStyle: UiBoxStyle;
  badgeStyle: UiBoxStyle & UiTextStyle;
  openBagStyle: UiBoxStyle & UiTextStyle;
  customCss: string;
}
export function resolveHudLayout(cfg: InventoryHudConfig): ResolvedHudLayout;

// backpack-layout.ts
export interface ResolvedBackpackLayout {
  accent: string;
  backdrop: { style: UiBoxStyle };
  panelChrome: { rect: Required<UiRect>; style: UiBoxStyle };
  titleBlock: { rect: Required<UiRect>; eyebrow: UiTextStyle; title: UiTextStyle; modeLink: UiTextStyle };
  closeButton: { rect: Required<UiRect>; style: UiBoxStyle & UiTextStyle };
  itemGrid: { rect: Required<UiRect>; cellMin: number; style: UiBoxStyle; selectedStyle: UiBoxStyle };
  detailPanel: { rect: Required<UiRect>; heroHeight: number; padding: number; style: UiBoxStyle };
  craftButton: { offsetY: number; style: UiBoxStyle & UiTextStyle };
}
export function resolveBackpackLayout(cfg: BackpackScreenConfig): ResolvedBackpackLayout;
```

`resolveHudLayout` 规则：
- `belowRoot`：按钮在最后一个槽后，`direction===column` 时 `y = root.y + 8*(slot+gap) + 4`，`x = root.x`，`w = slotSize`，`h = max(32, fontSize+16)`
- `absolute`：用 `openBagButton.rect`，缺省 w/h 回退

- [ ] **Step 1: 单测 belowRoot 几何**

```ts
it("belowRoot 按钮在竖排槽位下方", () => {
  const cfg = defaultInventoryHud();
  const layout = resolveHudLayout(cfg);
  expect(layout.slots).toHaveLength(8);
  const last = layout.slots[7]!;
  expect(layout.openBagButton.y).toBeGreaterThanOrEqual(last.y + last.h);
  expect(layout.openBagButton.x).toBe(layout.root.x);
});
```

- [ ] **Step 2: 实现并通过测试 + build**

- [ ] **Step 3: Commit（仅用户要求时）**

```bash
git commit -m "feat: add shared HUD/backpack layout resolvers"
```

---

### Task 5: Schema — 全局与按节点字段

**Files:**
- Create: `src/schema/ui-style-fields.ts`
- Modify: `src/schema/inventory-hud-schema.ts`
- Modify: `src/schema/backpack-screen-schema.ts`

**Interfaces:**
- Produces:
  - `boxStyleFields(prefix: string): FieldSchema[]` — 如 `prefix="nodes.quickbarRoot.slotStyle"` 生成 `background` 等 color/number 字段（key 用点路径）
  - `textStyleFields(prefix: string, opts?: { withLabel?: boolean }): FieldSchema[]`
  - `rectFields(prefix: string, opts?: { withSize?: boolean }): FieldSchema[]`
  - `inventoryHudGlobalFields(): FieldSchema[]`
  - `inventoryHudNodeFields(nodeId: "quickbarRoot" | "openBagButton"): FieldSchema[]`
  - `backpackScreenGlobalFields(): FieldSchema[]`
  - `backpackScreenNodeFields(nodeId: BackpackNodeId): FieldSchema[]`
  - `type HudNodeId = "quickbarRoot" | "openBagButton"`
  - `type BackpackNodeId = "backdrop" | "panelChrome" | "titleBlock" | "closeButton" | "itemGrid" | "detailPanel" | "craftButton"`

FormRenderer 已支持点路径 `setNestedValue` — 确认 `nodes.quickbarRoot.rect.x` 可用；若 enum 需 `direction` / `layout`，用现有 `kind:"enum"`。

- [ ] **Step 1: 实现字段工厂与按节点 schema**（无独立单测；靠 FormRenderer 已有能力）
- [ ] **Step 2: `npm run build`**
- [ ] **Step 3: Commit（仅用户要求时）**

```bash
git commit -m "feat: add per-node form schemas for HUD and backpack"
```

---

### Task 6: 选中 / 拖拽 / resize 纯逻辑

**Files:**
- Create: `src/editor/ui/free-layout-selection.ts`
- Create: `tests/editor/free-layout-selection.test.ts`

**Interfaces:**
- Produces:

```ts
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export function snapEdges(
  value: number,
  targets: number[],
  threshold?: number, // default 4
): number;

export function applyDrag(
  origin: { x: number; y: number },
  dx: number,
  dy: number,
  opts: { shiftKey: boolean; snapX?: number[]; snapY?: number[] },
): { x: number; y: number };

export function applyResize(
  origin: Required<UiRect>,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minSize?: { w: number; h: number }, // default 24×24
): Required<UiRect>;
```

- [ ] **Step 1: 单测 snap / Shift 锁轴 / resize 最小边**
- [ ] **Step 2: 实现并通过**
- [ ] **Step 3: Commit（仅用户要求时）**

```bash
git commit -m "feat: add free-layout drag/resize math"
```

---

### Task 7: 选中叠层 + 节点列表 UI

**Files:**
- Create: `src/editor/ui/selection-overlay.tsx`
- Create: `src/editor/ui/node-list.tsx`

**Interfaces:**
- Produces:
  - `<SelectionOverlay rect={Required<UiRect>} scale={number} resizable={boolean} onResizeStart={…} />` — 设计坐标 rect，内部按 scale 画手柄
  - `<NodeList items={{id,label}[]} selectedId={string|null} onSelect={…} />`

- [ ] **Step 1: 实现两组件（详细中文注释）**
- [ ] **Step 2: build**
- [ ] **Step 3: Commit（仅用户要求时）**

```bash
git commit -m "feat: add selection overlay and node list for UI editor"
```

---

### Task 8: HUD 画布自由布局

**Files:**
- Modify: `src/editor/ui/hud-visual-canvas.tsx`

**Interfaces:**
- Consumes: `resolveHudLayout`, `applyDrag`, `applyResize`, `SelectionOverlay`, `NodeList`
- Produces props 扩展：

```ts
export interface HudVisualCanvasProps {
  designWidth: number;
  designHeight: number;
  hud: InventoryHudConfig;
  selectedNodeId: HudNodeId | null;
  onSelectNode: (id: HudNodeId | null) => void;
  onHudChange: (next: InventoryHudConfig) => void;
}
```

行为：
- 渲染 `resolveHudLayout` 的 8 槽 + 按钮（用 `applyUiBoxStyle` / text）
- 点击槽组选 `quickbarRoot`；点按钮选 `openBagButton`
- 拖拽：更新 `nodes.quickbarRoot.rect` 或 absolute 按钮 rect；`belowRoot` 按钮不可独立拖（或拖时自动改 `layout:"absolute"` 并写入 rect — **选定：拖按钮 → 设为 absolute 并写入当前位置**）
- resize：仅 `openBagButton` absolute 时；`quickbarRoot` 不 resize（调 slotSize 走属性）
- Esc / 点舞台空白：`onSelectNode(null)`
- 左侧 `NodeList`

- [ ] **Step 1: 改写画布并接线**
- [ ] **Step 2: build**
- [ ] **Step 3: Commit（仅用户要求时）**

```bash
git commit -m "feat: free-layout editing on HUD visual canvas"
```

---

### Task 9: 全屏背包画布自由布局

**Files:**
- Modify: `src/editor/ui/backpack-visual-canvas.tsx`

**Interfaces:**
- Props 对称扩展 `selectedNodeId: BackpackNodeId | null` 等
- `backdrop`：可选中，**忽略** drag/resize 指针
- 其余节点：拖拽改 `nodes.*.rect`；有 w/h 的可 resize
- `craftButton`：无独立舞台 rect — 选中后只改属性；画布上画在 `detailPanel` 底部 + `offsetY` 的预览块，拖拽竖直方向改 `offsetY`

- [ ] **Step 1: 改写画布**
- [ ] **Step 2: build**
- [ ] **Step 3: Commit（仅用户要求时）**

```bash
git commit -m "feat: free-layout editing on backpack visual canvas"
```

---

### Task 10: `UiEditorPanel` 选中态表单与重置

**Files:**
- Modify: `src/editor/ui/ui-editor-panel.tsx`
- Modify: `src/editor/panels/property-panel.tsx`（无场景 HUD：改用 `inventoryHudGlobalFields` 或显示「请到 UI 分区编辑」短提示 + 全局 accent；**选定：复用 global + 节点字段需选中，故无场景时仅 globalFields + 链到 UI 的说明文案**）

**行为：**
- `selectedHudNode` / `selectedBagNode` state
- 右侧：`selected ? nodeFields : globalFields`
- 按钮：「重置此节点」「全部重置为默认」→ `reset*Node` / `default*`
- 切换 sub Tab 时清空选中
- Form `onChange` 仍 `persistHud` / `persistBag`

- [ ] **Step 1: 接线**
- [ ] **Step 2: build**
- [ ] **Step 3: Commit（仅用户要求时）**

```bash
git commit -m "feat: selection-driven property forms for UI editor"
```

---

### Task 11: 运行时 `BackpackShell` 吃 v2

**Files:**
- Modify: `src/backpack/backpack-shell.tsx`
- Modify: `src/runtime/inventory-quickbar.tsx`（deprecated 路径同步，避免分裂）

**行为：**
- `const layout = useMemo(() => resolveHudLayout(hud), [hud])`
- 根定位用 `layout.root`；direction/gap/slotSize 来自 layout
- 槽位边框/底：`applyUiBoxStyle(layout.slotStyle)`
- 角标：`applyUiBoxStyle` + `applyUiTextStyle(layout.badgeStyle)`，缺 background 时用 `layout.accent`
- 打开按钮：绝对定位到 `layout.openBagButton`，样式来自 `openBagStyle`，文案 `label || "打开背包"`
- 保留 `customCss` 注入（若尚未注入则补上 `<style>`）

- [ ] **Step 1: 改渲染**
- [ ] **Step 2: build**
- [ ] **Step 3: Commit（仅用户要求时）**

```bash
git commit -m "feat: render quickbar HUD from v2 layout resolver"
```

---

### Task 12: 运行时 `BackpackScreen` 吃 v2

**Files:**
- Modify: `src/backpack/backpack-screen.tsx`

**行为：**
- 用 `resolveBackpackLayout(screenCfg)` 替代 `pagePadding*` 布局与硬编码色
- `buildTokens` 改为基于 `layout.accent` + 各节点 style（节点 style 优先，否则 token 派生）
- 绝对定位：`backdrop` inset 0；其余 `left/top/width/height` 用 rect
- 动画仍挂在 backdrop + panelChrome
- 网格 `cellMin`、详情 `heroHeight`/`padding`、合成钮 `offsetY` 来自 layout
- 文案：`title` / `modeLink` / `closeButton` / `craftButton` 的 `label` 可覆写

- [ ] **Step 1: 改渲染（保持交互不变）**
- [ ] **Step 2: build**
- [ ] **Step 3: Commit（仅用户要求时）**

```bash
git commit -m "feat: render backpack screen from v2 node layout"
```

---

### Task 13: 收尾验证

**Files:** 无新文件（修测试与类型残留）

- [ ] **Step 1: 全量测试**

Run: `npm test`  
Expected: PASS

- [ ] **Step 2: 生产构建**

Run: `npm run build`  
Expected: 成功

- [ ] **Step 3: 手测清单（作者在 Studio）**

1. 旧工程仅 v1 HUD JSON → 打开 UI 分区外观接近迁移前  
2. 拖拽 `quickbarRoot`、改 accent、改按钮为 absolute 并 resize → 保存后重进仍在  
3. 背包选中 `itemGrid`/`detailPanel` 拖拽 resize → 运行时/程序预览一致  
4. `backdrop` 能选中改色但不能拖  
5. 重置单节点 / 全部重置恢复默认  
6. 程序预览内嵌 `BackpackShell` 与玩家 `ui.show(backpack-hud)` 均正常  

- [ ] **Step 4: 更新规格状态行**

将 spec 文首状态改为：`已批准；实现计划见 docs/superpowers/plans/2026-08-08-hud-backpack-free-layout.md`

- [ ] **Step 5: Commit（仅用户要求时）**

```bash
git commit -m "chore: verify free-layout UI editing and mark spec in progress"
```

---

## Spec Coverage（自检）

| Spec 要求 | Task |
|-----------|------|
| 固定角色节点清单（HUD/背包） | 2, 3, 8, 9 |
| v2 JSON + v1 迁移 | 2, 3 |
| UiRect/Box/Text + 样式工具 | 1 |
| 共享 resolve 避免预览漂移 | 4, 11, 12 |
| 选中/拖拽/resize/吸附/Esc | 6, 7, 8, 9 |
| backdrop 禁拖 | 9 |
| 节点列表 + 重置 | 7, 10 |
| 色板字段 | 5（color kind） |
| 运行时 Shell/Screen | 11, 12 |
| 存储键不变 | Global Constraints |
| 不做组件树/VisualUI/撤销 | Global Constraints |
| build + 手测 | 13 |

## Placeholder / 类型一致性自检

- 无 TBD；默认背包几何公式已写明
- `InventoryHudConfig` / `BackpackScreenConfig` 在 Task 2–3 起统一为 v2
- `HudNodeId` / `BackpackNodeId` 在 Task 5 定义，Task 8–10 复用同名
- 拖按钮策略已锁定：拖动 → `layout:"absolute"`
