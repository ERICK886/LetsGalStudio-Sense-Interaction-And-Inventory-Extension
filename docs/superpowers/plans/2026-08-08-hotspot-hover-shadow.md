# 交互点悬停阴影自定义 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个交互点可配置悬停阴影的颜色、偏移、模糊、强度，并支持光晕/底影双层独立开关（总开关优先）。

**Architecture:** 领域层新增 `HotspotHoverShadow` / `HoverShadowLayer` 与 `hover-shadow.ts`（默认值、normalize、拼装 `filter`）；序列化与新建交互点写入完整结构；`hotspot-schema` 暴露面板字段；`HotspotView` 用 `buildHoverShadowFilter` 替换硬编码双层 drop-shadow。

**Tech Stack:** TypeScript、React 18、Vite 5、现有 `FormRenderer` / color 字段、`normalizeHexColor`（`src/schema/color-utils.ts`）。

**Spec:** `docs/superpowers/specs/2026-08-08-hotspot-hover-shadow-design.md`

## Global Constraints

- 禁止修改 `extension.json.id`（必须保持 `ext-27b96b`）
- 禁止手改 `sdk/` 与 `dist/`；行为变更只改 `src/` 后 `npm run build`
- 新增源码：`kebab-case.ts` / `kebab-case.tsx`
- 文件头注释：文件名、作者「池水三两升」、日期 `2026-08-08`、版本；函数含详细中文注释（参数/返回值/异常/示例）
- 必要空行提高可读性
- TypeScript 严格模式，不用 `any` 掩盖契约
- 仓库已移除 Vitest；**不以新建测试套件为交付**；每任务以 `npm run build` 与手动预览验收
- Commit 步骤：仅当用户明确要求提交时执行；否则跳过 git commit
- 对话与注释语言：中文
- 不做：全局默认阴影、画布选中伪悬停、自由 CSS 字符串、可变层数、box-shadow spread

---

## File Structure（锁定）

```text
src/
  domain/
    types.ts                 # HoverShadowLayer / HotspotHoverShadow；HotspotElement.hoverShadow
    hover-shadow.ts          # NEW: default / normalize / buildFilter / hex→rgb
    serialize.ts             # normalizeHotspotElement 接入 normalizeHotspotHoverShadow
  schema/
    hotspot-schema.ts        # 视觉区：总开关 + 光晕/底影字段
    color-utils.ts           # 复用 normalizeHexColor（不改 API）
  editor/panels/
    hotspot-list-panel.tsx   # createDefaultHotspot 用 defaultHotspotHoverShadow()
    property-panel.tsx       # withHotspotFormDefaults 用 normalizeHotspotHoverShadow
  runtime/
    hotspot-view.tsx         # 删除 DEFAULT_HOVER_DROP_SHADOW；改用 buildHoverShadowFilter
```

**类型约定（实现必须一致）：**

```ts
export interface HoverShadowLayer {
  enabled: boolean;
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  blur: number;
  intensity: number;
}

export interface HotspotHoverShadow {
  enabled: boolean;
  glow: HoverShadowLayer;
  base: HoverShadowLayer;
}
```

**默认值（必须一致）：**

| 字段 | glow | base |
| --- | --- | --- |
| enabled | true | true |
| color | `#FFECA0` | `#000000` |
| opacity | 0.85 | 0.45 |
| offsetX | 0 | 0 |
| offsetY | 0 | 2 |
| blur | 10 | 6 |
| intensity | 1 | 1 |

总开关默认 `true`。

**公开 API（`src/domain/hover-shadow.ts`）：**

```ts
export function defaultHoverShadowLayer(
  kind: "glow" | "base",
): HoverShadowLayer;

export function defaultHotspotHoverShadow(): HotspotHoverShadow;

export function normalizeHotspotHoverShadow(
  raw: unknown,
): HotspotHoverShadow;

/**
 * @returns 非空 filter 字符串；总开关关 / 无启用层时返回 undefined
 */
export function buildHoverShadowFilter(
  shadow: HotspotHoverShadow,
): string | undefined;
```

---

