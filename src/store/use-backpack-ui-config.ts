/**
 * use-backpack-ui-config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.0
 *
 * React Hook：订阅快捷栏 HUD / 全屏背包布局 settings（cross + 进程内总线）。
 * 解析时传入当前设计分辨率，避免 1920 预设在较小画布上被裁切。
 */

import { useEffect, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  parseBackpackScreenJson,
  parseInventoryHudJson,
} from "../domain/serialize";
import type {
  BackpackScreenConfig,
  InventoryHudConfig,
} from "../domain/types";
import {
  BACKPACK_SCREEN_JSON_KEY,
  INVENTORY_HUD_JSON_KEY,
  readHudSetting,
} from "./hud-settings";
import { subscribeSettingsField } from "./settings-sync";
import { useDesignSize } from "./use-design-size";

/**
 * @param ctx - 扩展上下文
 * @param designW - 当前设计宽
 * @param designH - 当前设计高
 * @returns InventoryHudConfig
 */
function readHud(
  ctx: ReturnType<typeof useExtensionContext>,
  designW: number,
  designH: number,
): InventoryHudConfig {
  const raw = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);

  return parseInventoryHudJson(
    typeof raw === "string" ? raw : String(raw ?? ""),
    designW,
    designH,
  );
}

/**
 * @param ctx - 扩展上下文
 * @param designW - 当前设计宽
 * @param designH - 当前设计高
 * @returns BackpackScreenConfig（已按设计分辨率适配）
 */
function readBag(
  ctx: ReturnType<typeof useExtensionContext>,
  designW: number,
  designH: number,
): BackpackScreenConfig {
  const raw = readHudSetting(ctx, BACKPACK_SCREEN_JSON_KEY);

  return parseBackpackScreenJson(
    typeof raw === "string" ? raw : String(raw ?? ""),
    designW,
    designH,
  );
}

/**
 * 订阅 inventoryHudJson（按当前设计分辨率 normalize / adapt）。
 *
 * @returns 当前 HUD 配置
 *
 * @example
 * ```tsx
 * const hud = useInventoryHudConfig();
 * ```
 */
export function useInventoryHudConfig(): InventoryHudConfig {
  const ctx = useExtensionContext();
  const { size: designSize } = useDesignSize();
  const [hud, setHud] = useState(() =>
    readHud(ctx, designSize.width, designSize.height),
  );

  useEffect(() => {
    setHud(readHud(ctx, designSize.width, designSize.height));

    return subscribeSettingsField((key) => {
      if (key === INVENTORY_HUD_JSON_KEY) {
        setHud(readHud(ctx, designSize.width, designSize.height));
      }
    });
  }, [ctx, designSize.height, designSize.width]);

  return hud;
}

/**
 * 订阅 backpackScreenJson（按当前设计分辨率 normalize / adapt）。
 *
 * @returns 全屏背包布局配置
 *
 * @example
 * ```tsx
 * const screen = useBackpackScreenConfig();
 * ```
 */
export function useBackpackScreenConfig(): BackpackScreenConfig {
  const ctx = useExtensionContext();
  const { size: designSize } = useDesignSize();
  const [cfg, setCfg] = useState(() =>
    readBag(ctx, designSize.width, designSize.height),
  );

  useEffect(() => {
    setCfg(readBag(ctx, designSize.width, designSize.height));

    return subscribeSettingsField((key) => {
      if (key === BACKPACK_SCREEN_JSON_KEY) {
        setCfg(readBag(ctx, designSize.width, designSize.height));
      }
    });
  }, [ctx, designSize.height, designSize.width]);

  return cfg;
}
