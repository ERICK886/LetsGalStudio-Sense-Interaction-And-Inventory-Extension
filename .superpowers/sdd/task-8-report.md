# Task 8 Report: Store 持久化钩子与撤销栈

**Status:** ✅ Complete  
**Date:** 2026-08-08

## Deliverables

| File | Action | Purpose |
|------|--------|---------|
| `src/store/history.ts` | Create | `createHistory<T>(limit=50)` → push/undo/redo/canUndo/canRedo/present |
| `tests/domain/history.test.ts` | Create | TDD：undo/redo、截断 redo、limit、深拷贝 |
| `src/store/settings-sync.ts` | Create | settings 字段进程内通知总线 |
| `src/store/save-sync.ts` | Create | save 字段进程内通知（供 useSaveValue） |
| `src/store/use-save-value.ts` | Create | get/set + 本地 state 兼容 save.useValue |
| `src/store/scenes-persistence.ts` | Create | `useScenesLibrary()` + read/write helpers |
| `src/store/items-persistence.ts` | Create | `useItemsLibrary()` + read/write helpers |
| `src/store/inventory-persistence.ts` | Create | `useInventory()` / `useProgress()` |

## Interfaces

- `useScenesLibrary()` / `useItemsLibrary()`：settings JSON ↔ 领域对象（无纯数组根兼容）
- `useInventory(save)` / `useProgress(save)`：save JSON ↔ 领域对象
- `createHistory<T>(limit = 50)`：快照栈 + 深拷贝

## Verification

```
npm test       → 43 passed
npm run build  → success
npx tsc --noEmit → success
```

## Commit

```
feat: settings/save persistence and undo history
```