### Task 1: 领域类型 + `hover-shadow.ts`

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/domain/hover-shadow.ts`

**Interfaces:**
- Consumes: `normalizeHexColor` from `src/schema/color-utils.ts`（若为避免 domain→schema 依赖，可在 `hover-shadow.ts` 内实现私有 `#RGB/#RRGGBB` 解析；**推荐私有解析**，domain 不依赖 schema）
- Produces: 上表类型与四个公开函数

- [ ] **Step 1: 在 `types.ts` 增加类型并改 `HotspotElement`**

将：

```ts
hoverShadow: { enabled: boolean };
```

替换为导出的 `HotspotHoverShadow`（及 `HoverShadowLayer`）。文件头版本 bump 至与现有注释风格一致。

- [ ] **Step 2: 新建 `hover-shadow.ts`（完整实现）**

文件头：`hover-shadow.ts` / 池水三两升 / 2026-08-08 / 0.1.0。

实现要点：

```ts
function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function parseCssHexToRgb(
  color: string,
): { r: number; g: number; b: number } | null {
  // 支持 #RGB / #RRGGBB；非法返回 null
}

function layerToDropShadow(layer: HoverShadowLayer): string | null {
  if (!layer.enabled) return null;
  const rgb = parseCssHexToRgb(layer.color);
  if (rgb === null) return null;
  const alpha = clamp(layer.opacity * layer.intensity, 0, 1);
  const blur = Math.max(0, layer.blur);
  return `drop-shadow(${layer.offsetX}px ${layer.offsetY}px ${blur}px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha}))`;
}

export function buildHoverShadowFilter(
  shadow: HotspotHoverShadow,
): string | undefined {
  if (!shadow.enabled) return undefined;
  const parts: string[] = [];
  const glow = layerToDropShadow(shadow.glow);
  const base = layerToDropShadow(shadow.base);
  if (glow) parts.push(glow);
  if (base) parts.push(base);
  if (parts.length === 0) return undefined;
  return parts.join(" ");
}
```

`normalizeHotspotHoverShadow`：

- `raw` 非对象 → `defaultHotspotHoverShadow()`
- `enabled`：缺省 true，否则 `Boolean`
- 每层：从 `raw.glow` / `raw.base` 读字段；缺省用 `defaultHoverShadowLayer(kind)`
- opacity clamp 0–1；intensity clamp 0–2；blur `Math.max(0, n)`；offset 非有限 → 默认
- color：字符串且 `parseCssHexToRgb` 成功则规范化为 `#RRGGBB` 大写或保留合法串；否则默认色
- **旧数据**仅 `{ enabled: false }`：总开关 false，glow/base 仍为完整默认层

每个导出函数写中文 JSDoc（参数/返回值/示例）。

- [ ] **Step 3: 构建检查**

Run: `npm run build`  
Expected: 可能因 `HotspotElement.hoverShadow` 形状变化而在其它文件报错——若仅类型报错，进入 Task 2 一并修；若 Task 1 可单独通过则先通过。

- [ ] **Step 4: Commit（仅用户要求时）**

```bash
git add src/domain/types.ts src/domain/hover-shadow.ts
git commit -m "feat: add HotspotHoverShadow domain model"
```

---

### Task 2: 序列化 + 新建/表单默认

**Files:**
- Modify: `src/domain/serialize.ts`（`normalizeHotspotElement` 内 `hoverShadow` 赋值）
- Modify: `src/editor/panels/hotspot-list-panel.tsx`（`createDefaultHotspot`）
- Modify: `src/editor/panels/property-panel.tsx`（`withHotspotFormDefaults`）

**Interfaces:**
- Consumes: `normalizeHotspotHoverShadow` / `defaultHotspotHoverShadow`
- Produces: 加载旧库与新建交互点均为完整 `HotspotHoverShadow`

- [ ] **Step 1: 改 `normalizeHotspotElement`**

删除手写：

```ts
hoverShadow: {
  enabled:
    hoverShadowRaw?.enabled === undefined
      ? true
      : Boolean(hoverShadowRaw.enabled),
},
```

改为：

```ts
hoverShadow: normalizeHotspotHoverShadow(obj.hoverShadow),
```

