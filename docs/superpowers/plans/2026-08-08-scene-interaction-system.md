# 场景交互系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `ext-27b96b` 实现 v0.1 场景交互系统：多场景编辑、交互点动作链、物品库、8 格快捷栏、完整背包与大图查看。

**Architecture:** 复用大地图扩展的分层范式（`domain` / `schema` / `editor` / `runtime` / `store` / `methods`），作者库进 settings JSON、玩家进度进 save slot；自有 `version: 1` schema，不对齐大地图 JSON，不做跨扩展互跳。

**Tech Stack:** TypeScript、React 18、Vite 5（库模式）、`@avg-studio/sdk`（本地 `sdk/`）、Vitest 2；无 Pixi 硬依赖（画布优先 DOM + 设计分辨率 letterbox，交互图 alpha 点击可复用大地图 `alpha-hit` 思路自研精简版）。

**Spec:** `docs/superpowers/specs/2026-08-08-scene-interaction-system-design.md`

## Global Constraints

- 禁止修改 `extension.json.id`（必须保持 `ext-27b96b`）
- 禁止手改 `sdk/` 与 `dist/`；行为变更只改 `src/` 后 `npm run build`
- 新增源码文件：`kebab-case.ts` / `kebab-case.tsx`
- 每个文件顶部注释：文件名、作者「池水三两升」、日期、版本；函数含详细中文注释（参数/返回值/异常/示例）
- TypeScript 严格模式，不用 `any` 掩盖 SDK 契约
- JSON 自有格式，根对象带 `version: 1`；不对齐大地图
- 不做合成、不做与大地图互跳
- 包管理：当前工程为 npm（无 `packageManager` 字段）；有 `package-lock.json` 则用 npm
- 若目录尚非 git 仓库：各 Task「Commit」步骤跳过，除非用户明确要求 `git init` 并提交

---

## File Structure（锁定）

```text
src/
  index.tsx                          # Extension：saveSchema / settings / methods / render
  app/
    scene-interaction-app.tsx        # 编辑/运行切换、场景|物品库顶栏
  domain/
    types.ts                         # 全部领域类型
    motion.ts                        # ElementMotion 默认与规范化
    id.ts                            # 生成短 id
    serialize.ts                     # 各 JSON 安全编解码
    inventory.ts                     # 给予/查询/快捷栏 top8
    actions.ts                       # 动作链执行（纯逻辑 + runtime 接口）
    toast-queue.ts                   # 轻提示排队
    hotspot-label.ts                 # 标签默认与规范化
    letterbox.ts                     # letterbox 规范化
    inventory-hud.ts                 # 快捷栏外观默认值
    scene-registry.ts                # 按 id/名称查找场景
    item-registry.ts                 # 按 id 查找物品
    item-refs.ts                     # 场景动作是否引用某 itemId（软警告）
  shared/
    coords.ts                        # clamp01 等
    alpha-hit.ts                     # 透明像素点击判定
    logger.ts                        # 统一前缀日志
  store/
    save-types.ts
    use-save-value.ts
    history.ts                       # 撤销/重做栈
    scenes-persistence.ts
    items-persistence.ts
    inventory-persistence.ts
    settings-sync.ts
  schema/
    types.ts
    form-renderer.tsx                # 精简 Schema 表单（可先从大地图思路自写最小集）
    scene-schema.ts
    hotspot-schema.ts
    item-schema.ts
    inventory-hud-schema.ts
    action-list-field.tsx            # 动作列表编辑控件
    motion-section.ts
  editor/
    editor-shell.tsx
    panels/
      scene-list-panel.tsx
      hotspot-list-panel.tsx
      property-panel.tsx
      item-list-panel.tsx
    canvas/
      scene-canvas.tsx
      scene-base-layer.tsx
      hotspot-layer.tsx
    ui/
      design-resolution-menu.tsx
      editor-chrome.tsx
    io/
      import-export.ts
  runtime/
    runtime-shell.tsx
    scene-view.tsx
    hotspot-view.tsx
    toast-layer.tsx
    inventory-quickbar.tsx
    inventory-backpack.tsx
    item-detail-modal.tsx
    create-action-runtime.ts
  methods/
    scene-methods.ts
    inventory-methods.ts
  theme/
    tokens.ts
    theme-provider.tsx

tests/
  domain/
    serialize.test.ts
    inventory.test.ts
    actions.test.ts
    toast-queue.test.ts
    motion.test.ts
  editor/
    import-export.test.ts
```

**删除/替换：** `src/welcome-ui.tsx` 在接入 App 后删除；`src/index.tsx` 重写为场景交互入口。

