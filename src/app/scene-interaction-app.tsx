/**
 * scene-interaction-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 运行时程序 App 壳：异步加载 RuntimeShell / PlayerShell。
 * 编辑器已独立为 `editor` 程序，本 App 不再分流 EditorShell。
 *
 * `playerSession === "modal"` 时分流至 PlayerShell。
 * `inventoryHudMode === "always"` 时在 App 层挂载快捷栏。
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  useExtensionContext,
  type ExtensionProps,
  type SaveAPI,
} from "@avg-studio/sdk";
import type { InventoryHudMode } from "../domain/types";
import { SCENE_INTERACTION_UI_ID } from "../methods/scene-methods";
import { endPlayerSessionWait } from "../runtime/player-session";
import {
  EDITOR_MODULE_ID,
  SCENE_INTERACTION_MODULE_ID,
} from "../shared/module-ids";
import { logError } from "../shared/logger";
import { readAuthorSetting } from "../store/author-settings";
import type { SceneInteractionSaveMap } from "../store/save-types";
import { ThemeProvider } from "../theme/theme-provider";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  rootTypographyStyle,
} from "../theme/theme-provider";
import type { ThemeMode } from "../theme/tokens";

/**
 * SceneInteractionApp 对外 props。
 *
 * `save` 由 Extension.render() 通过 props 注入；组件引用必须稳定。
 *
 * `playerPresentation` / `playerSession` 由 `ctx.ui.show` 第三参合并进组件 props。
 */
export interface SceneInteractionAppProps extends ExtensionProps {
  /**
   * 强类型存档读写 API（来自扩展实例 `this.save`）。
   */
  save: SaveAPI<SceneInteractionSaveMap>;

  /**
   * 玩家呈现标记（预览 openScene / 玩家会话均可为 true）。
   * 仅 `playerSession === "modal"` 时走 PlayerShell。
   */
  playerPresentation?: boolean;

  /**
   * 玩家阻塞会话：`"modal"` 时渲染 PlayerShell，不走 Runtime 预览壳。
   */
  playerSession?: "modal";
}

/**
 * 解析「允许编辑」设置（声明在 editor 模块）。
 *
 * @param raw - settings / cross 读到的原始值
 * @returns 是否允许打开编辑器
 */
function resolveAllowEdit(raw: unknown): boolean {
  return raw !== false && raw !== "false" && raw !== 0;
}

/**
 * 解析物品栏 HUD 模式。
 *
 * @param raw - settings 原始值
 * @returns `"withScene"` | `"always"`
 */
function resolveInventoryHudMode(raw: unknown): InventoryHudMode {
  return raw === "always" ? "always" : "withScene";
}

/** 异步加载后的运行壳 props。 */
type RuntimeShellComponent = React.ComponentType<{
  save: SaveAPI<SceneInteractionSaveMap>;
  allowEdit: boolean;
  onSetEditMode: (enabled: boolean) => void;
  inventoryHudMode: InventoryHudMode;
}>;

/** 异步加载后的玩家壳 props。 */
type PlayerShellComponent = React.ComponentType<{
  save: SaveAPI<SceneInteractionSaveMap>;
  onRequestClose: () => void | Promise<void>;
  inventoryHudMode?: InventoryHudMode;
}>;

/** 异步加载后的常驻 HUD 层。 */
type InventoryHudLayerComponent = React.ComponentType<{
  save: SaveAPI<SceneInteractionSaveMap>;
}>;

/**
 * 全屏轻量占位：保证 Studio 预览能在超时前完成挂载。
 *
 * @param props.message - 提示文案
 * @param props.themeMode - 当前主题
 * @returns 占位 React 元素
 */
function MountPlaceholder({
  message,
  themeMode,
}: {
  message: string;
  themeMode: ThemeMode;
}): React.ReactElement {
  const bg = themeMode === "dark" ? "#17171B" : "#F7F5F4";
  const fg = themeMode === "dark" ? "#EDEDEF" : "#1C1A19";
  const muted = themeMode === "dark" ? "#8B8B95" : "#8A8582";

  return (
    <div
      data-testid="scene-interaction-mount-placeholder"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 12,
        background: bg,
        color: fg,
        ...rootTypographyStyle,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "3px solid #2EC4A4",
          borderTopColor: "transparent",
          animation: "si-spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes si-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: FONT_SIZE_TITLE + 2, fontWeight: 600 }}>
        场景交互
      </div>
      <div style={{ fontSize: FONT_SIZE_DEFAULT, color: muted }}>{message}</div>
    </div>
  );
}

/**
 * 应用主内容：订阅 settings / save，异步加载 Runtime / Player。
 *
 * @param props.save - 扩展注入的存档 API
 * @param props.playerSession - `"modal"` 时强制 PlayerShell
 * @returns 主题包裹的壳 UI（或占位 / 错误）
 */
