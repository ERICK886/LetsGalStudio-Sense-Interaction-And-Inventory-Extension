# Task 10 Report: UiEditorPanel 选中态表单与重置

**Status:** ✅ Complete  
**Date:** 2026-08-08  
**Branch:** feat/hud-backpack-free-layout

## Deliverables

| File | Purpose |
|------|---------|
| `src/editor/ui/ui-editor-panel.tsx` | 右侧：`selected ? nodeFields : globalFields`；重置此节点 / 全部重置为默认 |
| `src/editor/panels/property-panel.tsx` | 无场景时改用 `inventoryHudGlobalFields` + 引导至「UI」分区 |

## Behavior

- HUD：`selectedHudNodeId ? inventoryHudNodeFields : inventoryHudGlobalFields`
- 背包：`selectedBagNodeId ? backpackScreenNodeFields : backpackScreenGlobalFields`
- 「重置此节点」→ `resetInventoryHudNode` / `resetBackpackScreenNode`（背包带设计分辨率）
- 「全部重置为默认」→ `defaultInventoryHud` / `defaultBackpackScreen`，并清空选中
- 切换 sub Tab 仍清空两侧选中
- Form `onChange` 仍经 `persistHud` / `persistBag`

## Verification

```
npm run build  → ✓ success
```

## Commit

```
feat: selection-driven property forms for UI editor
```
