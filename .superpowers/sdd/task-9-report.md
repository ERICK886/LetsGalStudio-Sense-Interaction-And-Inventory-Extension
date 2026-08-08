# Task 9 Report: 主题 + App 壳（编辑/运行、场景/物品库）

**Status:** ✅ Complete  
**Date:** 2026-08-08

## Deliverables

| File | Action | Purpose |
|------|--------|---------|
| `src/theme/tokens.ts` | Create | light/dark token；bg `#17171B`；accent `#2EC4A4` |
| `src/theme/theme-provider.tsx` | Create | ThemeProvider + useTheme + 根字体 |
| `src/editor/editor-shell.tsx` | Create | 顶栏 + 空左中右；场景/物品库 Tab；运行预览 |
| `src/runtime/runtime-shell.tsx` | Create | 运行时占位；allowEdit 时「编辑」 |
| `src/app/scene-interaction-app.tsx` | Modify | 双壳切换 + editorSection 状态 |

## Interfaces

- App 状态：`editorSection: "scenes" | "items"`
- `allowEdit === false` → 强制 RuntimeShell
- `isEditMode` 来自 save；顶栏切换 `save.set("isEditMode", …)`
- 标题：「场景交互」

## Verification

```
npm run build  → success
```

## Commit

```
feat: app shell with edit/runtime and section tabs
```
