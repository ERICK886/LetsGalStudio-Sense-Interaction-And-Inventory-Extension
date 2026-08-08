/**
 * use-backpack-ui-config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.8
 *
 * React Hook：订阅快捷栏 HUD / 全屏背包布局 settings（cross + 进程内总线）。
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

/**
 * @param ctx - 扩展上下文
 * @returns InventoryHudConfig
 */
function readHud(
  ctx: ReturnType<typeof useExtensionContext>,
): InventoryHudConfig {
  const raw = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);

  return parseInventoryHudJson(
    typeof raw === "string" ? raw : String(raw ?? ""),
  );
}

/**
 * @param ctx - 扩展上下文
 * @returns BackpackScreenConfig
 */
function readBag(
  ctx: ReturnType<typeof useExtensionContext>,
): BackpackScreenConfig {
  const raw = readHudSetting(ctx, BACKPACK_SCREEN_JSON_KEY);

  return parseBackpackScreenJson(
    typeof raw === "string" ? raw : String(raw ?? ""),
  );
}

/**
 * 订阅 inventoryHudJson。
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
  const [hud, setHud] = useState(() => readHud(ctx));

  useEffect(() => {
    setHud(readHud(ctx));

    return subscribeSettingsField((key) => {
      if (key === INVENTORY_HUD_JSON_KEY) {
        setHud(readHud(ctx));
      }
    });
  }, [ctx]);

  return hud;
}

/**
 * 订阅 backpackScreenJson。
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
  const [cfg, setCfg] = useState(() => readBag(ctx));

  useEffect(() => {
    setCfg(readBag(ctx));

    return subscribeSettingsField((key) => {
      if (key === BACKPACK_SCREEN_JSON_KEY) {
        setCfg(readBag(ctx));
      }
    });
  }, [ctx]);

  return cfg;
}
