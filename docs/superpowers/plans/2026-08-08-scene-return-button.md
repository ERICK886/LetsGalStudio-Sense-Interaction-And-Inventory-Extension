# 场景返回按钮（多级栈）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打开场景时可压入多级返回栈；非栈空时显示可完全自定义的「返回场景」浮层按钮，逐级 pop 回上一场景。

**Architecture:** 领域层纯函数管理 `sceneReturnStack` 与 `openSceneWithReturn`；玩家存档 / 预览沙箱各存一份 `sceneReturnStackJson`；外观挂 `editor.sceneUiJson.sceneReturn`；运行时三壳挂载 `SceneReturnButton`；动作与剧本 method 共用入栈逻辑。

**Tech Stack:** TypeScript、React 18、现有 FormRenderer / UiBoxStyle / scene-layout、`useSaveValue`、`createActionRuntime`。

**Spec:** `docs/superpowers/specs/2026-08-08-scene-return-button-design.md`

## Global Constraints

- 禁止修改 `extension.json.id`（必须保持 `ext-27b96b`）
- 禁止手改 `sdk/` 与 `dist/`；只改 `src/` 后 `npm run build`
- 新增源码 kebab-case；文件头作者「池水三两升」、日期 `2026-08-08`、版本；详细中文注释
- 必要空行；严格模式；不用 `any`
- 无 Vitest；不以新建测试套件为交付；领域逻辑用 `npx --yes tsx` 临时脚本或手动对照验收；`npm run build` 必过
- Commit：仅用户明确要求时执行
- 对话与注释：中文
- 工作区可能有无关 WIP（颜色选择器 / 片段跳转等）：**只改本计划列出的文件**；勿把无关改动 stage 进提交
- 非目标：按场景覆盖样式、拖拽画布、返回过场、改 `defaultSceneId` 语义

---

## File Structure（锁定）

```text
src/domain/
  types.ts                      # SceneReturnButtonConfig；SceneUiConfig.sceneReturn；openScene 扩展字段
  scene-return-stack.ts         # NEW: parse/stringify/push/pop/openSceneWithReturn
  scene-return-button-config.ts # NEW: default/normalize sceneReturn 段（或并入 scene-ui-config）
  scene-ui-config.ts            # default/normalize 纳入 sceneReturn
  actions.ts                    # runOpenScene 传 push 选项；ActionRuntime.openScene 签名
  serialize.ts                  # normalize openScene 的 returnTarget/pushReturn
src/store/
  save-types.ts                 # sceneReturnStackJson
  preview-save-settings.ts      # PREVIEW_SCENE_RETURN_STACK_JSON_KEY
  preview-save.ts               # 读写沙箱栈；进预览可重置
src/modules/
  scene-interaction-extension.tsx  # saveSchema + settings 预览字段
src/methods/
  scene-methods.ts              # openScene / openSceneInteraction 参数
src/runtime/
  create-action-runtime.ts      # openScene 接栈 + get/set stack + getCurrentSceneId
  scene-return-button.tsx       # NEW: 浮层按钮
  scene-view.tsx                # 可选：挂载按钮；或三壳在 SceneView 旁挂载
  runtime-shell.tsx
  player-shell.tsx
src/editor/
  preview-shell.tsx
  ui/ui-editor-panel.tsx        # 二级页「返回场景」
  ui/scene-return-editor-panel.tsx  # NEW
src/schema/
  action-list-field.tsx         # 打开场景：压栈开关 + 返回目标
  scene-return-schema.ts        # NEW: 表单 fields（可选，也可内联 panel）
```

**类型约定：**

```ts
export interface SceneReturnButtonConfig {
  enabled: boolean;
  rect: UiRect; // x, y, w, h 均应有默认
  label: string;
  style: UiBoxStyle & UiTextStyle;
  imageSrc?: string;
  hoverStyle?: Partial<UiBoxStyle & UiTextStyle>;
  hoverImageSrc?: string;
}

// SceneUiConfig 增加：
sceneReturn: SceneReturnButtonConfig;

// SceneAction openScene：
{
  type: "openScene";
  sceneIdOrName: string;
  returnTarget?: string;
  pushReturn?: boolean; // 缺省 true
}

// SceneInteractionSaveMap 增加：
sceneReturnStackJson: string; // 默认 "[]"
```

