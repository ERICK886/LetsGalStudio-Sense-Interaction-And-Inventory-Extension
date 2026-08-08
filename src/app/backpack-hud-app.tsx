/**
 * backpack-hud-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.1
 *
 * 背包 HUD 程序根组件：异步加载 BackpackShell。
 * 单独预览且尚未绑定库存真源时，挂接扩展 settings 沙箱（不写玩家 slot）。
 */

import React, { useEffect, useState } from "react";
import type { ExtensionProps } from "@avg-studio/sdk";
import { useExtensionContext } from "@avg-studio/sdk";
import { readAuthorSetting } from "../store/author-settings";
import {
  bindInventoryPersistence,
  isInventoryPersistenceBound,
} from "../store/inventory-session";
import { createSettingsPreviewSave } from "../store/preview-save";
import { ThemeProvider } from "../theme/theme-provider";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  rootTypographyStyle,
} from "../theme/theme-provider";
import type { ThemeMode } from "../theme/tokens";

/**
 * BackpackHudApp props（可由 ui.show 注入 openBackpack）。
 */
export interface BackpackHudAppProps extends ExtensionProps {
  /** true 时挂载后立即打开全屏背包 */
  openBackpack?: boolean;
}

type BackpackShellComponent = React.ComponentType<{
  openBackpack?: boolean;
}>;

/**
 * @param props.message - 文案
 * @param props.themeMode - 主题
 */
function MountPlaceholder({
  message,
  themeMode,
}: {
  message: string;
  themeMode: ThemeMode;
}): React.ReactElement {
  const bg = themeMode === "dark" ? "transparent" : "transparent";
  const muted = themeMode === "dark" ? "#8B8B95" : "#8A8582";

  return (
    <div
      data-testid="backpack-hud-mount-placeholder"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: bg,
        color: muted,
        pointerEvents: "none",
        ...rootTypographyStyle,
        fontSize: FONT_SIZE_DEFAULT,
      }}
    >
      <span style={{ fontSize: FONT_SIZE_TITLE, opacity: 0.5 }}>
        {message}
      </span>
    </div>
  );
}

/**
 * @param props - BackpackHudAppProps
 */
export function BackpackHudApp(
  props: BackpackHudAppProps,
): React.ReactElement {
  const ctx = useExtensionContext();
  const themeRaw = readAuthorSetting(ctx, "theme");
  const themeMode: ThemeMode = themeRaw === "light" ? "light" : "dark";

  const [Shell, setShell] = useState<BackpackShellComponent | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * 单独预览背包时：若场景/编辑器尚未绑定库存，则挂接 settings 沙箱。
   * 玩家局内由 scene-interaction 先绑定 slot，本处不会覆盖。
   */
  useEffect(() => {
    if (isInventoryPersistenceBound()) {
      return;
    }

    const previewSave = createSettingsPreviewSave(ctx);

    return bindInventoryPersistence(previewSave);
  }, [ctx]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("../backpack/backpack-shell");

        if (!cancelled) {
          setShell(() => mod.BackpackShell);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ThemeProvider initialMode={themeMode}>
      <div
        data-testid="backpack-hud-app-root"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          pointerEvents: "none",
          background: "transparent",
        }}
      >
        {error ? (
          <MountPlaceholder
            themeMode={themeMode}
            message={`加载失败：${error}`}
          />
        ) : !Shell ? (
          <MountPlaceholder themeMode={themeMode} message="" />
        ) : (
          <Shell openBackpack={props.openBackpack === true} />
        )}
      </div>
    </ThemeProvider>
  );
}
