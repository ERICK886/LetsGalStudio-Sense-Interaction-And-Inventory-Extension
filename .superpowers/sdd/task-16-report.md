# Task 16 Report: 打磨、撤销接入、验收构建

**Status:** ✅ Complete  
**Date:** 2026-08-08

## Deliverables

| File | Action | Purpose |
|------|--------|---------|
| `src/editor/editor-shell.tsx` | Modify | Ctrl/Cmd+Z / Y / Shift+Z 按分区 undo/redo；顶栏撤销/重做按钮 |
| `src/runtime/runtime-shell.tsx` | Modify | 动作链执行中忽略重复 hotspot 点击 |
| `src/runtime/toast-layer.tsx` | Modify | toast enter→hold→exit 退场视觉 |
| `tests/domain/smoke.test.ts` | Delete | 移除仅 `1+1` 的无用冒烟测试 |

## Undo / Redo

- 场景分区：`historyRef` → `setLibrary(history.present)`
- 物品库分区：`itemsHistoryRef` → `setItemsLibrary(history.present)`
- 快捷键：`Ctrl/Cmd+Z` 撤销；`Ctrl/Cmd+Y` 与 `Ctrl/Cmd+Shift+Z` 重做
- INPUT / TEXTAREA / SELECT / contentEditable 内不拦截

## Spec self-check（代码层）

| 项 | 结果 | 证据 |
|----|------|------|
| 动作类型可扩展（联合类型） | ✅ | `src/domain/types.ts`：`SceneAction` 为 discriminated union（`none` / `openScene` / `giveItem`） |
| 无大地图 JSON 纯数组兼容 | ✅ | `serialize.ts` / `import-export.ts`：`Array.isArray(parsed)` 根直接拒绝 |
| 无 `openMap` | ✅ | `src/` 内无 `openMap` 符号（仅规格文档提及拒绝） |
| `QUICKBAR_SLOTS === 8` | ✅ | `src/domain/inventory.ts`：`export const QUICKBAR_SLOTS = 8` |

## Verification

```
npm test       → 7 files, 59 passed (smoke 已删，原 60−1)
npm run build  → success (vite，dist/index.js ~220 kB)
```

## Commit

```
chore: v0.1 polish and verify build
```

## Studio 人工验收（交给用户）

见 `task-16-brief.md` 中 Studio 清单（建场景、物品、动作链、once、背包、HUD always、JSON 往返）。
