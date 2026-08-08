/**
 * items-persistence.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 作者端物品库持久化：settings.itemsLibraryJson + React Hook。
 * 不做「纯数组根」兼容；非法 JSON 由 domain/serialize 回退空库。
 */

import { useCallback, useEffect, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  emptyItemsLibrary,
  parseItemsLibraryJson,
  stringifyItemsLibrary,
} from "../domain/serialize";
import type { ItemsLibraryFile } from "../domain/types";
import { logError } from "../shared/logger";
import { notifySettingsField, subscribeSettingsField } from "./settings-sync";

/** 项目设置中的物品库字段名（与 index.tsx settings 声明一致） */
export const ITEMS_LIBRARY_SETTINGS_KEY = "itemsLibraryJson";

/** 空物品库默认 JSON */
export const EMPTY_ITEMS_LIBRARY_JSON = '{"version":1,"items":[]}';

/**
 * 从项目设置读取物品库 JSON 字符串。
 *
 * @param getSetting - settings.get 函数（便于测试注入）
 * @returns 物品库 JSON；异常或非字符串时回退空库 JSON
 *
 * @example
 * ```ts
 * const raw = readItemsLibraryJson((k) => ctx.settings.get(k));
 * ```
 */
export function readItemsLibraryJson(
  getSetting: (key: string) => unknown,
): string {
  try {
    const raw = getSetting(ITEMS_LIBRARY_SETTINGS_KEY);

    if (typeof raw === "string") {
      return raw;
    }

    if (raw == null) {
      return EMPTY_ITEMS_LIBRARY_JSON;
    }

    logError("items-persistence", "settings.itemsLibraryJson 非字符串，已回退空库");

    return EMPTY_ITEMS_LIBRARY_JSON;
  } catch (err) {
    logError("items-persistence", "读取 settings.itemsLibraryJson 失败", err);

    return EMPTY_ITEMS_LIBRARY_JSON;
  }
}

/**
 * 将物品库 JSON 写入项目设置，并广播进程内订阅。
 *
 * @param setSetting - settings.set 函数
 * @param json - stringifyItemsLibrary 结果
 *
 * @example
 * ```ts
 * writeItemsLibraryJson(
 *   (k, v) => ctx.settings.set(k, v),
 *   stringifyItemsLibrary(lib),
 * );
 * ```
 */
export function writeItemsLibraryJson(
  setSetting: (key: string, value: string) => void,
  json: string,
): void {
  try {
    setSetting(ITEMS_LIBRARY_SETTINGS_KEY, json);
    notifySettingsField(ITEMS_LIBRARY_SETTINGS_KEY);
  } catch (err) {
    logError("items-persistence", "写入 settings.itemsLibraryJson 失败", err);
  }
}

/**
 * 订阅并读写物品库（settings.itemsLibraryJson）。
 *
 * 最小实现：useExtensionContext + parse/stringify；UI 接线在后续任务。
 *
 * @returns `[library, setLibrary]`
 *
 * @example
 * ```tsx
 * const [library, setLibrary] = useItemsLibrary();
 * setLibrary({ version: 1, items: [...] });
 * ```
 *
 * @throws 若不在 ExtensionContextProvider 内调用，抛出 SDK 注入错误
 */
export function useItemsLibrary(): [
  ItemsLibraryFile,
  (next: ItemsLibraryFile) => void,
] {
  const ctx = useExtensionContext();

  const [library, setLocal] = useState<ItemsLibraryFile>(() => {
    try {
      return parseItemsLibraryJson(
        readItemsLibraryJson((key) => ctx.settings.get(key)),
      );
    } catch (err) {
      logError("items-persistence", "初始化物品库失败", err);

      return emptyItemsLibrary();
    }
  });

  /**
   * 从 settings 拉取并解析为本地 state。
   */
  const pullFromSettings = useCallback(() => {
    const next = parseItemsLibraryJson(
      readItemsLibraryJson((key) => ctx.settings.get(key)),
    );

    setLocal(next);
  }, [ctx]);

  /**
   * 写回 settings 并更新本地 state。
   *
   * @param next - 新物品库
   */
  const setLibrary = useCallback(
    (next: ItemsLibraryFile) => {
      const json = stringifyItemsLibrary(next);

      writeItemsLibraryJson((key, value) => {
        ctx.settings.set(key, value);
      }, json);

      setLocal(parseItemsLibraryJson(json));
    },
    [ctx],
  );

  useEffect(() => {
    pullFromSettings();

    const unsubscribe = subscribeSettingsField((key) => {
      if (key === ITEMS_LIBRARY_SETTINGS_KEY) {
        pullFromSettings();
      }
    });

    return unsubscribe;
  }, [pullFromSettings]);

  return [library, setLibrary];
}
