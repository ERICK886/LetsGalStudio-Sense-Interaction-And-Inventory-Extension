# Task 10 Report: 场景编辑器 — 列表 + 画布拖放

**Status:** ✅ Complete  
**Date:** 2026-08-08

## Deliverables

| File | Action | Purpose |
|------|--------|---------|
| `src/editor/panels/scene-list-panel.tsx` | Create | 场景列表 CRUD（新建「未命名场景」） |
| `src/editor/panels/hotspot-list-panel.tsx` | Create | 交互点列表 + 点击放置模式 |
| `src/editor/canvas/scene-canvas.tsx` | Create | 中部画布：fit 设计分辨率 + 底图/hotspot |
| `src/editor/canvas/scene-base-layer.tsx` | Create | DOM 底图 + world transform |
| `src/editor/canvas/hotspot-layer.tsx` | Create | hotspot 框 + 拖拽写归一化 x/y |
| `src/editor/ui/design-resolution-menu.tsx` | Create | 设计分辨率预设/自定义 |
| `src/shared/alpha-hit.ts` | Create | `isOpaqueAt`（ImageData 采样） |
| `src/shared/scene-layout.ts` | Create | fit / contentRect / norm↔world |
| `src/domain/design-resolution.ts` | Create | 预设与 normalizeDesignSize |
| `src/store/use-design-size.ts` | Create | 读写 settings designWidth/Height |
| `src/editor/editor-shell.tsx` | Modify | section==="scenes" 接线 + history.push |

## Interfaces

- 新建场景：`createId("scene")`，name「未命名场景」
- 新建 hotspot：放置模式点击归一化坐标；默认 `visual.src=""`
- 选中 `selectedSceneId` / `selectedHotspotId` 提升到 EditorShell
- `designWidth/Height` 经 `useDesignSize` 从 settings 读
- 场景库变更：`commitLibrary` → `history.push(next)` + `useScenesLibrary` set

## Studio 手测清单（备忘）

- [ ] 新建场景 → 左栏出现「未命名场景」
- [ ] 顶栏切换设计分辨率 → 画框比例变化
- [ ] 「新建」交互点 → 十字光标 → 画布点击落点
- [ ] 拖拽 hotspot 框 → 松手后位置保持（归一化 x/y）
- [ ] 删除场景/交互点 → 选中回落正确
- [ ] 运行预览仍可切换出编辑器

## Verification

```
npm run build  → success
```

## Commit

```
feat: scene editor list and canvas
```