**公开 API（领域）：**

```ts
// scene-return-stack.ts
export function parseSceneReturnStackJson(raw: string | undefined | null): string[];
export function stringifySceneReturnStack(stack: string[]): string;
export function pushSceneReturn(
  stack: string[],
  sceneId: string,
): string[];
export function popValidSceneReturn(
  stack: string[],
  scenes: SceneDefinition[],
): { nextStack: string[]; targetId: string | null };
export function openSceneWithReturn(params: {
  scenes: SceneDefinition[];
  currentSceneId: string;
  stack: string[];
  targetKey: string;
  returnTarget?: string;
  pushReturn?: boolean;
}): {
  ok: boolean;
  nextSceneId: string | null;
  nextStack: string[];
};

// scene-return-button-config.ts（或 scene-ui-config 内）
export function defaultSceneReturnButtonConfig(): SceneReturnButtonConfig;
export function normalizeSceneReturnButtonConfig(raw: unknown): SceneReturnButtonConfig;
```

---

### Task 1: 领域 — 返回栈 + sceneReturn 配置

**Files:**
- Create: `src/domain/scene-return-stack.ts`
- Create: `src/domain/scene-return-button-config.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/scene-ui-config.ts`

**Interfaces:**
- Consumes: `findScene`（`scene-registry`）、`UiRect` / `UiBoxStyle` / `UiTextStyle`、`normalizeUiRect` 若已有否则本地钳制
- Produces: 上表 API；`SceneUiConfig.sceneReturn`

- [ ] **Step 1: 类型**

在 `types.ts`：

1. 新增 `SceneReturnButtonConfig`
2. `SceneUiConfig` 增加 `sceneReturn`
3. `openScene` 动作增加可选 `returnTarget?`、`pushReturn?`
4. 更新文件头说明

- [ ] **Step 2: `scene-return-stack.ts`**

实现要点（须含详细中文注释）：

```ts
export function parseSceneReturnStackJson(
  raw: string | undefined | null,
): string[] {
  if (raw === undefined || raw === null || raw.trim() === "") {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim() !== "")
      .map((x) => x.trim());
  } catch {
    return [];
  }
}

export function stringifySceneReturnStack(stack: string[]): string {
  return JSON.stringify(stack);
}

export function pushSceneReturn(stack: string[], sceneId: string): string[] {
  const id = sceneId.trim();
  if (!id) {
    return stack.slice();
  }
  if (stack.length > 0 && stack[stack.length - 1] === id) {
    return stack.slice();
  }
  return [...stack, id];
}

export function popValidSceneReturn(
  stack: string[],
  scenes: SceneDefinition[],
): { nextStack: string[]; targetId: string | null } {
  let next = stack.slice();
  while (next.length > 0) {
    const id = next.pop()!;
    if (findScene(scenes, id) !== undefined) {
      return { nextStack: next, targetId: id };
    }
  }
  return { nextStack: [], targetId: null };
}

export function openSceneWithReturn(params: {
  scenes: SceneDefinition[];
  currentSceneId: string;
  stack: string[];
  targetKey: string;
  returnTarget?: string;
  pushReturn?: boolean;
}): {
  ok: boolean;
  nextSceneId: string | null;
  nextStack: string[];
} {
  const scene = findScene(params.scenes, params.targetKey);
  if (scene === undefined) {
    return {
      ok: false,
      nextSceneId: null,
      nextStack: params.stack.slice(),
    };
  }

  let nextStack = params.stack.slice();
  const pushReturn = params.pushReturn !== false;

  if (pushReturn) {
    let pushId = params.currentSceneId.trim();
    if (params.returnTarget !== undefined && params.returnTarget.trim() !== "") {
      const resolved = findScene(params.scenes, params.returnTarget.trim());
      if (resolved !== undefined) {
        pushId = resolved.id;
      }
    }
    if (pushId && pushId !== scene.id) {
      nextStack = pushSceneReturn(nextStack, pushId);
    }
  }

  return { ok: true, nextSceneId: scene.id, nextStack };
}
```

- [ ] **Step 3: `scene-return-button-config.ts`**