并删除仅服务于旧逻辑的 `hoverShadowRaw` 局部变量（若不再使用）。文件头注明支持完整 hoverShadow。import `normalizeHotspotHoverShadow`。

- [ ] **Step 2: 改新建默认**

`createDefaultHotspot`：

```ts
hoverShadow: defaultHotspotHoverShadow(),
```

`withHotspotFormDefaults`：

```ts
hoverShadow: normalizeHotspotHoverShadow(hotspot.hoverShadow),
```

- [ ] **Step 3: 构建**

Run: `npm run build`  
Expected: exit 0（若 schema/runtime 仍写旧形状，类型错误则先修引用处最小改动，或与 Task 3/4 同批）。

- [ ] **Step 4: Commit（仅用户要求时）**

```bash
git add src/domain/serialize.ts src/editor/panels/hotspot-list-panel.tsx src/editor/panels/property-panel.tsx
git commit -m "feat: normalize and default full hotspot hoverShadow"
```

---

### Task 3: 属性面板 schema

**Files:**
- Modify: `src/schema/hotspot-schema.ts`

**Interfaces:**
- Consumes: FormRenderer 已有 `boolean` / `color` / `number` / `section` / `grid`
- Produces: 作者可编辑总开关与两层全部字段

- [ ] **Step 1: 替换视觉区单一 boolean**

将现有：

```ts
{
  key: "hoverShadow.enabled",
  kind: "boolean",
  label: "悬停阴影",
  description: "运行时 hover 时施加 drop-shadow",
},
```

扩展为（保持在 `visual` section 的 `children` 内）：

```ts
{
  key: "hoverShadow.enabled",
  kind: "boolean",
  label: "悬停阴影",
  description: "总开关；关闭时不显示阴影。打开后由光晕/底影层开关决定",
},
{
  kind: "section",
  id: "hover-shadow-glow",
  title: "光晕层",
  description: "悬停时的高亮光晕（drop-shadow）",
  children: [
    { key: "hoverShadow.glow.enabled", kind: "boolean", label: "启用光晕" },
    { key: "hoverShadow.glow.color", kind: "color", label: "颜色", placeholder: "#FFECA0" },
    {
      kind: "grid",
      id: "hover-shadow-glow-nums",
      columns: 2,
      gap: 8,
      children: [
        { key: "hoverShadow.glow.opacity", kind: "number", label: "透明度", min: 0, max: 1, step: 0.05 },
        { key: "hoverShadow.glow.intensity", kind: "number", label: "强度", min: 0, max: 2, step: 0.05, description: "乘到透明度上，最终 alpha 限制在 0–1" },
        { key: "hoverShadow.glow.offsetX", kind: "number", label: "偏移 X", step: 1 },
        { key: "hoverShadow.glow.offsetY", kind: "number", label: "偏移 Y", step: 1 },
        { key: "hoverShadow.glow.blur", kind: "number", label: "模糊", min: 0, step: 1 },
      ],
    },
  ],
},
{
  kind: "section",
  id: "hover-shadow-base",
  title: "底影层",
  description: "悬停时的暗色软影（drop-shadow）",
  children: [
    { key: "hoverShadow.base.enabled", kind: "boolean", label: "启用底影" },
    { key: "hoverShadow.base.color", kind: "color", label: "颜色", placeholder: "#000000" },
    {
      kind: "grid",
      id: "hover-shadow-base-nums",
      columns: 2,
      gap: 8,
      children: [
        { key: "hoverShadow.base.opacity", kind: "number", label: "透明度", min: 0, max: 1, step: 0.05 },
        { key: "hoverShadow.base.intensity", kind: "number", label: "强度", min: 0, max: 2, step: 0.05, description: "乘到透明度上，最终 alpha 限制在 0–1" },
        { key: "hoverShadow.base.offsetX", kind: "number", label: "偏移 X", step: 1 },
        { key: "hoverShadow.base.offsetY", kind: "number", label: "偏移 Y", step: 1 },
        { key: "hoverShadow.base.blur", kind: "number", label: "模糊", min: 0, step: 1 },
      ],
    },
  ],
},
```

