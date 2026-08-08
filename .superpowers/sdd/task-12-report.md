# Task 12 Report: 运行时 BackpackScreen 吃 v2

**Status:** ✅ Complete  
**Date:** 2026-08-08  
**Branch:** feat/hud-backpack-free-layout

## Deliverables

| File | Action | Purpose |
|------|--------|---------|
| `src/backpack/backpack-screen.tsx` | Modify | `resolveBackpackLayout` 绝对节点渲染 + letterbox scale + 入退场动画 |
| `src/store/use-backpack-ui-config.ts` | Add | 订阅 `backpackScreenJson`（`useBackpackScreenConfig`） |

## Behavior

- `screenCfg = useBackpackScreenConfig()` → `layout = resolveBackpackLayout(screenCfg)`
- `buildTokens(layout)`：`accent` + 各节点 style 优先，否则中性 / accent 派生
- 绝对定位：`backdrop` inset 0；`panelChrome` / `titleBlock` / `closeButton` / `itemGrid` / `detailPanel` 用 rect
- 设计分辨率 letterbox（`fitDesignToHost` + `useDesignSize`）与编辑器舞台同源
- 动画挂在 backdrop + panelChrome；网格 `cellMin`、详情 `heroHeight`/`padding`、合成钮 `offsetY`
- 文案：`title` / `modeLink` / `closeButton` / `craftButton` 的 `label` 可覆写
- 交互保持：选中、合成、关闭、模式切换、Esc 退场

## Verification

```
npm run build  → ✓ success
```

## Commit

```
feat: render backpack screen from v2 node layout
feat: add backpack screen config hook for v2 runtime
```

## Review Fix (Important)

**Date:** 2026-08-08

### Findings addressed

1. **panelChrome 空壳动画**：`panelAnimation` 原只挂在空的 `panelChrome` 上，title/grid/detail/craft 为无动画兄弟节点。现改为挂在 `backpack-screen-panel-content` 包装层，内含 panelChrome 与全部可见内容节点（backdrop 除外）；子节点仍用舞台绝对坐标，交互不变。
2. **backdrop 淡入不可见**：宿主根与 backdrop 同用 `bgPage`，淡入被遮挡。现宿主 `background: transparent`，仅 backdrop 绘制页面色并执行淡入/淡出。

### Verification

```
npm run build  → ✓ success
```
