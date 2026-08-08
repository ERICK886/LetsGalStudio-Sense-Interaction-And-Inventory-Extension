# Task 12 Report: 运行时 BackpackScreen 吃 v2

**Status:** ✅ Complete  
**Date:** 2026-08-08  
**Branch:** feat/hud-backpack-free-layout

## Deliverables

| File | Action | Purpose |
|------|--------|---------|
| `src/backpack/backpack-screen.tsx` | Modify | `resolveBackpackLayout` 绝对节点渲染 + letterbox scale + 入退场动画 |

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
```