```ts
export function defaultSceneReturnButtonConfig(): SceneReturnButtonConfig {
  return {
    enabled: true,
    rect: { x: 24, y: 24, w: 120, h: 48 },
    label: "返回",
    style: {
      background: "rgba(0,0,0,0.55)",
      borderColor: "rgba(255,255,255,0.35)",
      borderWidth: 1,
      borderRadius: 8,
      color: "#ffffff",
      fontSize: 16,
      fontWeight: 600,
      label: "返回",
    },
  };
}
```

`normalizeSceneReturnButtonConfig`：非法 → 默认；`rect` 保证有限 x/y 与正 w/h；`label` 非空字符串；合并 style。

- [ ] **Step 4: 接入 `scene-ui-config`**

`defaultSceneUiConfig` / `normalizeSceneUiConfig` 增加 `sceneReturn: normalizeSceneReturnButtonConfig(...)`。缺省段补默认，不丢 `itemToast` / `hotspotHover`。

- [ ] **Step 5: 手动验收栈逻辑**

在仓库根目录用临时脚本（验收后删除）：

```bash
npx --yes tsx -e "const { openSceneWithReturn, popValidSceneReturn } = require('./src/domain/scene-return-stack.ts'); /* 或改用 ESM import 写法 */"
```

若 `tsx` 对 path 别扭，可写 `scripts/tmp-scene-return-check.mts` 跑完删除。对照：

1. A→B 默认：`nextStack=["A"]`，`nextSceneId=B`
2. B→C：`["A","B"]`
3. pop 两次回到 A，栈空
4. `pushReturn:false` 不增栈
5. `returnTarget` 指向 C：从 A 开 B 得栈 `["C"]`

Expected: 行为符合 spec §3

- [ ] **Step 6: `npm run build`**

Expected: exit 0（或仅后续未接线警告——本任务应已自洽）

- [ ] **Step 7: Commit（仅用户要求时）**

```bash
git add src/domain/types.ts src/domain/scene-return-stack.ts src/domain/scene-return-button-config.ts src/domain/scene-ui-config.ts
git commit -m "feat: 场景返回栈与 sceneReturn 配置领域层"
```

---

### Task 2: 存档 + 预览沙箱字段

**Files:**
- Modify: `src/store/save-types.ts`
- Modify: `src/modules/scene-interaction-extension.tsx`
- Modify: `src/store/preview-save-settings.ts`
- Modify: `src/store/preview-save.ts`

**Interfaces:**
- Consumes: `stringifySceneReturnStack` / `parseSceneReturnStackJson`
- Produces: SaveMap 与预览可读写 `sceneReturnStackJson`

- [ ] **Step 1: `save-types.ts`**

```ts
sceneReturnStackJson: string;
```

默认注释：`默认 "[]"`。

- [ ] **Step 2: `saveSchema`**

在 `scene-interaction-extension.tsx` 的 `defineSave` 增加：

```ts
sceneReturnStackJson: {
  type: "string",
  persistence: "slot",
  default: "[]",
  label: "场景返回栈 JSON",
},
```

settings 预览沙箱增加：

```ts
previewSceneReturnStackJson: s
  .string("预览场景返回栈 JSON（测试用）")
  .default("[]"),
```

- [ ] **Step 3: `preview-save-settings.ts`**

```ts
export const PREVIEW_SCENE_RETURN_STACK_JSON_KEY = "previewSceneReturnStackJson";
```

- [ ] **Step 4: `preview-save.ts`**

1. `createPreviewSave` 初始含 `sceneReturnStackJson: "[]"`（可被 initial 覆盖）
2. `persistPreviewField`：`sceneReturnStackJson` → 写 `PREVIEW_SCENE_RETURN_STACK_JSON_KEY`
3. `createSettingsPreviewSave`：加载该 settings；**进入预览时重置策略**：
   - 在 `EditorApp` 创建预览 save 处（或 `createSettingsPreviewSave` 增加选项 `resetReturnStack?: boolean`）强制 `sceneReturnStackJson = "[]"` 并写回 settings
   - 推荐：`createSettingsPreviewSave(ctx, overrides, { resetReturnStack: true })`；编辑器运行预览传 `true`
4. 可选：`overrides.sceneReturnStackJson` 支持预置一层（如 `'["main-id"]'`）

- [ ] **Step 5: 定位预览入口**

