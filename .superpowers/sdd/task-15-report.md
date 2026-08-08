# Task 15 Report: 剧本方法 + 导入导出

**Status:** ✅ Complete  
**Date:** 2026-08-08

## Deliverables

| File | Action | Purpose |
|------|--------|---------|
| `src/methods/scene-methods.ts` | Create | `openScene` / `setEditMode` / `getCurrentSceneId` / `setHotspotVisible` |
| `src/methods/inventory-methods.ts` | Create | `giveItem` / `hasItem` / `getItemCount` |
| `src/editor/io/import-export.ts` | Create | export / import / `tryImport*` + `downloadJsonFile` |
| `tests/editor/import-export.test.ts` | Create | TDD：非法 JSON / 非 v1 / 往返 |
| `src/domain/progress.ts` | Modify | `setHotspotVisibility` |
| `src/index.tsx` | Modify | 挂载 static methods |
| `src/editor/editor-shell.tsx` | Modify | 场景/物品库 JSON 下载与文件导入按钮 |

## Interfaces

- 场景 methods：读 `settings.scenesLibraryJson`，写 `save.currentSceneId` / `isEditMode` / `progressJson`；`openScene` 成功后 `ctx.ui.show`
- 库存 methods：读 `settings.itemsLibraryJson`，读写 `save.inventoryJson`
- `tryImportScenesLibrary` / `tryImportItemsLibrary`：`{ok:true,value}` | `{ok:false,error}`；仅 version 1
- `import*` 走 `parse*`，非法回退空库；编辑器顶栏按分区导出/导入

## Verification

```
npm test       → 60 passed
npm run build  → success
```

## Commit

```
feat: story methods and json import-export
```
