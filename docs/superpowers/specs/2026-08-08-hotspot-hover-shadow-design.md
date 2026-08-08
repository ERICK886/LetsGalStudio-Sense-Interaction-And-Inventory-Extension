/**
 * 2026-08-08-hotspot-hover-shadow-design.md
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 1.0.0
 *
 * 交互点悬停阴影可自定义（颜色、偏移、模糊、强度；双层可单独开关）。
 */

# 交互点悬停阴影自定义 — 设计规格

- **状态**: 已批准；实现计划见 `docs/superpowers/plans/2026-08-08-hotspot-hover-shadow.md`

## 背景

当前 `HotspotElement.hoverShadow` 仅有 `{ enabled: boolean }`。运行时 `HotspotView` 使用硬编码双层 CSS `filter: drop-shadow(...)`（金色光晕 + 黑色软影），作者无法调整颜色、偏移、模糊等。

目标：每个交互点可配置完整悬停阴影外观，并保持对 PNG 剪影的 `drop-shadow` 行为。

## 决策摘要

| 项 | 选择 |
| --- | --- |
| 自定义深度 | 完整外观（非仅常用四字段、非自由 CSS 字符串） |
| 层结构 | 固定双层：光晕 `glow` + 底影 `base`，每层可单独开关 |
| 总开关 | 保留 `enabled`；关闭时完全不显示；打开后由两层开关决定 |
| 实现方式 | 结构化字段 → 运行时拼装 `filter: drop-shadow(...)` |
| 强度语义 | `intensity`（0–2）乘到层 `opacity`，再 clamp 到 0–1 作为最终 alpha |
| 扩散 | CSS `drop-shadow` 无 spread；用 `blur` 表达扩散感，不引入假 spread |

## 数据模型

```ts
/** 单层 drop-shadow 参数 */
interface HoverShadowLayer {
  enabled: boolean;
  /** #RRGGBB */
  color: string;
  /** 0–1 */
  opacity: number;
  /** 设计像素，可负 */
  offsetX: number;
  offsetY: number;
  /** ≥0，设计像素 */
  blur: number;
  /**
   * 0–2；最终 alpha = clamp(opacity * intensity, 0, 1)
   * （CSS drop-shadow 无 spread，强度不映射为扩散半径）
   */
  intensity: number;
}

/** 交互点悬停阴影 */
interface HotspotHoverShadow {
  /** 总开关：false 时不施加任何 filter */
  enabled: boolean;
  glow: HoverShadowLayer;
  base: HoverShadowLayer;
}
```

`HotspotElement.hoverShadow` 类型由 `{ enabled: boolean }` 升级为 `HotspotHoverShadow`。

### 默认值（对齐现有硬编码观感）

| 字段 | glow | base |
| --- | --- | --- |
| enabled | `true` | `true` |
| color | `#FFECA0`（= `rgb(255, 236, 160)`） | `#000000` |
| opacity | `0.85` | `0.45` |
| offsetX | `0` | `0` |
| offsetY | `0` | `2` |
| blur | `10` | `6` |
| intensity | `1` | `1` |

总开关默认 `true`。

提供领域函数：

- `defaultHotspotHoverShadow(): HotspotHoverShadow`
- `defaultHoverShadowLayer(kind: "glow" | "base"): HoverShadowLayer`
- `normalizeHotspotHoverShadow(raw: unknown): HotspotHoverShadow`
- `buildHoverShadowFilter(shadow: HotspotHoverShadow): string | undefined`

## 运行时行为

文件：`src/runtime/hotspot-view.tsx`（及抽出的纯函数模块，建议 `src/domain/hover-shadow.ts`）。

显示阴影当且仅当：

1. `hoverShadow.enabled === true`
2. 当前为剪影可交互悬停（与现逻辑一致：`interactiveHover`）
3. `buildHoverShadowFilter` 返回非空字符串（至少一层 `enabled` 且能生成有效 drop-shadow）

拼装规则：

- 对 `glow`、`base` 依次检查：层 `enabled === true` 则追加  
  `drop-shadow(<offsetX>px <offsetY>px <blur>px rgba(r,g,b,a))`
- `a = clamp(opacity * intensity, 0, 1)`
- 颜色解析失败时用该层默认色
- 总开关关、或两层都关、或拼装结果为空 → `filter` 为 `undefined`（不设阴影）

不改变：alpha-hit、标签、动作链、once / visibleByDefault。

编辑器场景画布选中态不强制模拟悬停阴影；仅运行时与运行预览在真实 hover 时显示。

## 编辑器

### Schema

文件：`src/schema/hotspot-schema.ts`「视觉」分区。

在现有 `hoverShadow.enabled` 下增加两个 `section`：

1. **光晕层**（`id: hover-shadow-glow`）
2. **底影层**（`id: hover-shadow-base`）

每层字段（点分路径示例以 glow 为例）：

| key | kind | 约束 |
| --- | --- | --- |
| `hoverShadow.glow.enabled` | boolean | — |
| `hoverShadow.glow.color` | color | — |
| `hoverShadow.glow.opacity` | number | min 0, max 1, step 0.05 |
| `hoverShadow.glow.offsetX` | number | step 1 |
| `hoverShadow.glow.offsetY` | number | step 1 |
| `hoverShadow.glow.blur` | number | min 0, step 1 |
| `hoverShadow.glow.intensity` | number | min 0, max 2, step 0.05 |

总开关关闭时，层字段仍可编辑并写入对象（参数持久化；运行时不生效）。不做条件显隐，降低 FormRenderer 复杂度。

### 新建默认

- `hotspot-list-panel` / `property-panel` 创建交互点时，`hoverShadow` 使用 `defaultHotspotHoverShadow()`，不再只写 `{ enabled: true }`。

## 序列化与兼容

在 `normalizeHotspotElement` 中调用 `normalizeHotspotHoverShadow`：

- 入参缺失或非对象 → 完整默认
- 仅有 `{ enabled }` 的旧数据 → 保留 `enabled`，`glow`/`base` 填默认
- 部分层字段缺失 → 按字段回退该层默认并 clamp
- 非法颜色 → 该层默认色
- 非有限数字 → 该层对应默认

写入场景库 JSON 时保存完整结构（与现有 hotspot 序列化路径一致，无额外文件格式版本 bump；靠 normalize 兼容旧库）。

## 验收标准

1. 仅含 `{ hoverShadow: { enabled: true } }` 的旧场景库加载后，悬停观感与升级前硬编码双层一致。
2. 在属性面板修改光晕颜色 / 偏移 / 模糊后，运行预览悬停立即反映。
3. 总开关关 → 无阴影；只开一层 → 仅该层；两层都关 → 无阴影。
4. `npm run build` 通过。

## 范围外

- 全局（场景级 / 主题级）默认悬停阴影
- 编辑器画布选中态伪悬停阴影
- 自由 CSS `filter` 字符串编辑
- 可变层数（超过 glow/base）
- 将强度映射为 box-shadow spread（会破坏剪影贴合）

## 主要改动文件

| 文件 | 改动 |
| --- | --- |
| `src/domain/types.ts` | `HotspotHoverShadow` / `HoverShadowLayer` |
| `src/domain/hover-shadow.ts`（新建） | 默认值、normalize、buildFilter |
| `src/domain/serialize.ts` | hotspot 规范化接入 |
| `src/schema/hotspot-schema.ts` | 面板字段 |
| `src/editor/panels/hotspot-list-panel.tsx` | 新建默认 |
| `src/editor/panels/property-panel.tsx` | 默认补全 |
| `src/runtime/hotspot-view.tsx` | 使用 `buildHoverShadowFilter` |