修改创建预览 save 的调用点（通常 `src/app/editor-app.tsx`）：传入 `resetReturnStack: true`（或等价），保证每次「运行预览」沙箱栈清空。

- [ ] **Step 6: `npm run build`**

Expected: exit 0

- [ ] **Step 7: Commit（仅用户要求时）**

```bash
git commit -m "feat: 存档与预览沙箱支持场景返回栈"
```

---

### Task 3: openScene 接线（动作 + 运行时 + method）

**Files:**
- Modify: `src/domain/actions.ts`
- Modify: `src/domain/serialize.ts`
- Modify: `src/runtime/create-action-runtime.ts`
- Modify: `src/methods/scene-methods.ts`
- Modify: `src/runtime/runtime-shell.tsx`
- Modify: `src/runtime/player-shell.tsx`
- Modify: `src/editor/preview-shell.tsx`

**Interfaces:**
- Consumes: `openSceneWithReturn`、`parseSceneReturnStackJson`、`stringifySceneReturnStack`
- Produces: 打开场景时写栈；`ActionRuntime.openScene` 支持选项

- [ ] **Step 1: `ActionRuntime` 签名**

```ts
openScene(
  sceneIdOrName: string,
  options?: { returnTarget?: string; pushReturn?: boolean },
): boolean;
```

`runOpenSceneAction`：

```ts
runtime.openScene(action.sceneIdOrName, {
  returnTarget: action.returnTarget,
  pushReturn: action.pushReturn,
});
```

- [ ] **Step 2: `serialize.ts`**

`case "openScene"`：

```ts
case "openScene": {
  const action: Extract<SceneAction, { type: "openScene" }> = {
    type: "openScene",
    sceneIdOrName:
      typeof obj.sceneIdOrName === "string" ? obj.sceneIdOrName : "",
  };
  if (typeof obj.returnTarget === "string" && obj.returnTarget.trim()) {
    action.returnTarget = obj.returnTarget.trim();
  }
  if (obj.pushReturn === false) {
    action.pushReturn = false;
  }
  return action;
}
```

（写出侧若有 stringify action，同步保留字段。）

- [ ] **Step 3: `createActionRuntime` deps**

增加：

```ts
getCurrentSceneId: () => string;
getReturnStack: () => string[];
setReturnStack: (stack: string[]) => void;
```

`openScene` 实现：

```ts
openScene(sceneIdOrName, options) {
  const result = openSceneWithReturn({
    scenes: deps.getScenes(),
    currentSceneId: deps.getCurrentSceneId(),
    stack: deps.getReturnStack(),
    targetKey: sceneIdOrName,
    returnTarget: options?.returnTarget,
    pushReturn: options?.pushReturn,
  });
  if (!result.ok || result.nextSceneId === null) {
    return false;
  }
  deps.setReturnStack(result.nextStack);
  deps.setCurrentSceneId(result.nextSceneId);
  return true;
}
```

- [ ] **Step 4: 三壳注入**

各壳已有 `useSaveValue(..., "currentSceneId")`。增加：

```ts
const [returnStackJson, setReturnStackJson] = useSaveValue(
  save,
  "sceneReturnStackJson",
);
```

组装 runtime 时：

```ts
getCurrentSceneId: () => currentSceneId,
getReturnStack: () => parseSceneReturnStackJson(returnStackJson),
setReturnStack: (stack) => setReturnStackJson(stringifySceneReturnStack(stack)),
```

注意：getter 须读最新值（用 ref 同步 `currentSceneId` / `returnStackJson`，与 inventory 相同模式，避免闭包过期）。

- [ ] **Step 5: `scene-methods.ts`**

`openScene` / `openSceneInteraction` schema 增加可选：

```ts
returnTarget: { type: "string", label: "返回目标（可选）", required: false },
pushReturn: { type: "boolean", label: "压入返回栈", required: false },
```

在写 `currentSceneId` 前调用 `openSceneWithReturn`（读当前 id + 栈），再 `save.set` 两字段并 `notifySaveField`。  
`pushReturn`：params 缺省或非 false → true。

- [ ] **Step 6: `npm run build`**

Expected: exit 0；所有 `createActionRuntime` 调用点补齐新 deps

- [ ] **Step 7: Commit（仅用户要求时）**

```bash
git commit -m "feat: openScene 支持多级返回栈"
```

---

