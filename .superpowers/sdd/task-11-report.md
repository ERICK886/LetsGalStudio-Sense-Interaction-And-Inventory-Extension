# Task 11 Report: 运行时 BackpackShell 吃 v2

**Status:** ✅ Complete  
**Date:** 2026-08-08  
**Branch:** feat/hud-backpack-free-layout

## Deliverables

| File | Action | Purpose |
|------|--------|---------|
| `src/backpack/backpack-shell.tsx` | Modify | `resolveHudLayout` 绝对槽位 / 打开按钮 + `applyUiBoxStyle` / `applyUiTextStyle` + `customCss` |
| `src/runtime/inventory-quickbar.tsx` | Modify | deprecated 路径同步，避免分叉 |

## Behavior

- `layout = useMemo(() => resolveHudLayout(hud), [hud])`
- 8 槽按 `layout.slots[i]` 绝对定位（含 root/direction/gap/slotSize）
- 槽样式：`applyUiBoxStyle(layout.slotStyle)`
- 角标：`applyUiBoxStyle` + `applyUiTextStyle(layout.badgeStyle)`；缺 `background` 时用 `layout.accent`
- 打开背包：绝对定位到 `layout.openBagButton`，样式来自 `openBagStyle`，文案 `label || "打开背包"`
- 注入 `<style>`：`layout.customCss`

## Verification

```
npm run build  → ✓ success
```

## Commit

```
feat: render quickbar HUD from v2 layout resolver
```
