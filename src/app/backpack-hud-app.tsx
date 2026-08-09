/**
 * backpack-hud-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.0
 *
 * 快捷栏 HUD 程序根：异步加载 HudShell（不含全屏背包）。
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
 * BackpackHudApp props。
 */
export interface BackpackHudAppProps extends ExtensionProps {
  /**
   * 紧凑宿主；缺省 true。
   */
  compactHost?: boolean;
}

type HudShellComponent = React.ComponentType<{
  compactHost?: boolean;
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
        background: "transparent",
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

  const [Shell, setShell] = useState<HudShellComponent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInventoryPersistenceBound()) {
      return;
    }

    /**
     * 仅编辑器/独立预览回退：玩家局内应由 scene-interaction 先绑权威 slot。
     * preview:true 避免本内存壳盖掉调试器 VariableSystem。
     */
    const previewSave = createSettingsPreviewSave(ctx);

    return bindInventoryPersistence(previewSave, { preview: true });
  }, [ctx]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("../backpack/hud-shell");

        if (!cancelled) {
          setShell(() => mod.HudShell);
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
    <ThemeProvider initialMode={themeMode} rootBackground="transparent">
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
          <Shell compactHost={props.compactHost !== false} />
        )}
      </div>
    </ThemeProvider>
  );
}
