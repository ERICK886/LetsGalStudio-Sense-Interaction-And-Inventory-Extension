/**
 * use-design-size.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 订阅扩展 settings 中的设计分辨率（designWidth / designHeight）。
 * 真源在 `editor`；运行时（scene-interaction / backpack）须经
 * {@link readAuthorSetting}（settings.cross）读取，勿只信本地 useValue
 * （否则回退默认 1920×1080，交互点相对底图被缩小）。
 */

import { useCallback, useEffect, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  DEFAULT_DESIGN_HEIGHT,
  DEFAULT_DESIGN_WIDTH,
  normalizeDesignSize,
  SETTINGS_DESIGN_HEIGHT,
  SETTINGS_DESIGN_WIDTH,
  type DesignSize,
} from "../domain/design-resolution";
import { readAuthorSetting, writeAuthorSetting } from "./author-settings";
import { notifySettingsField, subscribeSettingsField } from "./settings-sync";

/**
 * 从 author settings（cross 优先）解析设计尺寸。
 *
 * @param ctx - 扩展上下文
 * @param fallbackW - 本地 useValue 回退宽
 * @param fallbackH - 本地 useValue 回退高
 * @returns DesignSize
 */
function readDesignSizeFromAuthor(
  ctx: ReturnType<typeof useExtensionContext>,
  fallbackW: number | undefined,
  fallbackH: number | undefined,
): DesignSize {
  try {
    const w = readAuthorSetting(ctx, SETTINGS_DESIGN_WIDTH);
    const h = readAuthorSetting(ctx, SETTINGS_DESIGN_HEIGHT);

    return normalizeDesignSize(
      (typeof w === "number" ? w : undefined) ??
        fallbackW ??
        DEFAULT_DESIGN_WIDTH,
      (typeof h === "number" ? h : undefined) ??
        fallbackH ??
        DEFAULT_DESIGN_HEIGHT,
    );
  } catch {
    return normalizeDesignSize(
      fallbackW ?? DEFAULT_DESIGN_WIDTH,
      fallbackH ?? DEFAULT_DESIGN_HEIGHT,
    );
  }
}

/**
 * 读取并订阅设计分辨率；提供写回 settings 的方法。
 *
 * @returns `{ size, setSize }`
 *
 * @example
 * ```tsx
 * const { size, setSize } = useDesignSize();
 * setSize({ width: 2560, height: 1440 });
 * ```
 *
 * @throws 若不在 ExtensionContextProvider 内调用，抛出 SDK 注入错误
 */
export function useDesignSize(): {
  size: DesignSize;
  setSize: (next: DesignSize) => void;
} {
  const ctx = useExtensionContext();

  /** Studio 设置面板 / 持久化变更（编辑器本模块响应式；运行时可能无此字段） */
  const [settingW] = ctx.settings.useValue<number>(SETTINGS_DESIGN_WIDTH);
  const [settingH] = ctx.settings.useValue<number>(SETTINGS_DESIGN_HEIGHT);

  /**
   * 从 settings.cross(editor) / 本地读取并规范化。
   *
   * @returns DesignSize
   */
  const read = useCallback((): DesignSize => {
    return readDesignSizeFromAuthor(ctx, settingW, settingH);
  }, [ctx, settingW, settingH]);

  const [size, setLocal] = useState<DesignSize>(() =>
    readDesignSizeFromAuthor(ctx, settingW, settingH),
  );

  /**
   * 挂载与本地 useValue / ctx 变化时：一律走 cross 优先的 read()，
   * 避免 scene-interaction 上 useValue 为空时冲成默认 1920×1080。
   */
  useEffect(() => {
    setLocal(read());
  }, [read]);

  useEffect(() => {
    return subscribeSettingsField((key) => {
      if (
        key === SETTINGS_DESIGN_WIDTH ||
        key === SETTINGS_DESIGN_HEIGHT
      ) {
        setLocal(read());
      }
    });
  }, [read]);

  /**
   * 写入 settings 并广播进程内订阅。
   *
   * @param next - 新尺寸（内部会 normalize）
   */
  const setSize = useCallback(
    (next: DesignSize): void => {
      const normalized = normalizeDesignSize(next.width, next.height);

      writeAuthorSetting(ctx, SETTINGS_DESIGN_WIDTH, normalized.width);
      writeAuthorSetting(ctx, SETTINGS_DESIGN_HEIGHT, normalized.height);
      notifySettingsField(SETTINGS_DESIGN_WIDTH);
      notifySettingsField(SETTINGS_DESIGN_HEIGHT);
      setLocal(normalized);
    },
    [ctx],
  );

  return { size, setSize };
}
