/**
 * scene-interaction-app.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 场景交互系统 App 壳：先快速挂载轻量占位，再异步加载 Editor / Runtime / Player 壳，
 * 避免 Studio 预览因重模块同步求值导致「限定时间内没有完成挂载」。
 *
 * `playerSession === "modal"` 时分流至 PlayerShell（玩家阻塞会话）。
 * `inventoryHudMode === "always"` 时在运行态于 App 层挂载快捷栏（编辑中隐藏）。
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
import { logError } from "../shared/logger";
import type { SceneInteractionSaveMap } from "../store/save-types";
import { useSaveValue } from "../store/use-save-value";
import { ThemeProvider } from "../theme/theme-provider";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  rootTypographyStyle,
} from "../theme/theme-provider";
import type { ThemeMode } from "../theme/tokens";

/**
 * 编辑器顶部分区（与 editor-shell 保持一致；本文件避免静态 import 编辑器模块）。
 */
type EditorSection = "scenes" | "items" | "recipes";

/**
 * SceneInteractionApp 对外 props。
 *
 * `save` 由 Extension.render() 通过 props 注入；组件引用必须稳定，
 * 勿在 render 内新建匿名组件，否则 Studio 预览会反复 remount。
 *
 * `playerPresentation` / `playerSession` 由 `ctx.ui.show` 第三参合并进组件 props
 *（勿改 index.tsx render；方法层注入即可）。
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
   * 玩家阻塞会话：`"modal"` 时渲染 PlayerShell，不走 Editor / Runtime 预览壳。
   */
  playerSession?: "modal";
}

/**
 * 解析「允许编辑」设置。
 *
 * Studio 预览里 `settings.useValue` 偶发返回 `undefined`（尚未合并 default），
 * 若用 `=== true` 会误判为禁止编辑。schema 默认值为 `true`，故仅在显式 false 时关闭。
 *
 * @param raw - settings.useValue / get 读到的原始值
 * @returns 是否允许进入编辑器
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

/**
 * 解析存档中的编辑模式：未就绪 / undefined 时按默认 true（与 saveSchema 一致）。
 *
 * @param raw - useSaveValue("isEditMode") / save.get 原始值
 * @returns 是否处于编辑模式
 */
function resolveIsEditMode(raw: unknown): boolean {
  return raw !== false && raw !== "false" && raw !== 0;
}