### Task 4: 动作编辑器 UI

**Files:**
- Modify: `src/schema/action-list-field.tsx`

**Interfaces:**
- Consumes: 扩展后的 `openScene` 类型
- Produces: 作者可配 `pushReturn` / `returnTarget`

- [ ] **Step 1: 默认动作工厂**

`createDefaultAction("openScene")` 保持：

```ts
{ type: "openScene", sceneIdOrName: scenes[0]?.id ?? "" }
// pushReturn 省略 (=true)；不写 returnTarget
```

- [ ] **Step 2: 表单**

在目标场景 `<select>` 下增加：

1. checkbox「压入返回栈」：`checked={action.pushReturn !== false}`；取消时 `onReplace({ ...action, pushReturn: false })`；勾选时删除 `pushReturn` 或设 `true`
2. 「返回目标」`<select>`：首项 value=`""` 文案「（来源场景）」；选项同场景列表；变更写 `returnTarget`（空则 `delete` / 不传）

替换 openScene 时勿丢掉已有 `pushReturn`/`returnTarget`（除用户明确改目标场景外保留）。

- [ ] **Step 3: `npm run build`**

Expected: exit 0

- [ ] **Step 4: Commit（仅用户要求时）**

```bash
git commit -m "feat: 打开场景动作可配置返回栈"
```

---

### Task 5: 场景 UI 编辑器 —「返回场景」

**Files:**
- Create: `src/schema/scene-return-schema.ts`
- Create: `src/editor/ui/scene-return-editor-panel.tsx`
- Modify: `src/editor/ui/ui-editor-panel.tsx`

**Interfaces:**
- Consumes: `readSceneUiConfig` / `writeSceneUiConfig`
- Produces: 作者可编辑 `sceneReturn`

- [ ] **Step 1: schema fields**

`scene-return-schema.ts`：扁平 key 列表供 FormRenderer：

- `enabled`（boolean）
- `rect.x` / `rect.y` / `rect.w` / `rect.h`（number）
- `label`（string）
- `style.*`（复用 `ui-style-fields` 模式，对照 `item-toast-schema`）
- `imageSrc`（string / 资源）
- `hoverStyle.*`、`hoverImageSrc`（可选分组）

- [ ] **Step 2: `SceneReturnEditorPanel`**

对照 `item-toast-editor-panel.tsx`：

- load：`readSceneUiConfig(ctx).sceneReturn`
- persist：`writeSceneUiConfig(ctx, { ...ui, sceneReturn: next })`
- 重置：`defaultSceneReturnButtonConfig()`
- 右侧简易预览：`applyUiBoxStyle` / `applyUiTextStyle` 画一块静态按钮（非运行时栈）

- [ ] **Step 3: `ui-editor-panel`**

```ts
type SceneUiTab = "itemToast" | "hotspotHover" | "sceneReturn";
```

增加按钮「返回场景」；tab 内容渲染 `SceneReturnEditorPanel`。

- [ ] **Step 4: `npm run build`**

Expected: exit 0

- [ ] **Step 5: Commit（仅用户要求时）**

```bash
git commit -m "feat: 场景 UI 分区增加返回场景编辑"
```

---

### Task 6: 运行时浮层 `SceneReturnButton`

**Files:**
- Create: `src/runtime/scene-return-button.tsx`
- Modify: `src/runtime/runtime-shell.tsx`
- Modify: `src/runtime/player-shell.tsx`
- Modify: `src/editor/preview-shell.tsx`
- Modify: `src/store/use-scene-ui-config.ts`（若需暴露 sceneReturn；通常已返回整包）

**Interfaces:**
- Consumes: `SceneReturnButtonConfig`、`parseSceneReturnStackJson`、`popValidSceneReturn`、`useSceneUiConfig`、`buildSceneLayout` 或与 SceneView 相同的 scale
- Produces: 可见可点的返回按钮

- [ ] **Step 1: 组件**

```tsx
export function SceneReturnButton(props: {
  config: SceneReturnButtonConfig;
  stackJson: string;
  currentSceneId: string;
  scenes: SceneDefinition[];
  designWidth: number;
  designHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  onReturn: (nextSceneId: string, nextStack: string[]) => void;
}): React.ReactElement | null
```

逻辑：

