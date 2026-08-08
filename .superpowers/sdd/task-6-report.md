# Task 6 Report: 选中 / 拖拽 / resize 纯逻辑

**Status:** ✅ Complete  
**Date:** 2026-08-08  
**Branch:** feat/hud-backpack-free-layout

## Deliverables

| File | Purpose |
|------|---------|
| `src/editor/ui/free-layout-selection.ts` | `snapEdges` / `applyDrag` / `applyResize` + `ResizeHandle` |
| `tests/editor/free-layout-selection.test.ts` | TDD 单测（13 cases） |

## API

- `snapEdges(value, targets, threshold=4)` — 阈值内吸附最近目标
- `applyDrag(origin, dx, dy, { shiftKey, snapX?, snapY? })` — Shift 锁较大轴；分别 snap x/y
- `applyResize(origin, handle, dx, dy, minSize={w:24,h:24})` — 八向 resize，对边固定 + 最小尺寸钳制

## Tests

```
npm test -- tests/editor/free-layout-selection.test.ts  → 13 passed
```

## Commit

```
feat: add free-layout drag/resize math
```