/** 异步加载后的编辑壳 props。 */
type EditorShellComponent = React.ComponentType<{
  editorSection: EditorSection;
  onEditorSectionChange: (section: EditorSection) => void;
  onSetEditMode: (enabled: boolean) => void;
}>;

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
 *
 * @example
 * ```tsx
 * <MountPlaceholder themeMode="dark" message="正在加载场景交互界面…" />
 * ```
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
 * 应用主内容：订阅 settings / save，异步加载并切换 Editor / Runtime / Player。
 *
 * @param props.save - 扩展注入的存档 API
 * @param props.playerSession - `"modal"` 时强制 PlayerShell
 * @param props.playerPresentation - 玩家呈现标记（分流以 playerSession 为准）
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

  /** 阻塞会话：true 时忽略 isEditMode，只挂 PlayerShell */
  const isPlayerModal = playerSession === "modal";

  const [allowEditRaw] = ctx.settings.useValue("allowEdit");
  const [themeSetting] = ctx.settings.useValue("theme");
  const [hudModeRaw] = ctx.settings.useValue("inventoryHudMode");

  /**
   * Studio 1.9.x 宿主中 `save.useValue` 尚未接通（调用即抛错）。
   * 必须用兼容 Hook：get/set + 本地 state + save-sync。
   */
  const [isEditModeRaw, setIsEditModeSave] = useSaveValue(
    save,
    "isEditMode",
    ctx,
  );

  /**
   * 编辑器顶部分区（App 本地状态；非 save / settings）。
   * `"scenes"` = 场景编辑；`"items"` = 物品库；`"recipes"` = 配方。
   */
  const [editorSection, setEditorSection] =
    useState<EditorSection>("scenes");

  /**
   * useValue 未就绪时回退 settings.get（含 schema default），再按「非 false 即允许」。
   */
  const allowEdit = resolveAllowEdit(
    allowEditRaw !== undefined ? allowEditRaw : ctx.settings.get("allowEdit"),
  );

  const themeMode: ThemeMode = themeSetting === "light" ? "light" : "dark";

  const inventoryHudMode = resolveInventoryHudMode(
    hudModeRaw !== undefined
      ? hudModeRaw
      : ctx.settings.get("inventoryHudMode"),
  );

  /**
   * allowEdit === false 时强制运行壳；否则跟随 save.isEditMode
   *（undefined 视为 true，与 saveSchema 默认一致，避免首帧误进 Runtime）。
   * 玩家 modal 会话不进入编辑壳。
   */
  const isEditMode = resolveIsEditMode(isEditModeRaw);
  const isEditing = !isPlayerModal && allowEdit && isEditMode;

  /**
   * always：运行态 / 玩家态在 App 层挂载 HUD（编辑中隐藏；与壳内 withScene 互斥）。
   */
  const showAlwaysHud =
    !isEditing && inventoryHudMode === "always";

  /**
   * 顶栏切换编辑/运行：经 useSaveValue 写入，保证本地 state 与 save-sync 同步。
   *
   * @param enabled - true 进入编辑；false 运行预览
   */
  const setEditMode = useCallback(
    (enabled: boolean) => {
      setIsEditModeSave(enabled);
    },
    [setIsEditModeSave],
  );

  /**
   * 玩家壳退出：隐藏程序 UI 并解除 session wait，使 openSceneInteraction 解除阻塞。
   *
   * hide 失败仅记日志，仍调用 endPlayerSessionWait，避免剧本永久挂起。
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

  /** 异步加载的编辑壳；null 表示未就绪 */
  const [EditorShellComp, setEditorShellComp] =
    useState<EditorShellComponent | null>(null);

  /** 异步加载的运行壳 */
  const [RuntimeShellComp, setRuntimeShellComp] =
    useState<RuntimeShellComponent | null>(null);

  /** 异步加载的玩家壳 */
  const [PlayerShellComp, setPlayerShellComp] =
    useState<PlayerShellComponent | null>(null);

  /** 异步加载的常驻 HUD */
  const [HudLayerComp, setHudLayerComp] =
    useState<InventoryHudLayerComponent | null>(null);

  /** 加载失败信息 */
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * 按模式动态 import 对应壳（勿在文件顶层静态 import Editor/Runtime/Player，
   * 否则会在首屏同步拉起整个画布 / Schema 模块图，拖垮 Studio 挂载时限）。
   */
  useEffect(() => {
    let cancelled = false;

    setLoadError(null);

    if (isPlayerModal) {
      setPlayerShellComp(null);
      setHudLayerComp(null);
    } else if (isEditing) {
      setEditorShellComp(null);
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
        } else if (isEditing) {
          const mod = await import("../editor/editor-shell");

          if (cancelled) {
            return;
          }

          setEditorShellComp(() => mod.EditorShell);
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

        console.error("[scene-interaction] 加载界面壳失败", err);
        setLoadError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPlayerModal, isEditing, inventoryHudMode]);

  const shellReady = isPlayerModal
    ? PlayerShellComp != null
    : isEditing
      ? EditorShellComp != null
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
        ) : isEditing && EditorShellComp ? (
          <EditorShellComp
            editorSection={editorSection}
            onEditorSectionChange={setEditorSection}
            onSetEditMode={setEditMode}
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
 * 场景交互系统根组件（稳定导出，供 Extension.render 直接引用）。
 *
 * @param props - 含注入的 `save` API；可选 `playerSession` / `playerPresentation`
 * @returns 全屏主题壳 + 占位 / Editor / Runtime / Player
 *
 * @example
 * ```tsx
 * // 由 Extension.render() 返回：
 * // { component: SceneInteractionApp, props: { save: this.save } }
 * //
 * // 玩家阻塞会话（ui.show 合并 props）：
 * // { playerPresentation: true, playerSession: "modal" }
 * ```
 *
 * @remarks
 * - 首屏只挂载轻量占位，Editor/Runtime/Player 通过动态 import 延迟加载
 * - `playerSession === "modal"` → PlayerShell（优先于编辑/预览）
 * - `allowEdit === false` → 强制 RuntimeShell（非 modal 时）
 * - `isEditMode` 来自 save，顶栏切换写入 save
 * - `inventoryHudMode=always` → 运行/玩家态 App 层挂载快捷栏（编辑中隐藏）
 * - 退出 PlayerShell：`ctx.ui.hide` + `endPlayerSessionWait()`
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
