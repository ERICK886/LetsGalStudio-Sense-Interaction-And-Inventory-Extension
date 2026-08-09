/**
 * hud-foreign-cover.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.1.0
 *
 * 当系统设置 / 存读档 / 标题等「遮挡型」界面打开时，临时隐藏快捷栏 HUD，
 * 避免扩展叠层盖住其它 UI；关闭后按会话状态恢复。
 *
 * 须安装在 scene-interaction / 预览壳等「比 HUD 更长寿」的宿主上，
 * 不能只挂在 backpack-hud 内（hide 会卸树导致无法恢复）。
 */

import {
  INTERNAL_SYSTEM_SLOT,
  type ExtensionContext,
  type InternalSystemSlot,
} from "@avg-studio/sdk";
import {
  backpackHudUiPathCandidates,
  backpackUiPathCandidates,
} from "../shared/module-ids";
import { logInfo, logWarn } from "../shared/logger";
import { BACKPACK_HUD_LETTERBOX_SHOW_OPTIONS } from "../store/hud-ui-show";
import {
  closeVisualInventoryHud,
  isVisualInventoryHudSessionOpen,
  openInventoryHudPreferVisual,
  setVisualInventoryHudSession,
} from "./visual-inventory-hud";
import { isPlayerOverlaySessionActive } from "./suspend-overlay-for-fragment";
import { BACKPACK_HUD_MODULE_ID } from "../shared/module-ids";

/** 打开时需要让路的系统槽位（不含对话工具栏 / 选项 / 消息） */
const COVERING_SYSTEM_SLOTS: readonly InternalSystemSlot[] = [
  INTERNAL_SYSTEM_SLOT.Settings,
  INTERNAL_SYSTEM_SLOT.Save,
  INTERNAL_SYSTEM_SLOT.Load,
  INTERNAL_SYSTEM_SLOT.Title,
  INTERNAL_SYSTEM_SLOT.Gallery,
  INTERNAL_SYSTEM_SLOT.History,
];

/** 常见 DefaultShell 设置界面名（Visual UI） */
const FALLBACK_VISUAL_COVER_NAMES: readonly string[] = [
  "@avg.internal.default-shell/settings-screen",
  "settings-screen",
];

type CoverListener = (covered: boolean) => void;

let installCount = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let covered = false;
/** 本次遮挡开始前 HUD（Visual 或 React）是否处于打开会话 */
let hudOpenBeforeCover = false;
let suppressInFlight = false;
let restoreInFlight = false;

const listeners = new Set<CoverListener>();
const visualUnsubs: Array<() => void> = [];

/**
 * @returns 当前是否因外部界面而隐藏 HUD
 */
export function isHudForeignCovered(): boolean {
  return covered;
}

/**
 * 订阅遮挡状态（供内嵌 HudShell / 预览叠层隐藏 DOM）。
 *
 * @param listener - 回调
 * @returns 取消订阅
 */