更新文件头说明与 `hotspotFields` 文档中的分区描述。版本 bump。

确认 `FormRenderer` 对嵌套 `section` 内 `grid` 的写入路径支持点分 key（项目内 backpack / motion 已用同模式）。

- [ ] **Step 2: 构建**

Run: `npm run build`  
Expected: exit 0

- [ ] **Step 3: Commit（仅用户要求时）**

```bash
git add src/schema/hotspot-schema.ts
git commit -m "feat: expose hotspot hover shadow layer fields in editor"
```

---

### Task 4: `HotspotView` 消费配置

**Files:**
- Modify: `src/runtime/hotspot-view.tsx`

**Interfaces:**
- Consumes: `buildHoverShadowFilter(hotspot.hoverShadow)`
- Produces: 悬停时动态 filter；无硬编码金色/黑色字符串

- [ ] **Step 1: 替换硬编码**

删除：

```ts
const DEFAULT_HOVER_DROP_SHADOW =
  "drop-shadow(0 0 10px rgba(255, 236, 160, 0.85)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45))";
```

改为 import：

```ts
import { buildHoverShadowFilter } from "../domain/hover-shadow";
```

将：

```ts
const shadowEnabled = hotspot.hoverShadow?.enabled !== false;
// ...
const showShadow = shadowEnabled && interactiveHover;
// ...
filter: showShadow ? DEFAULT_HOVER_DROP_SHADOW : undefined,
```

改为：

```ts
const hoverFilter = buildHoverShadowFilter(
  hotspot.hoverShadow /* 经 normalize 后必为完整结构；若边界未 normalize，可先 normalizeHotspotHoverShadow */,
);
const showShadow = hoverFilter !== undefined && interactiveHover;
// style:
filter: showShadow ? hoverFilter : undefined,
```

为防编辑器未落盘的半成品对象，**推荐**：

```ts
import {
  buildHoverShadowFilter,
  normalizeHotspotHoverShadow,
} from "../domain/hover-shadow";

const hoverFilter = buildHoverShadowFilter(
  normalizeHotspotHoverShadow(hotspot.hoverShadow),
);
```

更新文件头版本与说明。

- [ ] **Step 2: 构建**

Run: `npm run build`  
Expected: exit 0；`dist/index.js` 更新

- [ ] **Step 3: 手动验收（对照 spec）**

1. 旧数据仅 `{ enabled: true }`：预览悬停 ≈ 原金色光晕 + 黑软影  
2. 改 glow.color / offset / blur：预览悬停立即变化  
3. 总开关关 → 无阴影；只开一层 → 单层；两层都关 → 无阴影  

- [ ] **Step 4: Commit（仅用户要求时）**

```bash
git add src/runtime/hotspot-view.tsx
git commit -m "feat: render configurable hotspot hover shadow filter"
```

---

### Task 5: 全量构建与收尾核对

**Files:**
- 无新文件；核对上文全部改动

- [ ] **Step 1: 全量 build**

Run: `npm run build`  
Expected: `✓ built`，exit 0

- [ ] **Step 2: Spec 对照清单**

- [ ] 数据模型双层 + 总开关  
- [ ] intensity = opacity 倍率  
- [ ] normalize 兼容旧 `{ enabled }`  
- [ ] schema 字段齐全  
- [ ] HotspotView 无硬编码 DEFAULT  
- [ ] 范围外项未做  

- [ ] **Step 3: Commit（仅用户要求时）**

可一次性提交本功能全部文件，或保持分 task 提交。

---

## Spec 覆盖自检

| Spec 要求 | Task |
| --- | --- |
| `HoverShadowLayer` / `HotspotHoverShadow` | 1 |
| default / normalize / buildFilter | 1 |
| serialize 接入 | 2 |
| 新建默认完整对象 | 2 |
| 属性面板双层字段 | 3 |
| HotspotView 拼装 filter | 4 |
| 旧库观感一致 / 开关矩阵 | 4 手动 + 5 |
| 范围外不做 | Global Constraints |

无 TBD / 无「类似 Task N」占位；类型名与 spec 一致。
