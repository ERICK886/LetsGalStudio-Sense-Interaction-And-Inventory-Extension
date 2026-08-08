/**
 * use-design-size.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 订阅扩展 settings 中的设计分辨率（designWidth / designHeight）。
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
import { notifySettingsField, subscribeSettingsField } from "./settings-sync";

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

  /** Studio 设置面板 / 持久化变更（响应式） */
  const [settingW] = ctx.settings.useValue<number>(SETTINGS_DESIGN_WIDTH);
  const [settingH] = ctx.settings.useValue<number>(SETTINGS_DESIGN_HEIGHT);

  /**
   * 从 settings.get 读取并规范化当前设计尺寸。
   *
   * @returns DesignSize
   */
  const read = useCallback((): DesignSize => {
    try {
      const w = ctx.settings.get<number>(SETTINGS_DESIGN_WIDTH);
      const h = ctx.settings.get<number>(SETTINGS_DESIGN_HEIGHT);

      return normalizeDesignSize(
        w ?? settingW ?? DEFAULT_DESIGN_WIDTH,
        h ?? settingH ?? DEFAULT_DESIGN_HEIGHT,
      );
    } catch {
      return normalizeDesignSize(settingW, settingH);
    }
  }, [ctx, settingW, settingH]);

  const [size, setLocal] = useState<DesignSize>(() =>
    normalizeDesignSize(
      settingW ?? DEFAULT_DESIGN_WIDTH,
      settingH ?? DEFAULT_DESIGN_HEIGHT,
    ),
  );

  useEffect(() => {
    setLocal(
      normalizeDesignSize(
        settingW ?? DEFAULT_DESIGN_WIDTH,
        settingH ?? DEFAULT_DESIGN_HEIGHT,
      ),
    );
  }, [settingW, settingH]);

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

      ctx.settings.set(SETTINGS_DESIGN_WIDTH, normalized.width);
      ctx.settings.set(SETTINGS_DESIGN_HEIGHT, normalized.height);
      notifySettingsField(SETTINGS_DESIGN_WIDTH);
      notifySettingsField(SETTINGS_DESIGN_HEIGHT);
      setLocal(normalized);
    },
    [ctx],
  );

  return { size, setSize };
}