export function subscribeHudForeignCover(listener: CoverListener): () => void {
  listeners.add(listener);
  listener(covered);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * @param next - 新状态
 */
function setCovered(next: boolean): void {
  if (covered === next) {
    return;
  }

  covered = next;

  for (const listener of listeners) {
    try {
      listener(covered);
    } catch {
      // 忽略
    }
  }
}

/**
 * 路径是否对当前 ctx 可见。
 *
 * @param ctx - 扩展上下文
 * @param id - UI 路径
 */
function pathVisible(ctx: ExtensionContext, id: string): boolean {
  try {
    return ctx.ui.isVisible(id) === true;
  } catch {
    return false;
  }
}

/**
 * 收集可能遮挡 HUD 的 UI 路径（系统绑定 + 本包全屏背包）。
 *
 * @param ctx - 扩展上下文
 */
function collectCoverPaths(ctx: ExtensionContext): string[] {
  const paths = new Set<string>();

  for (const slot of COVERING_SYSTEM_SLOTS) {
    try {
      const binding = ctx.system?.getBinding?.(slot);

      if (typeof binding === "string" && binding.trim().length > 0) {
        paths.add(binding.trim());
      }
    } catch {
      // 旧宿主可能无 system API
    }
  }

  for (const id of backpackUiPathCandidates()) {
    paths.add(id);
  }

  return [...paths];
}

/**
 * 收集应订阅 visualUI.onOpen 的界面名。
 *
 * @param ctx - 扩展上下文
 */
function collectVisualCoverNames(ctx: ExtensionContext): string[] {
  const names = new Set<string>(FALLBACK_VISUAL_COVER_NAMES);

  for (const slot of COVERING_SYSTEM_SLOTS) {
    try {
      const binding = ctx.system?.getBinding?.(slot);

      if (typeof binding !== "string") {
        continue;
      }

      const trimmed = binding.trim();

      if (trimmed.startsWith("@") || trimmed.includes("/")) {
        names.add(trimmed);
      }
    } catch {
      // 忽略
    }
  }

  return [...names];
}

/**
 * 是否有遮挡型界面当前可见。
 *
 * @param ctx - 扩展上下文
 */
function isAnyCoverVisible(ctx: ExtensionContext): boolean {
  for (const id of collectCoverPaths(ctx)) {
    if (pathVisible(ctx, id)) {
      return true;
    }
  }

  /**
   * Visual UI 打开时未必出现在 ui.isVisible；
   * attach 非 null 视为仍打开。
   */
  try {
    for (const name of collectVisualCoverNames(ctx)) {
      if (ctx.visualUI?.attach?.(name) != null) {
        return true;
      }
    }
  } catch {
    // 忽略
  }

  return false;
}

/**
 * 快捷栏 HUD（React）是否可见。
 *
 * @param ctx - 扩展上下文
 */
function isReactHudVisible(ctx: ExtensionContext): boolean {
  for (const id of backpackHudUiPathCandidates()) {
    if (pathVisible(ctx, id)) {
      return true;
    }
  }

  return false;
}

/**
 * React 紧凑 HUD 回退打开。
 *
 * @param ctx - 扩展上下文
 */
async function showReactHudFallback(ctx: ExtensionContext): Promise<void> {
  await ctx.ui.show(
    BACKPACK_HUD_MODULE_ID,
    { compactHost: false },
    { ...BACKPACK_HUD_LETTERBOX_SHOW_OPTIONS },
  );
}

/**
 * 隐藏 Visual + React 快捷栏。
 *
 * @param ctx - 扩展上下文
 */
async function suppressHud(ctx: ExtensionContext): Promise<void> {
  if (suppressInFlight) {
    return;
  }

  suppressInFlight = true;

  try {
    closeVisualInventoryHud(ctx);
    setVisualInventoryHudSession(false);

    for (const id of backpackHudUiPathCandidates()) {
      try {
        await ctx.ui.hide(id);
      } catch {
        // 该路径可能未打开
      }
    }

    logInfo("hud-foreign-cover", "已隐藏快捷栏（让路外部界面）");
  } finally {
    suppressInFlight = false;
  }
}

/**
 * 在玩家叠层会话下恢复快捷栏。
 *
 * @param ctx - 扩展上下文
 */
async function restoreHud(ctx: ExtensionContext): Promise<void> {
  if (restoreInFlight || !hudOpenBeforeCover) {
    return;
  }

  /**
   * 仅玩家运行时自动恢复；Studio / 编辑器内嵌 HUD 由 DOM 订阅自行显示。
   */
  if (!isPlayerOverlaySessionActive()) {
    hudOpenBeforeCover = false;

    return;
  }

  restoreInFlight = true;

  try {
    await openInventoryHudPreferVisual(ctx, () => showReactHudFallback(ctx));
    logInfo("hud-foreign-cover", "已恢复快捷栏");
  } catch (err) {
    logWarn("hud-foreign-cover", "恢复快捷栏失败", err);
  } finally {
    restoreInFlight = false;
    hudOpenBeforeCover = false;
  }
}

/**
 * 根据探测结果进入 / 退出遮挡态。
 *
 * @param ctx - 扩展上下文
 * @param forceCover - Visual onOpen 时强制进入遮挡
 */
async function applyCoverState(
  ctx: ExtensionContext,
  forceCover = false,
): Promise<void> {
  const shouldCover = forceCover || isAnyCoverVisible(ctx);

  if (shouldCover && !covered) {
    hudOpenBeforeCover =
      isVisualInventoryHudSessionOpen() || isReactHudVisible(ctx);
    setCovered(true);
    await suppressHud(ctx);

    return;
  }

  if (!shouldCover && covered) {
    setCovered(false);
    await restoreHud(ctx);
  }
}

/**
 * 安装遮挡守卫（可重入；成对 uninstall）。
 *
 * @param ctx - 扩展上下文
 * @returns 卸载函数
 */
export function installHudForeignCover(ctx: ExtensionContext): () => void {
  installCount += 1;

  if (installCount === 1) {
    for (const name of collectVisualCoverNames(ctx)) {
      try {
        const off = ctx.visualUI?.onOpen?.(name, (view) => {
          void applyCoverState(ctx, true);
          view.onClose(() => {
            void applyCoverState(ctx, false);
          });
        });

        if (typeof off === "function") {
          visualUnsubs.push(off);
        }
      } catch {
        // 宿主无 visualUI
      }
    }

    pollTimer = setInterval(() => {
      void applyCoverState(ctx, false);
    }, 400);

    void applyCoverState(ctx, false);
  }

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    installCount = Math.max(0, installCount - 1);

    if (installCount > 0) {
      return;
    }

    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    for (const off of visualUnsubs.splice(0, visualUnsubs.length)) {
      try {
        off();
      } catch {
        // 忽略
      }
    }

    if (covered) {
      setCovered(false);
    }

    hudOpenBeforeCover = false;
  };
}
