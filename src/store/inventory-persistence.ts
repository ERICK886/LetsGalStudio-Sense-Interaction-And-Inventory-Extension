/**
 * inventory-persistence.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 玩家库存 / 场景进度存档 Hook：inventoryJson / progressJson。
 * 经 useSaveValue 读写 save，再 parse/stringify 为领域对象。
 */

import { useCallback, useMemo } from "react";
import type { ExtensionContext, SaveAPI } from "@avg-studio/sdk";
import {
  parseInventoryJson,
  parseProgressJson,
  stringifyInventory,
  stringifyProgress,
} from "../domain/serialize";
import type { InventoryState, SceneProgress } from "../domain/types";
import type { SceneInteractionSaveMap } from "./save-types";
import { useSaveValue } from "./use-save-value";

/**
 * 订阅并读写玩家库存（save.inventoryJson）。
 *
 * @param save - 扩展存档 API
 * @param ctx - 可选；传入后 useSaveValue 额外监听 variable:changed
 * @returns `[inventory, setInventory]`
 *
 * @example
 * ```tsx
 * const [inventory, setInventory] = useInventory(save, ctx);
 * setInventory({ entries: [...] });
 * ```
 *
 * @throws 若 save 尚未挂载，行为与宿主 SaveAPI 一致（抛错）
 */
export function useInventory(
  save: SaveAPI<SceneInteractionSaveMap>,
  ctx?: ExtensionContext,
): [InventoryState, (next: InventoryState) => void] {
  const [json, setJson] = useSaveValue(save, "inventoryJson", ctx);

  const inventory = useMemo(() => parseInventoryJson(json), [json]);

  /**
   * 序列化并写回存档。
   *
   * @param next - 新库存状态
   */
  const setInventory = useCallback(
    (next: InventoryState) => {
      setJson(stringifyInventory(next));
    },
    [setJson],
  );

  return [inventory, setInventory];
}

/**
 * 订阅并读写场景进度（save.progressJson）。
 *
 * @param save - 扩展存档 API
 * @param ctx - 可选；传入后 useSaveValue 额外监听 variable:changed
 * @returns `[progress, setProgress]`
 *
 * @example
 * ```tsx
 * const [progress, setProgress] = useProgress(save, ctx);
 * setProgress({ consumed: { "hotspot-1": true } });
 * ```
 *
 * @throws 若 save 尚未挂载，行为与宿主 SaveAPI 一致（抛错）
 */
export function useProgress(
  save: SaveAPI<SceneInteractionSaveMap>,
  ctx?: ExtensionContext,
): [SceneProgress, (next: SceneProgress) => void] {
  const [json, setJson] = useSaveValue(save, "progressJson", ctx);

  const progress = useMemo(() => parseProgressJson(json), [json]);

  /**
   * 序列化并写回存档。
   *
   * @param next - 新进度
   */
  const setProgress = useCallback(
    (next: SceneProgress) => {
      setJson(stringifyProgress(next));
    },
    [setJson],
  );

  return [progress, setProgress];
}
