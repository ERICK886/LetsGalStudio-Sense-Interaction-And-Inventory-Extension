/**
 * item-refs.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 扫描场景库中 giveItem 动作对物品 id 的引用（软依赖警告用）。
 */

import type { SceneAction, SceneDefinition } from "./types";

/**
 * 判断单条动作是否引用指定 itemId。
 *
 * @param action - 场景动作
 * @param itemId - 物品 id
 * @returns 是否为 giveItem 且 itemId 匹配
 */
function actionReferencesItem(action: SceneAction, itemId: string): boolean {
  return action.type === "giveItem" && action.itemId === itemId;
}

/**
 * 返回所有在 hotspot.actions 中通过 giveItem 引用了 `itemId` 的场景 id 列表。
 *
 * 同一场景内多个 hotspot 重复引用只计入一次；顺序与 `scenes` 输入顺序一致。
 *
 * @param scenes - 场景定义数组
 * @param itemId - 要查找的物品 id
 * @returns 引用该物品的场景 id 数组（可能为空）
 *
 * @example
 * ```ts
 * const ids = scenesReferencingItem(library.scenes, "item_sword");
 * // ["scene_1"] — 表示至少有一个 hotspot 的 giveItem.itemId 为 item_sword
 * ```
 */
export function scenesReferencingItem(
  scenes: readonly SceneDefinition[],
  itemId: string,
): string[] {
  const result: string[] = [];

  for (const scene of scenes) {
    let hit = false;

    for (const hotspot of scene.hotspots) {
      for (const action of hotspot.actions) {
        if (actionReferencesItem(action, itemId)) {
          hit = true;
          break;
        }
      }

      if (hit) {
        break;
      }
    }

    if (hit) {
      result.push(scene.id);
    }
  }

  return result;
}