---

### Task 1: 测试脚手架 + 清理 Welcome 占位

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`（或新建 `vitest.config.ts`）
- Create: `tests/domain/.gitkeep`（随后被真实测试替换）
- Modify: `src/index.tsx`（暂保留可构建的最小 Extension，下一步换掉）

**Interfaces:**
- Consumes: 无
- Produces: `npm test` / `npm run build` 可用

- [ ] **Step 1: 为 package.json 增加 vitest**

在 `devDependencies` 增加 `"vitest": "^2.1.9"`，在 `scripts` 增加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: 添加 vitest 配置**

创建 `vitest.config.ts`：

```ts
/**
 * vitest.config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * Vitest 配置：与 Vite 同源，测试 domain 纯逻辑。
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 3: 安装依赖并确认测试命令可运行**

Run: `npm install`
Run: `npm test`
Expected: 无测试文件时 Vitest 以「No test files found」退出码非 0 **或** 0（视版本）；下一步会加测试。若失败仅因无文件，可先加空测试：

创建 `tests/domain/smoke.test.ts`：

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("works", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: PASS

- [ ] **Step 4: 确认构建仍通过**

Run: `npm run build`
Expected: `dist/index.js` 生成成功

- [ ] **Step 5: Commit（若已有 git）**

```bash
git add package.json package-lock.json vitest.config.ts tests/domain/smoke.test.ts
git commit -m "chore: add vitest and smoke test"
```

---

### Task 2: 领域类型与 motion / id / coords

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/motion.ts`
- Create: `src/domain/id.ts`
- Create: `src/shared/coords.ts`
- Create: `src/shared/logger.ts`
- Test: `tests/domain/motion.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `MotionPresetId`, `MotionSide`, `ElementMotion`, `SceneDefinition`, `HotspotElement`, `SceneAction`, `ItemDefinition`, `InventoryState`, `InventoryEntry`, `SceneProgress`, `ScenesLibraryFile`, `ItemsLibraryFile`, `InventoryHudConfig`, `HotspotLabel`
  - `defaultElementMotion()`, `normalizeElementMotion(raw: unknown): ElementMotion`
  - `createId(prefix?: string): string`
  - `clamp01(n: number): number`
  - `logError(scope: string, message: string, err?: unknown): void`

- [ ] **Step 1: 写 motion 失败测试**

```ts
/**
 * motion.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 */
import { describe, it, expect } from "vitest";
import {
  defaultElementMotion,
  normalizeElementMotion,
} from "../../src/domain/motion";

