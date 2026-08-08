# Task 9 Report: 全屏背包画布自由布局

**Status:** ✅ Complete  
**Date:** 2026-08-08  
**Branch:** feat/hud-backpack-free-layout

## Deliverables

| File | Purpose |
|------|---------|
| `src/editor/ui/backpack-visual-canvas.tsx` | 改写：NodeList + resolveBackpackLayout 绝对定位、拖拽/resize、craft offsetY、SelectionOverlay |
| `src/editor/ui/ui-editor-panel.tsx` | 接线：`selectedBagNodeId` / `onSelectNode` / `onConfigChange`（表单按节点属 Task 10） |

## Behavior

- Props：`designWidth/Height`、`config`、`selectedNodeId`、`onSelectNode`、`onConfigChange`
- 节点按 `resolveBackpackLayout` 绝对定位；左侧 `NodeList`；Esc / 点舞台空白清空选中
- `backdrop`：可选中，**忽略** drag/resize
- `panelChrome` / `titleBlock` / `closeButton` / `itemGrid` / `detailPanel`：拖拽改 `rect`；`SelectionOverlay` 可 resize
- `craftButton`：预览锚定 `detailPanel` 底边 + `offsetY`；竖直拖拽改 `offsetY`；不可 resize

## Verification

```
npm run build  → ✓ success
```

## Commit

```
feat: free-layout editing on backpack visual canvas
```
