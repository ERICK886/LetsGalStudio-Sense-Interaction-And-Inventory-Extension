# Task 14 Report: 快捷栏 + 背包 + 大图 + HUD 模式

**Status:** ✅ Complete  
**Date:** 2026-08-08

## Deliverables

| File | Action | Purpose |
|------|--------|---------|
| `src/runtime/inventory-quickbar.tsx` | Create | 8 槽快捷栏 + `InventoryHudLayer` |
| `src/runtime/inventory-backpack.tsx` | Create | 全量 recent-first 背包网格 |
| `src/runtime/item-detail-modal.tsx` | Create | detailImage + 名称 + 描述 |
| `src/schema/inventory-hud-schema.ts` | Create | `inventoryHudFields()` 编辑 schema |
| `src/runtime/runtime-shell.tsx` | Modify | `withScene` 时挂载 HUD |
| `src/app/scene-interaction-app.tsx` | Modify | `always` 运行态 App 层挂载 HUD |
| `src/editor/panels/property-panel.tsx` | Modify | 无场景时编辑 `inventoryHudJson` |

## Interfaces

- Quickbar：`getQuickbarEntries` + `InventoryHudConfig` 定位；点击槽 → `ItemDetailModal`
- 打开背包 → `InventoryBackpack`（`sortEntriesRecentFirst`）
- `withScene`：仅 RuntimeShell 内显示
- `always`：App 运行态挂载（编辑中隐藏）；与 withScene 互斥避免双份

## Verification

```
npm run build  → success
```

## Commit

```
feat: quickbar backpack and item detail
```
