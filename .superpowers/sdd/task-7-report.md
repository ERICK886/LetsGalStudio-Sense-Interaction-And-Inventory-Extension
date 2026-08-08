# Task 7 Report: Extension 入口（saveSchema / settings / 空 App）

**Status:** ✅ Complete  
**Date:** 2026-08-08

## Deliverables

| File | Action | Purpose |
|------|--------|---------|
| `src/index.tsx` | Rewrite | `SceneInteractionExtension`：saveSchema / settings / render 注入 save |
| `src/app/scene-interaction-app.tsx` | Create | 占位 UI：标题「场景交互系统」+ `isEditMode` |
| `src/store/save-types.ts` | Create | `SceneInteractionSaveMap` |
| `src/welcome-ui.tsx` | Delete | Welcome 占位已无引用 |

## saveSchema

| Key | Type | Persistence | Default |
|-----|------|-------------|---------|
| `inventoryJson` | string | slot | `{"entries":[]}` |
| `progressJson` | string | slot | `{"consumed":{}}` |
| `isEditMode` | boolean | slot | `true` |
| `currentSceneId` | string | slot | `""` |

## settings

`allowEdit` / `theme` / `defaultSceneId` / `scenesLibraryJson` / `itemsLibraryJson` / `inventoryHudMode` / `inventoryHudJson` / `editorLeftWidth` / `editorRightWidth` / `designWidth` / `designHeight` — 与 brief 一致。

## Identity

- `@extension({ id: "scene-interaction", label: "场景交互" })`
- `extension.json.id` 保持 `ext-27b96b`（未改）

## Verification

```
npm run build  → success（无 TS 错误）
```

## Commit

```
feat: wire extension saveSchema and settings
```
