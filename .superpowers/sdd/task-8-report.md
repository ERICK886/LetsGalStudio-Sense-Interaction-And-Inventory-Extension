# Task 8 Report: HUD 画布自由布局

**Status:** ✅ Complete  
**Date:** 2026-08-08  
**Branch:** feat/hud-backpack-free-layout

## Deliverables

| File | Purpose |
|------|---------|
| `src/editor/ui/hud-visual-canvas.tsx` | 改写：NodeList + resolveHudLayout 舞台、拖拽/resize、SelectionOverlay |
| `src/editor/ui/ui-editor-panel.tsx` | 最小接线：`selectedHudNodeId` / `onSelectNode`（表单按节点属 Task 10） |

## Behavior

- Props：`designWidth/Height`、`hud`、`selectedNodeId`、`onSelectNode`、`onHudChange`
- 渲染 8 槽 + 打开背包按钮（`applyUiBoxStyle` / `applyUiTextStyle`）
- 点槽组选 `quickbarRoot`；点按钮选 `openBagButton`；左侧 `NodeList`
- 拖拽：`applyDrag` 更新 `quickbarRoot.rect` 或 absolute 按钮 rect；拖按钮 → `layout:"absolute"`
- resize：仅 `openBagButton` absolute 时（`applyResize`）；`quickbarRoot` 不 resize
- Esc / 点舞台空白：`onSelectNode(null)`

## Verification

```
npm run build  → ✓ success
```

## Commit

```
feat: free-layout editing on HUD visual canvas
```

## Review Fix (2026-08-08)

**Issue:** `beginDragOpenBag` converted `belowRoot` → `absolute` on `pointerDown` (click alone mutated layout).

**Fix:** `pointerDown` only selects; `pointermove` past `DRAG_ACTIVATION_THRESHOLD_PX` (4px) writes `layout:"absolute"` + rect.

```
npm run build  → ✓ success (431.72 kB, 408ms)
```

```
fix: defer belowRoot→absolute until drag threshold on HUD canvas
```
