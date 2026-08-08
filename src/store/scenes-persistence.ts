/**
 * scenes-persistence.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 作者端场景库持久化：settings.scenesLibraryJson + React Hook。
 * 不做「纯数组根」兼容；非法 JSON 由 domain/serialize 回退空库。
 */

import { useCallback, useEffect, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  emptyScenesLibrary,
  parseScenesLibraryJson,
  stringifyScenesLibrary,
} from "../domain/serialize";
import type { ScenesLibraryFile } from "../domain/types";
import { logError } from "../shared/logger";
import { notifySettingsField, subscribeSettingsField } from "./settings-sync";

/** 项目设置中的场景库字段名（与 index.tsx settings 声明一致） */
export const SCENES_LIBRARY_SETTINGS_KEY = "scenesLibraryJson";

/** 空场景库默认 JSON */
export const EMPTY_SCENES_LIBRARY_JSON = '{"version":1,"scenes":[]}';

/**
 * 从项目设置读取场景库 JSON 字符串。
 *
 * @param getSetting - settings.get 函数（便于测试注入）
 * @returns 场景库 JSON；异常或非字符串时回退空库 JSON
 *
 * @example
 * ```ts
 * const raw = readScenesLibraryJson((k) => ctx.settings.get(k));
 * ```
 */
export function readScenesLibraryJson(
  getSetting: (key: string) => unknown,
): string {
  try {
    const raw = getSetting(SCENES_LIBRARY_SETTINGS_KEY);

    if (typeof raw === "string") {
      return raw;
    }

    if (raw == null) {
      return EMPTY_SCENES_LIBRARY_JSON;
    }

    logError("scenes-persistence", "settings.scenesLibraryJson 非字符串，已回退空库");

    return EMPTY_SCENES_LIBRARY_JSON;
  } catch (err) {
    logError("scenes-persistence", "读取 settings.scenesLibraryJson 失败", err);

    return EMPTY_SCENES_LIBRARY_JSON;
  }
}

/**
 * 将场景库 JSON 写入项目设置，并广播进程内订阅。
 *
 * @param setSetting - settings.set 函数
 * @param json - stringifyScenesLibrary 结果
 *
 * @example
 * ```ts
 * writeScenesLibraryJson(
 *   (k, v) => ctx.settings.set(k, v),
 *   stringifyScenesLibrary(lib),
 * );
 * ```
 */
export function writeScenesLibraryJson(
  setSetting: (key: string, value: string) => void,
  json: string,
): void {
  try {
    setSetting(SCENES_LIBRARY_SETTINGS_KEY, json);
    notifySettingsField(SCENES_LIBRARY_SETTINGS_KEY);
  } catch (err) {
    logError("scenes-persistence", "写入 settings.scenesLibraryJson 失败", err);
  }
}

/**
 * 订阅并读写场景库（settings.scenesLibraryJson）。
 *
 * 最小实现：useExtensionContext + parse/stringify；UI 接线在后续任务。
 *
 * @returns `[library, setLibrary]`
 *
 * @example
 * ```tsx
 * const [library, setLibrary] = useScenesLibrary();
 * setLibrary({ version: 1, scenes: [...] });
 * ```
 *
 * @throws 若不在 ExtensionContextProvider 内调用，抛出 SDK 注入错误
 */
export function useScenesLibrary(): [
  ScenesLibraryFile,
  (next: ScenesLibraryFile) => void,
] {
  const ctx = useExtensionContext();

  const [library, setLocal] = useState<ScenesLibraryFile>(() => {
    try {
      return parseScenesLibraryJson(
        readScenesLibraryJson((key) => ctx.settings.get(key)),
      );
    } catch (err) {
      logError("scenes-persistence", "初始化场景库失败", err);

      return emptyScenesLibrary();
    }
  });

  /**
   * 从 settings 拉取并解析为本地 state。
   */
  const pullFromSettings = useCallback(() => {
    const next = parseScenesLibraryJson(
      readScenesLibraryJson((key) => ctx.settings.get(key)),
    );

    setLocal(next);
  }, [ctx]);

  /**
   * 写回 settings 并更新本地 state。
   *
   * @param next - 新场景库
   */
  const setLibrary = useCallback(
    (next: ScenesLibraryFile) => {
      const json = stringifyScenesLibrary(next);

      writeScenesLibraryJson((key, value) => {
        ctx.settings.set(key, value);
      }, json);

      setLocal(parseScenesLibraryJson(json));
    },
    [ctx],
  );

  useEffect(() => {
    pullFromSettings();

    const unsubscribe = subscribeSettingsField((key) => {
      if (key === SCENES_LIBRARY_SETTINGS_KEY) {
        pullFromSettings();
      }
    });

    return unsubscribe;
  }, [pullFromSettings]);

  return [library, setLibrary];
}
