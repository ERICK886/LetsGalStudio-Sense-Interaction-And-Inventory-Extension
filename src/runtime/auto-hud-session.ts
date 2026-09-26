import type { ExtensionContext } from "@avg-studio/sdk";
import { BACKPACK_HUD_MODULE_ID } from "../shared/module-ids";
import { BACKPACK_HUD_LETTERBOX_SHOW_OPTIONS } from "../store/hud-ui-show";
import { logError } from "../shared/logger";
import { setHudUiSession } from "./suspend-overlay-for-fragment";
import { closeVisualInventoryHud } from "./visual-inventory-hud";

// 同一 UI ID 的新旧 React 挂载可能重叠；只有当前会话可设置状态或清理活跃 HUD。
let activeSession: symbol | null = null;

/** 自动 HUD 的开关生命周期，兼容同步 hide 和打开后才完成的取消请求。 */
export function startAutoHudSession(ctx: ExtensionContext, isHudWanted: () => boolean): () => void {
  const session = Symbol("auto-hud-session");
  activeSession = session;
  let cancelled = false;
  const close = async (): Promise<void> => {
    try { closeVisualInventoryHud(ctx); } catch { /* Visual 可能未打开 */ }
    try { await ctx.ui.hide(BACKPACK_HUD_MODULE_ID); } catch { /* 清理失败不影响场景卸载 */ }
  };
  void (async () => {
    try {
      await ctx.ui.show(BACKPACK_HUD_MODULE_ID, { compactHost: false }, { ...BACKPACK_HUD_LETTERBOX_SHOW_OPTIONS });
      if (!cancelled && activeSession === session) setHudUiSession(true);
      // show 可能晚于 cleanup 完成；仍处于关闭状态时再次关闭，避免 HUD 重新出现。
      // 新会话已要求显示时不关闭它的 HUD。
      else if (activeSession === null && !isHudWanted()) await close();
    } catch (failure) {
      if (!cancelled && activeSession === session) {
        activeSession = null;
        setHudUiSession(false);
        logError("scene-interaction-app", "自动显示快捷栏 HUD 失败", failure);
      }
    }
  })();
  return () => {
    cancelled = true;
    if (activeSession !== null && activeSession !== session) return;
    activeSession = null;
    setHudUiSession(false);
    void close();
  };
}