1. `!config.enabled` → null
2. `stack = parseSceneReturnStackJson(stackJson)`；空 → null
3. 用 `popValidSceneReturn` **预览**栈顶有效目标（只读：可抽 `peekValidSceneReturn` 避免误 pop）——若无有效目标或 `targetId === currentSceneId` → null  
   推荐新增：

```ts
export function peekValidSceneReturn(
  stack: string[],
  scenes: SceneDefinition[],
): string | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (findScene(scenes, stack[i]!) !== undefined) {
      return stack[i]!;
    }
  }
  return null;
}
```

4. 缩放：`scaleX = viewportWidth / designWidth`（与 scene-view 一致）
5. 渲染 `position:absolute` 按钮；hover 时合并 `hoverStyle` / `hoverImageSrc`
6. onClick：真正 `popValidSceneReturn` → `onReturn(targetId, nextStack)`

- [ ] **Step 2: 三壳挂载**

在 `SceneView` 同层容器内（已有相对定位）渲染：

```tsx
<SceneReturnButton
  config={sceneUi.sceneReturn}
  stackJson={returnStackJson}
  currentSceneId={currentSceneId}
  scenes={library.scenes}
  designWidth={designSize.width}
  designHeight={designSize.height}
  viewportWidth={...}
  viewportHeight={...}
  onReturn={(id, stack) => {
    setReturnStackJson(stringifySceneReturnStack(stack));
    setCurrentSceneId(id);
  }}
/>
```

viewport 尺寸取壳层已有 layout / resize 状态；若暂无，可读 SceneView 外包一层 ref。

- [ ] **Step 3: 显示条件手测清单**

1. 预览：主场景无按钮  
2. 热点 openScene 到子场景 → 出现返回 → 点回主场景 → 消失  
3. A→B→C 两次返回  
4. UI 分区改 label/位置后预览立即生效（settings 订阅）

- [ ] **Step 4: `npm run build`**

Expected: exit 0

- [ ] **Step 5: Commit（仅用户要求时）**

```bash
git commit -m "feat: 运行时场景返回浮层按钮"
```

---

### Task 7: 全量验收

**Files:** 无新文件；对照 spec §6

- [x] **Step 1: `npm run build`**

Expected: exit 0

- [x] **Step 2: 手工清单（打勾）** — 静态代码验证 7/7 通过；Studio 手测待作者确认（见 `.superpowers/sdd/task-7-report.md`）

| # | 场景 | 期望 |
| --- | --- | --- |
| 1 | A→B→C 逐级返回 | 回到 A，按钮消失 |
| 2 | pushReturn=false | 栈不变 |
| 3 | returnTarget=C，从 A 开 B | 返回去 C |
| 4 | 场景 UI 改样式 | 预览/玩家一致 |
| 5 | 玩家存档读档 | 栈仍在 |
| 6 | 重新「运行预览」 | 沙箱栈为空 |
| 7 | 旧工程无 sceneReturn | 不报错，默认按钮可用 |

- [x] **Step 3: 更新 spec 状态**

`2026-08-08-scene-return-button-design.md` 状态改为「已实现」或「实现中→已验收」（按实际）。

- [ ] **Step 4: Commit（仅用户要求时）**

```bash
git commit -m "feat: 完成场景返回按钮验收"
```

---

## Spec Coverage（自检）

| Spec 要求 | Task |
| --- | --- |
| `sceneReturnStackJson` 玩家存档 | T2 |
| 预览沙箱可重置 | T2 |
| `openScene` returnTarget / pushReturn | T1 + T3 + T4 |
| method 同步参数 | T3 |
| `sceneUiJson.sceneReturn` | T1 + T5 |
| 多级栈 + 逐级 pop | T1 + T6 |
| 无效 id 跳过 | T1 `popValidSceneReturn` |
| 完整浮层 UI | T5 + T6 |
| 三壳 | T3 + T6 |
| 退出会话不清玩家栈 | T3（不写 clear） |
| 非目标未做 | 全文未安排拖拽画布/过场 |

## Placeholder / 类型一致性

- 无 TBD
- `openSceneWithReturn` / `popValidSceneReturn` / `peekValidSceneReturn` 命名在 T1/T6 一致
- Save 字段名全程 `sceneReturnStackJson`
- UI 段名全程 `sceneReturn`
