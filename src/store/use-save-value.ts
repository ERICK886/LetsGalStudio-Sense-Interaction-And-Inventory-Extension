/**
 * use-save-value.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * Studio 1.9.x 宿主中 `save.useValue` 可能尚未接通。
 * 本 Hook 用 get/set + 本地 state + save-sync / variable:changed 实现订阅语义。
 */

import { useCallback, useEffect, useState } from "react";
import type { ExtensionContext, SaveAPI } from "@avg-studio/sdk";
import { notifySaveField, subscribeSaveField } from "./save-sync";

/**
 * 订阅扩展存档字段（兼容 Studio 未实现 save.useValue 的情况）。
 *
 * @typeParam M - 存档映射类型
 * @typeParam K - 字段名
 * @param save - 扩展 SaveAPI（需已挂载）
 * @param key - 字段名
 * @param ctx - 可选；传入后额外监听 `variable:changed`
 * @returns `[value, setValue]`，与 save.useValue 同形
 *
 * @example
 * ```tsx
 * const [inventoryJson, setInventoryJson] = useSaveValue(save, "inventoryJson", ctx);
 * ```
 *
 * @throws 若 save.get/set 在挂载前被调用，行为与宿主 SaveAPI 一致（抛错）
 */
export function useSaveValue<
  M extends Record<string, unknown>,
  K extends keyof M,
>(
  save: SaveAPI<M>,
  key: K,
  ctx?: ExtensionContext,
): [M[K], (value: M[K]) => void] {
  const keyName = String(key);
  const [value, setLocal] = useState<M[K]>(() => save.get(key));

  /**
   * 从 save.get 同步本地 state（仅值变化时更新，避免无谓渲染）。
   */
  const pullFromSave = useCallback(() => {
    const latest = save.get(key);

    setLocal((prev) => {
      if (Object.is(prev, latest)) {
        return prev;
      }

      return latest;
    });
  }, [save, key]);

  /**
   * 写入存档、广播同步，并立即更新本地 state。
   *
   * @param next - 新值
   */
  const setValue = useCallback(
    (next: M[K]) => {
      save.set(key, next);
      setLocal(next);
      notifySaveField(keyName);
    },
    [save, key, keyName],
  );

  /**
   * 挂载拉取；订阅 save-sync 与可选的 variable:changed。
   */
  useEffect(() => {
    pullFromSave();

    const unsubscribeSync = subscribeSaveField((changedKey) => {
      if (changedKey === keyName) {
        pullFromSave();
      }
    });

    const unsubscribeVar =
      ctx?.subscribe?.("variable:changed", () => {
        pullFromSave();
      }) ?? undefined;

    return () => {
      unsubscribeSync();
      unsubscribeVar?.();
    };
  }, [pullFromSave, ctx, keyName]);

  return [value, setValue];
}
