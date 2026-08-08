/**
 * scene-registry.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景库查找：按 id 或 name 在 SceneDefinition 列表中检索定义。
 */
import type { SceneDefinition } from "./types";

/**
 * 在场景列表中按 id 或 name 查找定义。
 *
 * 匹配顺序：先精确匹配 `id`，未命中再精确匹配 `name`。
 *
 * @param scenes - 场景定义数组（通常来自 ScenesLibraryFile.scenes）
 * @param idOrName - 目标场景 id 或显示名
 * @returns 匹配的 SceneDefinition；未找到时 undefined
 *
 * @example
 * const scene = findScene(library.scenes, "forest");
 * if (scene) runtime.openScene(scene.id);
 */
export function findScene(
  scenes: SceneDefinition[],
  idOrName: string,
): SceneDefinition | undefined {
  const byId = scenes.find((scene) => scene.id === idOrName);
  if (byId !== undefined) {
    return byId;
  }

  return scenes.find((scene) => scene.name === idOrName);
}