function SceneInteractionAppContent({
  save,
  playerSession,
}: {
  save: SaveAPI<SceneInteractionSaveMap>;
  playerPresentation?: boolean;
  playerSession?: "modal";
}): React.ReactElement {
  const ctx = useExtensionContext();

  /** 阻塞会话：true 时只挂 PlayerShell */
  const isPlayerModal = playerSession === "modal";

  /** theme / allowEdit 声明在 editor；本模块用 cross 读取 */
  const themeRaw = readAuthorSetting(ctx, "theme");
  const allowEditRaw = readAuthorSetting(ctx, "allowEdit");

  const [hudModeRaw] = ctx.settings.useValue("inventoryHudMode");

  const allowEdit = resolveAllowEdit(
    allowEditRaw !== undefined
      ? allowEditRaw
      : true,
  );

  const themeMode: ThemeMode = themeRaw === "light" ? "light" : "dark";

  const inventoryHudMode = resolveInventoryHudMode(
    hudModeRaw !== undefined
      ? hudModeRaw
      : ctx.settings.get("inventoryHudMode"),
  );

  /**
   * always：在 App 层挂载 HUD（与壳内 withScene 互斥）。
   */
  const showAlwaysHud = inventoryHudMode === "always";

  /**
   * 打开独立编辑器程序（hide 本 UI 可选；编辑器叠在上层亦可）。
   *
   * @param enabled - true 显示 editor；false 仅隐藏 editor（预览已在本程序）
   */
  const setEditMode = useCallback(
    (enabled: boolean) => {
      void (async () => {
        try {
          if (enabled) {
            await ctx.ui.show(
              EDITOR_MODULE_ID,
              {},
              {
                size: "(100%, 100%)",
                position: "(0, 0)",
                interactable: true,
              },
            );
          } else {
            await ctx.ui.hide(EDITOR_MODULE_ID);
          }
        } catch (err) {
          logError(
            "scene-interaction-app",
            "setEditMode: 显示/隐藏编辑器失败",
            err,
          );
        }
      })();
    },
    [ctx],
  );

  /**
   * 玩家壳退出：隐藏程序 UI 并解除 session wait。
   *
   * @returns Promise<void>
   */
  const handlePlayerRequestClose = useCallback(async (): Promise<void> => {
    try {
      await ctx.ui.hide(SCENE_INTERACTION_UI_ID);
    } catch (err) {
      logError(
        "scene-interaction-app",
        "onRequestClose: ctx.ui.hide 失败",
        err,
      );
    }

    endPlayerSessionWait();
  }, [ctx]);

  const [RuntimeShellComp, setRuntimeShellComp] =
    useState<RuntimeShellComponent | null>(null);

  const [PlayerShellComp, setPlayerShellComp] =
    useState<PlayerShellComponent | null>(null);

  const [HudLayerComp, setHudLayerComp] =
    useState<InventoryHudLayerComponent | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoadError(null);

    if (isPlayerModal) {
      setPlayerShellComp(null);
      setHudLayerComp(null);
    } else {
      setRuntimeShellComp(null);
      setHudLayerComp(null);
    }

    (async () => {
      try {
        if (isPlayerModal) {
          const playerMod = await import("../runtime/player-shell");

          if (cancelled) {
            return;
          }

          setPlayerShellComp(() => playerMod.PlayerShell);

          if (inventoryHudMode === "always") {
            const hudMod = await import("../runtime/inventory-quickbar");

            if (cancelled) {
              return;
            }

            setHudLayerComp(() => hudMod.InventoryHudLayer);
          }
        } else {
          const runtimeMod = await import("../runtime/runtime-shell");

          if (cancelled) {
            return;
          }

          setRuntimeShellComp(() => runtimeMod.RuntimeShell);

          if (inventoryHudMode === "always") {
            const hudMod = await import("../runtime/inventory-quickbar");

            if (cancelled) {
              return;
            }

            setHudLayerComp(() => hudMod.InventoryHudLayer);
          }
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        const message = err instanceof Error ? err.message : String(err);

        console.error(
          `[${SCENE_INTERACTION_MODULE_ID}] 加载界面壳失败`,
          err,
        );
        setLoadError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPlayerModal, inventoryHudMode]);

  const shellReady = isPlayerModal
    ? PlayerShellComp != null
    : RuntimeShellComp != null;

  return (
    <ThemeProvider initialMode={themeMode}>
      <div
        data-testid="scene-interaction-app-root"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          minHeight: 0,
        }}
      >
        {loadError ? (
          <MountPlaceholder
            themeMode={themeMode}
            message={`加载失败：${loadError}`}
          />
        ) : !shellReady ? (
          <MountPlaceholder
            themeMode={themeMode}
            message="正在加载场景交互界面…"
          />
        ) : isPlayerModal && PlayerShellComp ? (
          <PlayerShellComp
            save={save}
            onRequestClose={handlePlayerRequestClose}
            inventoryHudMode={inventoryHudMode}
          />
        ) : RuntimeShellComp ? (
          <RuntimeShellComp
            save={save}
            allowEdit={allowEdit}
            onSetEditMode={setEditMode}
            inventoryHudMode={inventoryHudMode}
          />
        ) : null}

        {showAlwaysHud && HudLayerComp ? (
          <div
            data-testid="inventory-hud-always-layer"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 50,
              pointerEvents: "none",
            }}
          >
            <HudLayerComp save={save} />
          </div>
        ) : null}
      </div>
    </ThemeProvider>
  );
}

/**
 * 场景交互运行时根组件（稳定导出，供 Extension.render 直接引用）。
 *
 * @param props - 含注入的 `save` API；可选 `playerSession` / `playerPresentation`
 * @returns 全屏主题壳 + 占位 / Runtime / Player
 *
 * @remarks
 * - 编辑器由独立程序 `editor` 提供，勿在本 App 内再挂 EditorShell
 * - `playerSession === "modal"` → PlayerShell
 * - `inventoryHudMode=always` → App 层挂载快捷栏
 */
export function SceneInteractionApp(
  props: SceneInteractionAppProps,
): React.ReactElement {
  const { save, playerPresentation, playerSession } = props;

  if (!save) {
    return (
      <MountPlaceholder
        themeMode="dark"
        message="存档 API 未注入（save 缺失）"
      />
    );
  }

  return (
    <SceneInteractionAppContent
      save={save}
      playerPresentation={playerPresentation}
      playerSession={playerSession}
    />
  );
}
