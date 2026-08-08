# Task 13 Report: 运行时场景 + 点击 + once + 阴影 + toast

**Status:** ✅ Complete  
**Date:** 2026-08-08

## Deliverables

| File | Action | Purpose |
|------|--------|---------|
| `src/domain/progress.ts` | Create | `isHotspotVisible` / `markConsumed` |
| `src/runtime/create-action-runtime.ts` | Create | ActionRuntime → scene / inventory / toast |
| `src/runtime/scene-view.tsx` | Create | 运行时底图 + 可见 hotspot + toast 层 |
| `src/runtime/hotspot-view.tsx` | Create | hover 阴影、标签、alpha-hit 点击 |
| `src/runtime/toast-layer.tsx` | Create | toast 队列 UI，enter+hold+exit 后 advance |
| `src/runtime/runtime-shell.tsx` | Modify | 接线场景库 / 进度 / 库存 / 动作链 |
| `src/app/scene-interaction-app.tsx` | Modify | 向 RuntimeShell 注入 `save` |

## Interfaces

- `createActionRuntime`：`openScene`→`currentSceneId`；`giveItem`→库存；空 toast 回退物品名
- hotspot：`hoverShadow.enabled` 且 hover → CSS `drop-shadow`
- `once`：动作链完成后 `markConsumed`，`isHotspotVisible` 隐藏
- alpha-hit：mousedown 前采样；透明忽略；采样失败回退整框
- toast：按 motion enter+hold+exit（下限 ~1.5s）推进队列

## Verification

```
npm run build  → success
```

## Commit

```
feat: runtime scene interactions and toasts
```