describe("normalizeElementMotion", () => {
  it("缺省返回两侧 none", () => {
    const m = normalizeElementMotion(undefined);
    expect(m.enter.preset).toBe("none");
    expect(m.exit.preset).toBe("none");
  });

  it("非法 preset 回退 none", () => {
    const m = normalizeElementMotion({
      enter: { preset: "boom", delayMs: -1, durationMs: 99999 },
      exit: {},
    });
    expect(m.enter.preset).toBe("none");
    expect(m.enter.delayMs).toBe(0);
    expect(m.enter.durationMs).toBeLessThanOrEqual(10_000);
  });

  it("defaultElementMotion 可被 JSON 往返", () => {
    const d = defaultElementMotion();
    expect(normalizeElementMotion(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});
```

- [ ] **Step 2: Run 确认失败**

Run: `npm test -- tests/domain/motion.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 types / motion / id / coords / logger**

`src/domain/types.ts` 核心（完整写入文件，含文件头注释）：

```ts
export type MotionPresetId =
  | "none"
  | "fade"
  | "scale"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight";

export interface MotionSide {
  preset: MotionPresetId;
  delayMs: number;
  durationMs: number;
  customCss: string;
}

export interface ElementMotion {
  enter: MotionSide;
  exit: MotionSide;
}

export type LetterboxMode = "black" | "white" | "custom";

export type HotspotLabelMode = "hover" | "always" | "hidden";

export interface HotspotLabel {
  text: string;
  mode: HotspotLabelMode;
  offsetX?: number;
  offsetY?: number;
  customCss: string;
  motion: ElementMotion;
}

export type SceneAction =
  | { type: "none" }
  | { type: "openScene"; sceneIdOrName: string }
  | {
      type: "giveItem";
      itemId: string;
      amount: number;
      toastText: string;
      toastMotion: ElementMotion;
    };

export interface HotspotElement {
  type: "hotspot";
  id: string;
  name: string;
  x: number;
  y: number;
  visual: { kind: "image"; src: string; width?: number; height?: number };
  hoverShadow: { enabled: boolean };
  label?: HotspotLabel;
  actions: SceneAction[];
  once: boolean;
  visibleByDefault: boolean;
  customCss: string;
  motion: ElementMotion;
}

export interface SceneDefinition {
  id: string;
  name: string;
  baseImage: string;
  hotspots: HotspotElement[];
  letterboxMode?: LetterboxMode;
  letterboxColor?: string;
  customCss?: string;
  motion?: ElementMotion;
}

export interface ScenesLibraryFile {
  version: 1;
  scenes: SceneDefinition[];
}

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  detailImage: string;
  stackable: boolean;
  maxStack?: number;
}

export interface ItemsLibraryFile {
  version: 1;
  items: ItemDefinition[];
}

export type InventoryEntry =
  | { kind: "stack"; itemId: string; count: number; lastGainedAt: number }
  | { kind: "unique"; instanceId: string; itemId: string; lastGainedAt: number };

export interface InventoryState {
  entries: InventoryEntry[];
}

export interface SceneProgress {
  consumed: Record<string, boolean>;
  visibility?: Record<string, boolean>;
}

export type InventoryHudMode = "withScene" | "always";

export interface InventoryHudConfig {
  /** 相对舞台的左边距（设计像素或百分比由实现约定：v0.1 用设计像素） */
  left: number;
  top: number;
  slotSize: number;
  gap: number;
  openBagLabel: string;
  customCss: string;
}
```

`motion.ts`：实现 `MOTION_MS_MAX = 10000`、`MOTION_DEFAULT_DURATION_MS = 300`、`defaultMotionSide`、`defaultElementMotion`、`normalizeElementMotion`（非法值钳制）。

`id.ts`：`createId(prefix = "id")` → `` `${prefix}_${Math.random().toString(36).slice(2, 10)}` ``。

`coords.ts`：`clamp01(n)`。

`logger.ts`：`logError(scope, message, err?)` → `console.error("[scene-interaction]", scope, message, err)`。

- [ ] **Step 4: Run 测试通过**

Run: `npm test -- tests/domain/motion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain src/shared tests/domain/motion.test.ts
git commit -m "feat: add domain types and motion normalize"
```

---

### Task 3: JSON 序列化（场景 / 物品 / 库存 / 进度）

**Files:**
- Create: `src/domain/serialize.ts`
- Create: `src/domain/hotspot-label.ts`
- Create: `src/domain/letterbox.ts`
- Create: `src/domain/inventory-hud.ts`
- Test: `tests/domain/serialize.test.ts`

**Interfaces:**
- Consumes: Task 2 types / motion / clamp01 / logError
- Produces:
  - `emptyScenesLibrary(): ScenesLibraryFile`
  - `emptyItemsLibrary(): ItemsLibraryFile`
  - `emptyInventory(): InventoryState`
  - `emptyProgress(): SceneProgress`
  - `defaultInventoryHud(): InventoryHudConfig`
  - `parseScenesLibraryJson(raw: string): ScenesLibraryFile`
  - `stringifyScenesLibrary(lib: ScenesLibraryFile): string`
  - `parseItemsLibraryJson(raw: string): ItemsLibraryFile`
  - `stringifyItemsLibrary(lib: ItemsLibraryFile): string`
  - `parseInventoryJson(raw: string): InventoryState`
  - `stringifyInventory(state: InventoryState): string`
  - `parseProgressJson(raw: string): SceneProgress`
  - `stringifyProgress(p: SceneProgress): string`
  - `parseInventoryHudJson(raw: string): InventoryHudConfig`
  - `stringifyInventoryHud(c: InventoryHudConfig): string`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import {
  emptyScenesLibrary,
  parseScenesLibraryJson,
  stringifyScenesLibrary,
  parseItemsLibraryJson,
  parseInventoryJson,
  parseProgressJson,
} from "../../src/domain/serialize";

describe("parseScenesLibraryJson", () => {
  it("非法 JSON 回退空库", () => {
    const lib = parseScenesLibraryJson("{");
    expect(lib).toEqual(emptyScenesLibrary());
  });

  it("往返保留 version 与场景 id", () => {
    const lib = emptyScenesLibrary();
    lib.scenes.push({
      id: "s1",
      name: "庭院",
      baseImage: "asset://a.png",
      hotspots: [],
    });
    const again = parseScenesLibraryJson(stringifyScenesLibrary(lib));
    expect(again.version).toBe(1);
    expect(again.scenes[0]?.id).toBe("s1");
  });

  it("缺 hotspots 填 []", () => {
    const again = parseScenesLibraryJson(
      JSON.stringify({ version: 1, scenes: [{ id: "x", name: "n" }] }),
    );
    expect(again.scenes[0]?.hotspots).toEqual([]);
  });
});

describe("parseInventoryJson", () => {
  it("损坏回退空库存", () => {
    expect(parseInventoryJson("null").entries).toEqual([]);
  });
});

describe("parseProgressJson", () => {
  it("缺省 consumed 为空对象", () => {
    expect(parseProgressJson("{}").consumed).toEqual({});
  });
});

describe("parseItemsLibraryJson", () => {
  it("根必须带 items 数组", () => {
    const lib = parseItemsLibraryJson(JSON.stringify({ version: 1, items: [] }));
    expect(lib.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run 确认失败**

Run: `npm test -- tests/domain/serialize.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 serialize 与辅助规范化**

要点：
- 场景/物品根必须是 `{ version: 1, scenes|items: [] }`；若误传纯数组，**不要**当大地图兼容，直接回退空库并 `logError`
- hotspot：缺省 `hoverShadow: { enabled: true }`、`actions: []`、`once: false`、`visibleByDefault: true`、`motion: defaultElementMotion()`、坐标 `clamp01`
- `giveItem.amount` 至少为 1；缺 `toastMotion` 用 `defaultElementMotion()` 且 enter 默认 `slideUp`、exit 默认 `slideDown`（toast 友好默认）
- `defaultInventoryHud()`：`{ left: 24, top: 120, slotSize: 64, gap: 8, openBagLabel: "打开背包", customCss: "" }`

- [ ] **Step 4: Run 通过**

Run: `npm test -- tests/domain/serialize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain tests/domain/serialize.test.ts
git commit -m "feat: add scene/item/inventory JSON serialize"
```

---

### Task 4: 库存逻辑与快捷栏 top 8

**Files:**
- Create: `src/domain/inventory.ts`
- Create: `src/domain/item-registry.ts`
- Test: `tests/domain/inventory.test.ts`

**Interfaces:**
- Consumes: `InventoryState`, `ItemDefinition`, `createId`
- Produces:
  - `QUICKBAR_SLOTS = 8`
  - `findItem(items: ItemDefinition[], id: string): ItemDefinition | undefined`
  - `giveItemToInventory(state, item, amount, nowMs): InventoryState`（不可变；返回新 state）
  - `getItemCount(state, itemId): number`
  - `hasItem(state, itemId): boolean`
  - `getQuickbarEntries(state): InventoryEntry[]`（按 `lastGainedAt` 降序截断 8）
  - `sortEntriesRecentFirst(entries): InventoryEntry[]`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import {
  giveItemToInventory,
  getQuickbarEntries,
  getItemCount,
  QUICKBAR_SLOTS,
} from "../../src/domain/inventory";
import type { InventoryState, ItemDefinition } from "../../src/domain/types";

const potion: ItemDefinition = {
  id: "potion",
  name: "药水",
  description: "",
  icon: "",
  detailImage: "",
  stackable: true,
  maxStack: 99,
};

const key: ItemDefinition = {
  id: "key",
  name: "钥匙",
  description: "",
  icon: "",
  detailImage: "",
  stackable: false,
};

describe("giveItemToInventory", () => {
  it("可堆叠合并并刷新 lastGainedAt", () => {
    let s: InventoryState = { entries: [] };
    s = giveItemToInventory(s, potion, 2, 1000);
    s = giveItemToInventory(s, potion, 1, 2000);
    expect(getItemCount(s, "potion")).toBe(3);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]).toMatchObject({ kind: "stack", lastGainedAt: 2000 });
  });

  it("不可堆叠每次新建 unique", () => {
    let s: InventoryState = { entries: [] };
    s = giveItemToInventory(s, key, 2, 1000);
    expect(s.entries).toHaveLength(2);
    expect(s.entries.every((e) => e.kind === "unique")).toBe(true);
  });

  it("快捷栏最多 8 且最近在前", () => {
    let s: InventoryState = { entries: [] };
    for (let i = 0; i < 10; i++) {
      s = giveItemToInventory(
        s,
        { ...key, id: `k${i}`, name: `k${i}` },
        1,
        i,
      );
    }
    const q = getQuickbarEntries(s);
    expect(q).toHaveLength(QUICKBAR_SLOTS);
    expect(q[0]?.itemId).toBe("k9");
  });
});
```

- [ ] **Step 2: Run 确认失败**

Run: `npm test -- tests/domain/inventory.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 inventory.ts**

规则：
- `amount < 1` 视为 1
- 堆叠：找到同 `itemId` 的 stack 则 `count = min(count+amount, maxStack ?? Number.MAX_SAFE_INTEGER)`，并更新 `lastGainedAt`；溢出部分 v0.1 **丢弃并 logError**（简单明确）
- unique：循环 `amount` 次各建 `instanceId: createId("inst")`
- `getQuickbarEntries`：`sortEntriesRecentFirst` 后 `slice(0, 8)`

- [ ] **Step 4: Run 通过**

Run: `npm test -- tests/domain/inventory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/inventory.ts src/domain/item-registry.ts tests/domain/inventory.test.ts
git commit -m "feat: inventory give/stack and quickbar top8"
```

---

### Task 5: 动作链执行器

**Files:**
- Create: `src/domain/actions.ts`
- Create: `src/domain/scene-registry.ts`
- Test: `tests/domain/actions.test.ts`

**Interfaces:**
- Consumes: `SceneAction`, inventory helpers
- Produces:

```ts
export interface ActionRuntime {
  openScene(sceneIdOrName: string): boolean;
  giveItem(itemId: string, amount: number): boolean;
  enqueueToast(payload: {
    text: string;
    anchorHotspotId: string;
    motion: ElementMotion;
  }): void;
  warn(message: string): void;
}

export async function executeSceneActions(
  actions: SceneAction[],
  hotspotId: string,
  runtime: ActionRuntime,
): Promise<void>;
```

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from "vitest";
import { executeSceneActions } from "../../src/domain/actions";
import { defaultElementMotion } from "../../src/domain/motion";

describe("executeSceneActions", () => {
  it("按序执行；openScene 失败仍继续 giveItem", async () => {
    const calls: string[] = [];
    await executeSceneActions(
      [
        { type: "openScene", sceneIdOrName: "missing" },
        {
          type: "giveItem",
          itemId: "potion",
          amount: 1,
          toastText: "获得药水",
          toastMotion: defaultElementMotion(),
        },
      ],
      "hs1",
      {
        openScene: () => {
          calls.push("open");
          return false;
        },
        giveItem: () => {
          calls.push("give");
          return true;
        },
        enqueueToast: () => {
          calls.push("toast");
        },
        warn: () => {
          calls.push("warn");
        },
      },
    );
    expect(calls).toEqual(["open", "warn", "give", "toast"]);
  });

  it("none 不产生副作用", async () => {
    const warn = vi.fn();
    await executeSceneActions([{ type: "none" }], "hs1", {
      openScene: () => true,
      giveItem: () => true,
      enqueueToast: () => {},
      warn,
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run 确认失败**

Run: `npm test -- tests/domain/actions.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`giveItem` 成功后才 `enqueueToast`；`toastText` 为空时 runtime 层可再用物品名填充——**执行器内**：若 `toastText.trim() === ""`，仍 enqueue，`text` 传空串，由 UI 层回退物品名。`openScene === false` 时 `warn`。整链 `try/catch` 单步错误 `warn` 后继续。

`scene-registry.ts`：

```ts
export function findScene(
  scenes: SceneDefinition[],
  idOrName: string,
): SceneDefinition | undefined;
```

先匹配 `id`，再匹配 `name`。

- [ ] **Step 4: Run 通过**

Run: `npm test -- tests/domain/actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/actions.ts src/domain/scene-registry.ts tests/domain/actions.test.ts
git commit -m "feat: scene action chain executor"
```

---

### Task 6: 轻提示队列

**Files:**
- Create: `src/domain/toast-queue.ts`
- Test: `tests/domain/toast-queue.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ToastRequest {
  id: string;
  text: string;
  anchorHotspotId: string;
  motion: ElementMotion;
}

export interface ToastQueueState {
  current: ToastRequest | null;
  pending: ToastRequest[];
}

export function emptyToastQueue(): ToastQueueState;
export function enqueueToast(state: ToastQueueState, req: Omit<ToastRequest, "id">, id?: string): ToastQueueState;
export function advanceToastQueue(state: ToastQueueState): ToastQueueState;
```

规则：若 `current == null`，新请求直接成 `current`；否则进 `pending`。`advanceToastQueue`：取 `pending[0]` 为新 current。

- [ ] **Step 1–4: TDD 实现上述行为（含连续 enqueue 两条只显示一条 current、advance 后第二条上位）**
- [ ] **Step 5: Commit** `feat: toast queue`

---

### Task 7: Extension 入口（saveSchema / settings / 空 App）

**Files:**
- Modify: `src/index.tsx`
- Create: `src/app/scene-interaction-app.tsx`
- Create: `src/store/save-types.ts`
- Delete: `src/welcome-ui.tsx`（确认无引用后）

**Interfaces:**
- Produces: 默认导出 `SceneInteractionExtension`；`render` 注入 `save`
- `Map` 类型名用 `SceneInteractionSaveMap`：`inventoryJson` / `progressJson` / `isEditMode` / `currentSceneId`

- [ ] **Step 1: 实现 index.tsx**

对齐规格字段：

```ts
static saveSchema = defineSave({
  inventoryJson: { type: "string", persistence: "slot", default: '{"entries":[]}', label: "库存 JSON" },
  progressJson: { type: "string", persistence: "slot", default: '{"consumed":{}}', label: "场景进度 JSON" },
  isEditMode: { type: "boolean", persistence: "slot", default: true, label: "编辑模式" },
  currentSceneId: { type: "string", persistence: "slot", default: "", label: "当前场景 ID" },
});

static settings = settings((s) => ({
  allowEdit: s.boolean("允许编辑").default(true),
  theme: s.enum("界面主题", ["light", "dark"] as const).labels({ light: "浅色", dark: "深色" }).default("dark"),
  defaultSceneId: s.string("默认场景 ID").default(""),
  scenesLibraryJson: s.string("场景库 JSON（自动维护）").default('{"version":1,"scenes":[]}'),
  itemsLibraryJson: s.string("物品库 JSON（自动维护）").default('{"version":1,"items":[]}'),
  inventoryHudMode: s.enum("物品栏显示模式", ["withScene", "always"] as const)
    .labels({ withScene: "跟随场景交互", always: "常驻 HUD" }).default("withScene"),
  inventoryHudJson: s.string("物品栏外观 JSON").default(""),
  editorLeftWidth: s.number("编辑器左栏宽度").default(260).range(180, 480),
  editorRightWidth: s.number("编辑器右栏宽度").default(300).range(220, 520),
  designWidth: s.number("设计分辨率宽度").default(1920).range(320, 7680),
  designHeight: s.number("设计分辨率高度").default(1080).range(320, 7680),
}));
```

`SceneInteractionApp` 暂时渲染占位文案「场景交互系统」+ 显示 `isEditMode`。

`@extension({ id: "scene-interaction", label: "场景交互" })`

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 成功，无 TS 错误

- [ ] **Step 3: Commit** `feat: wire extension saveSchema and settings`

---

### Task 8: Store 持久化钩子与撤销栈

**Files:**
- Create: `src/store/use-save-value.ts`
- Create: `src/store/settings-sync.ts`
- Create: `src/store/scenes-persistence.ts`
- Create: `src/store/items-persistence.ts`
- Create: `src/store/inventory-persistence.ts`
- Create: `src/store/history.ts`
- Test: 可为 `history.ts` 加 `tests/domain/history.test.ts`（undo/redo）

**Interfaces:**
- Produces:
  - `useScenesLibrary()` / `useItemsLibrary()`：读 settings JSON，写回 settings
  - `useInventory()` / `useProgress()`：读写 save
  - `createHistory<T>(limit = 50)` → `{ push, undo, redo, canUndo, canRedo, present }`

实现时参考大地图 `use-maps-library-json.ts` / `history.ts` 的模式，但 **不要复制** 其对「纯数组根」的兼容。

- [ ] **Step 1–4: 实现 history TDD + persistence hooks（hooks 可用最小实现：封装 `useExtensionContext` + parse/stringify）**
- [ ] **Step 5: Commit** `feat: settings/save persistence and undo history`

---

### Task 9: 主题 + App 壳（编辑/运行、场景/物品库）

**Files:**
- Create: `src/theme/tokens.ts`
- Create: `src/theme/theme-provider.tsx`
- Modify: `src/app/scene-interaction-app.tsx`
- Create: `src/editor/editor-shell.tsx`（先空左中右布局）
- Create: `src/runtime/runtime-shell.tsx`（先空）

**Interfaces:**
- App 状态：`editorSection: "scenes" | "items"`
- `allowEdit === false` 时强制运行壳
- `isEditMode` 来自 save，顶栏切换写入 save

视觉：深色主背景约 `#17171B`，强调色自定（**避免**紫渐变/奶油陶土 AI 套路）；品牌感用「场景交互」标题即可。

- [ ] **Step 1: 实现可切换的双壳占位**
- [ ] **Step 2: `npm run build` 通过**
- [ ] **Step 3: Commit** `feat: app shell with edit/runtime and section tabs`

---

### Task 10: 场景编辑器 — 列表 + 画布拖放

**Files:**
- Create: `src/editor/panels/scene-list-panel.tsx`
- Create: `src/editor/panels/hotspot-list-panel.tsx`
- Create: `src/editor/canvas/scene-canvas.tsx`
- Create: `src/editor/canvas/scene-base-layer.tsx`
- Create: `src/editor/canvas/hotspot-layer.tsx`
- Create: `src/editor/ui/design-resolution-menu.tsx`
- Create: `src/shared/alpha-hit.ts`（可先导出 `isOpaqueAt(img, x, y, threshold)` 测试）
- Modify: `src/editor/editor-shell.tsx`

**Interfaces:**
- 新建场景：`createId("scene")`，name「未命名场景」
- 新建 hotspot：落在点击归一化坐标，默认图可为空串待属性面板选资源
- 选中 id 状态提升到 EditorShell
- 设计分辨率从 settings `designWidth/Height` 读取
- 变更场景库走 history.push

- [ ] **Step 1: 实现场景列表 CRUD + 画布显示底图与 hotspot 框**
- [ ] **Step 2: 拖拽移动 hotspot，写回归一化 x/y**
- [ ] **Step 3: 构建通过；Studio 手测清单写入 PR 说明备忘**
- [ ] **Step 4: Commit** `feat: scene editor list and canvas`

---

### Task 11: Schema 属性面板 + 动作列表

**Files:**
- Create: `src/schema/types.ts`
- Create: `src/schema/form-renderer.tsx`
- Create: `src/schema/scene-schema.ts`
- Create: `src/schema/hotspot-schema.ts`
- Create: `src/schema/motion-section.ts`
- Create: `src/schema/action-list-field.tsx`
- Create: `src/editor/panels/property-panel.tsx`
- Create: `src/domain/item-refs.ts`（`scenesRefencingItem(scenes, itemId): string[]`）

**Interfaces:**
- `action-list-field`：增删改排序 `SceneAction[]`
- `giveItem` 下拉选项来自物品库
- hotspot：`once`、`hoverShadow.enabled`、`label.mode`、`actions`、`motion`

可参考大地图 `schema/form-renderer.tsx` **思路**重写精简版（Input/Select/Asset 字段），不要依赖跨包 import 大地图源码。

- [ ] **Step 1: 属性面板绑定选中场景/hotspot**
- [ ] **Step 2: 动作列表可配置 openScene + giveItem**
- [ ] **Step 3: build + Commit** `feat: property schema and action list editor`

---

### Task 12: 物品库编辑器

**Files:**
- Create: `src/editor/panels/item-list-panel.tsx`
- Create: `src/schema/item-schema.ts`
- Create: `src/editor/items-editor-shell.tsx`（或复用 EditorShell 中 section===items 分支）
- Modify: `src/app/scene-interaction-app.tsx`

**Interfaces:**
- CRUD 物品；预览 icon + detailImage + 文案
- 删除时若 `scenesRefencingItem` 非空，面板顶部黄条警告

- [ ] **Step 1–3: 实现并 build**
- [ ] **Step 4: Commit** `feat: items library editor`

---

### Task 13: 运行时场景 + 点击 + once + 阴影 + toast

**Files:**
- Create: `src/runtime/scene-view.tsx`
- Create: `src/runtime/hotspot-view.tsx`
- Create: `src/runtime/toast-layer.tsx`
- Create: `src/runtime/create-action-runtime.ts`
- Modify: `src/runtime/runtime-shell.tsx`
- Create: `src/domain/progress.ts`（`isHotspotVisible` / `markConsumed`）

**Interfaces:**
- `createActionRuntime({...}): ActionRuntime` 连接 openScene→写 `currentSceneId`、giveItem→库存、toast→queue
- hotspot：CSS `filter: drop-shadow` 当 `hoverShadow.enabled` 且 hover
- `once`：执行成功后 `progress.consumed[id]=true` 并隐藏
- alpha-hit：mousedown 前检测，透明则忽略

- [ ] **Step 1: 运行壳渲染当前场景**
- [ ] **Step 2: 接通动作链与 toast 队列 UI**
- [ ] **Step 3: build + Commit** `feat: runtime scene interactions and toasts`

---

### Task 14: 快捷栏 + 背包 + 大图 + HUD 模式

**Files:**
- Create: `src/runtime/inventory-quickbar.tsx`
- Create: `src/runtime/inventory-backpack.tsx`
- Create: `src/runtime/item-detail-modal.tsx`
- Create: `src/schema/inventory-hud-schema.ts`（编辑器侧可在设置区或属性「UI」页编辑 `inventoryHudJson`）
- Modify: `src/runtime/runtime-shell.tsx`
- Modify: `src/app/scene-interaction-app.tsx`（`always` 模式：无场景时也可挂 Quickbar）

**Interfaces:**
- Quickbar：`getQuickbarEntries` + `InventoryHudConfig` 定位
- 点击槽 → `ItemDetailModal`
- 打开背包 → `InventoryBackpack` 全量 `sortEntriesRecentFirst`
- `inventoryHudMode === "withScene"`：仅 RuntimeShell（含场景）内显示
- `always`：App 层在运行态始终挂载 Quickbar（场景未开时仍可开背包）

- [ ] **Step 1–3: 实现三件套与模式分支**
- [ ] **Step 4: Commit** `feat: quickbar backpack and item detail`

---

### Task 15: 剧本方法 + 导入导出

**Files:**
- Create: `src/methods/scene-methods.ts`
- Create: `src/methods/inventory-methods.ts`
- Create: `src/editor/io/import-export.ts`
- Test: `tests/editor/import-export.test.ts`
- Modify: `src/index.tsx` 挂上 static methods

**Interfaces:**
- `openScene` / `setEditMode` / `getCurrentSceneId` / `setHotspotVisible`
- `giveItem` / `hasItem` / `getItemCount`
- `exportScenesLibrary(lib): string` / `importScenesLibrary(raw): ScenesLibraryFile`（非法抛错或回退由测试固定：**import 使用 parse，失败返回 empty + ok:false**）

```ts
export function tryImportScenesLibrary(raw: string):
  | { ok: true; value: ScenesLibraryFile }
  | { ok: false; error: string };
```

物品库同理。编辑器按钮触发下载/文件选择。

- [ ] **Step 1: TDD import-export**
- [ ] **Step 2: method() 声明与 run 实现（读 settings/save，写法参考大地图 map-methods）**
- [ ] **Step 3: build + 全量 `npm test`**
- [ ] **Step 4: Commit** `feat: story methods and json import-export`

---

### Task 16: 打磨、撤销接入、验收构建

**Files:**
- Modify: 编辑器写路径统一 `history`
- Modify: `README.md`（仅当需要 Studio 验收步骤时追加简短「场景交互」节；若用户未要求文档可只在本 plan 验收节勾选）

- [ ] **Step 1: 场景库与物品库编辑操作接入 undo/redo 快捷键（Ctrl+Z / Ctrl+Y）**
- [ ] **Step 2: 删除残留 welcome / smoke 若不再需要**
- [ ] **Step 3: 全量验证**

Run: `npm test`
Expected: 全部 PASS

Run: `npm run build`
Expected: 成功

- [ ] **Step 4: 对照规格验收清单自检（代码层）**
  - [ ] 动作类型可扩展（联合类型）
  - [ ] 无大地图 JSON 兼容分支
  - [ ] 无 openMap
  - [ ] QUICKBAR_SLOTS === 8
- [ ] **Step 5: Commit** `chore: v0.1 polish and verify build`

---

## Studio 人工验收（实现完成后交给用户）

1. 扩展预览进入编辑：建两场景，设底图，拖两个交互图  
2. 物品库建「药水」(堆叠)、「钥匙」(不堆叠)  
3. 交互点 A：动作 `giveItem` 药水 + toast；`once=true`  
4. 交互点 B：动作 `openScene` 到场景 2  
5. 切运行：悬浮阴影、点 A 得提示与快捷栏更新、再点 A 消失  
6. 开背包查看大图；点 B 切场景  
7. 设置 `inventoryHudMode=always`，关场景 UI 后仍能开背包（按实现入口验证）  
8. 导出/导入场景 JSON 往返  

---

## Plan Self-Review

| Spec 项 | Task |
|---------|------|
| 场景编辑器底图+hotspot | 10–11 |
| 悬浮阴影默认 | 3 缺省 + 13 |
| 动作链 openScene/giveItem | 5, 11, 13 |
| once | 13 + progress |
| 物品库编辑器 | 12 |
| 堆叠可配置 | 4, 12 |
| 8 格最近优先 | 4, 14 |
| 背包+大图 | 14 |
| HUD withScene/always | 7 settings + 14 |
| 标签 | 2 types + 11 + 13 |
| 自有 JSON 导入导出 | 3, 15 |
| 撤销重做 | 8, 16 |
| toast 队列 | 6, 13 |
| 剧本方法 | 15 |
| 无大地图互跳/不对齐 JSON | Global + Task 3 明确拒绝纯数组根 |
| 合成 | 不做 |

无 TBD 占位；类型名在 Task 2/5/6 已对齐。
