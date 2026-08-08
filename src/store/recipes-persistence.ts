/**
 * recipes-persistence.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 作者端配方库持久化：settings.recipesLibraryJson + React Hook。
 * 不做「纯数组根」兼容；非法 JSON 由 domain/serialize 回退空库。
 */

import { useCallback, useEffect, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  emptyRecipesLibrary,
  parseRecipesLibraryJson,
  stringifyRecipesLibrary,
} from "../domain/serialize";
import type { RecipesLibraryFile } from "../domain/types";
import { logError } from "../shared/logger";
import { readAuthorSetting, writeAuthorSetting } from "./author-settings";
import { notifySettingsField, subscribeSettingsField } from "./settings-sync";

/** 项目设置中的配方库字段名（与 index.tsx settings 声明一致） */
export const RECIPES_LIBRARY_SETTINGS_KEY = "recipesLibraryJson";

/** 空配方库默认 JSON */
export const EMPTY_RECIPES_LIBRARY_JSON = '{"version":1,"recipes":[]}';

/**
 * 从项目设置读取配方库 JSON 字符串。
 *
 * @param getSetting - settings.get 函数（便于测试注入）
 * @returns 配方库 JSON；异常或非字符串时回退空库 JSON
 *
 * @example
 * ```ts
 * const raw = readRecipesLibraryJson((k) => ctx.settings.get(k));
 * ```
 */
export function readRecipesLibraryJson(
  getSetting: (key: string) => unknown,
): string {
  try {
    const raw = getSetting(RECIPES_LIBRARY_SETTINGS_KEY);

    if (typeof raw === "string") {
      return raw;
    }

    if (raw == null) {
      return EMPTY_RECIPES_LIBRARY_JSON;
    }

    logError(
      "recipes-persistence",
      "settings.recipesLibraryJson 非字符串，已回退空库",
    );

    return EMPTY_RECIPES_LIBRARY_JSON;
  } catch (err) {
    logError(
      "recipes-persistence",
      "读取 settings.recipesLibraryJson 失败",
      err,
    );

    return EMPTY_RECIPES_LIBRARY_JSON;
  }
}

/**
 * 将配方库 JSON 写入项目设置，并广播进程内订阅。
 *
 * @param setSetting - settings.set 函数
 * @param json - stringifyRecipesLibrary 结果
 *
 * @example
 * ```ts
 * writeRecipesLibraryJson(
 *   (k, v) => ctx.settings.set(k, v),
 *   stringifyRecipesLibrary(lib),
 * );
 * ```
 */
export function writeRecipesLibraryJson(
  setSetting: (key: string, value: string) => void,
  json: string,
): void {
  try {
    setSetting(RECIPES_LIBRARY_SETTINGS_KEY, json);
    notifySettingsField(RECIPES_LIBRARY_SETTINGS_KEY);
  } catch (err) {
    logError(
      "recipes-persistence",
      "写入 settings.recipesLibraryJson 失败",
      err,
    );
  }
}

/**
 * 订阅并读写配方库（settings.recipesLibraryJson）。
 *
 * 最小实现：useExtensionContext + parse/stringify；UI 接线在后续任务。
 *
 * @returns `[library, setLibrary]`
 *
 * @example
 * ```tsx
 * const [library, setLibrary] = useRecipesLibrary();
 * setLibrary({ version: 1, recipes: [...] });
 * ```
 *
 * @throws 若不在 ExtensionContextProvider 内调用，抛出 SDK 注入错误
 */
export function useRecipesLibrary(): [
  RecipesLibraryFile,
  (next: RecipesLibraryFile) => void,
] {
  const ctx = useExtensionContext();

  const [library, setLocal] = useState<RecipesLibraryFile>(() => {
    try {
      return parseRecipesLibraryJson(
        readRecipesLibraryJson((key) => readAuthorSetting(ctx, key)),
      );
    } catch (err) {
      logError("recipes-persistence", "初始化配方库失败", err);

      return emptyRecipesLibrary();
    }
  });

  /**
   * 从 settings 拉取并解析为本地 state。
   */
  const pullFromSettings = useCallback(() => {
    const next = parseRecipesLibraryJson(
      readRecipesLibraryJson((key) => readAuthorSetting(ctx, key)),
    );

    setLocal(next);
  }, [ctx]);

  /**
   * 写回 settings 并更新本地 state。
   *
   * @param next - 新配方库
   */
  const setLibrary = useCallback(
    (next: RecipesLibraryFile) => {
      const json = stringifyRecipesLibrary(next);

      writeRecipesLibraryJson((key, value) => {
        writeAuthorSetting(ctx, key, value);
      }, json);

      setLocal(parseRecipesLibraryJson(json));
    },
    [ctx],
  );

  useEffect(() => {
    pullFromSettings();

    const unsubscribe = subscribeSettingsField((key) => {
      if (key === RECIPES_LIBRARY_SETTINGS_KEY) {
        pullFromSettings();
      }
    });

    return unsubscribe;
  }, [pullFromSettings]);

  return [library, setLibrary];
}
