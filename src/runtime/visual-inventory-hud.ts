/**
 * visual-inventory-hud.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 玩家快捷栏：宿主可视化界面（`ui/inventory-hud.json`）+
 * `pointerEventsPassthrough`，空白区穿透到对话框 / 场景下层。
 *
 * 引用名约定（须与 JSON 中 refId 一致）：
 * - `slot-0` … `slot-7`：槽位按钮
 * - `slot-icon-0` … `slot-icon-7`：图标
 * - `slot-count-0` … `slot-count-7`：数量角标
 * - `open-backpack`：打开全屏背包
 *
 * @example
 * ```ts
 * // onRegister
 * registerVisualInventoryHud(ctx);
 *
 * // 玩家运行时
 * await openVisualInventoryHud(ctx);
 * ```
 */

import type {
  ExtensionContext,
  VisualUIViewHandle,
} from "@avg-studio/sdk";
import {
  getQuickbarEntries,
  QUICKBAR_SLOTS,
} from "../domain/inventory";
import { findItem } from "../domain/item-registry";
import {
  parseItemsLibraryJson,
  parseInventoryHudJson,
} from "../domain/serialize";
import { resolveHudLayout } from "../domain/hud-layout";
import type { InventoryEntry, ItemDefinition } from "../domain/types";
import {
  BACKPACK_MODULE_ID,
  EXTENSION_PACKAGE_ID,
} from "../shared/module-ids";
import { logError, logInfo, logWarn } from "../shared/logger";
import {
  DEFAULT_DESIGN_HEIGHT,
  DEFAULT_DESIGN_WIDTH,
  normalizeDesignSize,
  SETTINGS_DESIGN_HEIGHT,
  SETTINGS_DESIGN_WIDTH,
} from "../domain/design-resolution";
import { readAuthorSetting } from "../store/author-settings";
import { ITEMS_LIBRARY_SETTINGS_KEY } from "../store/items-persistence";
import {
  getInventorySession,
  subscribeInventorySession,
} from "../store/inventory-session";
import {
  INVENTORY_HUD_JSON_KEY,
  readHudSetting,
} from "../store/hud-settings";
import { BACKPACK_HUD_FULLSCREEN_SHOW_OPTIONS } from "../store/hud-ui-show";
import { readSceneHudVisibility, subscribeSceneHudVisibility } from "../store/scene-hud-visibility";
import { VISUAL_INVENTORY_HUD_OPEN_OPTIONS } from "../store/passthrough-show-options";

/**
 * 完整可视化界面名：`@<extension.json.id>/<界面 name 字段>`。
 */
export const VISUAL_INVENTORY_HUD_NAME = `@${EXTENSION_PACKAGE_ID}/inventory-hud`;

/**
 * 当前是否由本模块主动打开了可视化 HUD（片段卸层时用于恢复）。
 */
let visualHudSessionOpen = false;

/**
 * 读取可视化 HUD 会话标志。
 *
 * @returns 是否应在片段结束后恢复 Visual HUD
 */
export function isVisualInventoryHudSessionOpen(): boolean {
  return visualHudSessionOpen;
}

/**
 * 写入可视化 HUD 会话标志（一般由 open/close 内部维护）。
 *
 * @param open - 是否视为已打开
 */
export function setVisualInventoryHudSession(open: boolean): void {
  visualHudSessionOpen = open;
}

/**
 * 将快捷栏条目补齐到固定格数。
 *
 * @param entries - getQuickbarEntries 结果
 * @returns 长度固定为 QUICKBAR_SLOTS
 */
function padSlots(
  entries: InventoryEntry[],
): Array<InventoryEntry | null> {
  const slots: Array<InventoryEntry | null> = entries.slice(
    0,
    QUICKBAR_SLOTS,
  );

  while (slots.length < QUICKBAR_SLOTS) {
    slots.push(null);
  }

  return slots;
}

/**
 * 读取物品库（作者 settings）。
 *
 * @param ctx - 扩展上下文
 * @returns 物品定义列表
 */
function readItems(ctx: ExtensionContext): ItemDefinition[] {
  const raw = readAuthorSetting(ctx, ITEMS_LIBRARY_SETTINGS_KEY);
  const json = typeof raw === "string" ? raw : "";
  const lib = parseItemsLibraryJson(json);

  return lib.items;
}

/**
 * 读取打开背包按钮文案（来自 HUD settings，缺省「打开背包」）。
 *
 * @param ctx - 扩展上下文
 * @returns 按钮文案
 */
function readOpenBagLabel(ctx: ExtensionContext): string {
  const design = normalizeDesignSize(
    Number(readAuthorSetting(ctx, SETTINGS_DESIGN_WIDTH)) ||
      DEFAULT_DESIGN_WIDTH,
    Number(readAuthorSetting(ctx, SETTINGS_DESIGN_HEIGHT)) ||
      DEFAULT_DESIGN_HEIGHT,
  );
  const raw = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);
  const json = typeof raw === "string" ? raw : "";
  const hud = parseInventoryHudJson(json, design.width, design.height);
  const chrome = (hud.overlays ?? []).find(
    (el) => el.role === "openBag" || el.id === "hud-chrome-open-bag",
  );
  if (chrome && typeof chrome.props.text === "string") {
    return chrome.props.text.trim();
  }

  if (chrome && typeof chrome.style.label === "string") {
    return chrome.style.label.trim();
  }

  const layout = resolveHudLayout(hud);
  return layout.openBagStyle.label?.trim() ?? "";
}

/**
 * 把当前库存同步到已打开的 Visual HUD 元素。
 *
 * @param ctx - 扩展上下文
 * @param view - VisualUI 句柄
 *
 * @remarks
 * - 空槽：隐藏按钮/图标/数量，避免空白矩形挡点击
 * - 有物：显示按钮；图标走 `asset`（宿主自行 resolve）；数量 >1 时显示角标
 */
export function syncVisualInventoryHud(
  ctx: ExtensionContext,
  view: VisualUIViewHandle,
): void {
  const items = readItems(ctx);
  const slots = padSlots(getQuickbarEntries(getInventorySession()));
  const visibility = readSceneHudVisibility(ctx);

  view.get("open-backpack")?.setHidden(!visibility.showOpenBagButton);
  view.get("open-backpack")?.setProps({
    text: readOpenBagLabel(ctx),
  });

  for (let i = 0; i < QUICKBAR_SLOTS; i += 1) {
    const entry = slots[i] ?? null;
    const btn = view.get(`slot-${i}`);
    const icon = view.get(`slot-icon-${i}`);
    const countEl = view.get(`slot-count-${i}`);

    if (entry === null || !visibility.showQuickbar) {
      btn?.setHidden(true);
      icon?.setHidden(true);
      countEl?.setHidden(true);
      continue;
    }

    const def = findItem(items, entry.itemId);
    const name = def?.name || entry.itemId || "?";
    const asset = (def?.icon ?? "").trim();
    const count =
      entry.kind === "stack" && entry.count > 1
        ? String(entry.count)
        : "";

    btn?.setHidden(false);
    btn?.setProps({
      text: asset ? "" : name.slice(0, 4),
    });

    if (asset) {
      icon?.setHidden(false);
      icon?.setProps({ asset });
    } else {
      icon?.setHidden(true);
      icon?.setProps({ asset: "" });
    }

    if (count) {
      countEl?.setHidden(false);
      countEl?.setProps({ text: count });
    } else {
      countEl?.setHidden(true);
      countEl?.setProps({ text: "" });
    }
  }
}

/**
 * 打开全屏背包程序（由「打开背包」按钮触发）。
 *
 * @param ctx - 扩展上下文
 */
async function openFullBackpack(ctx: ExtensionContext): Promise<void> {
  try {
    await ctx.ui.show(
      BACKPACK_MODULE_ID,
      {},
      { ...BACKPACK_HUD_FULLSCREEN_SHOW_OPTIONS },
    );
  } catch (err) {
    logError("visual-inventory-hud", "打开全屏背包失败", err);
  }
}

/**
 * 绑定一次 view 的点击与库存订阅；界面关闭时清理。
 *
 * @param ctx - 扩展上下文
 * @param view - 本次打开的句柄
 */
function bindVisualInventoryHudView(
  ctx: ExtensionContext,
  view: VisualUIViewHandle,
): void {
  const offs: Array<() => void> = [];

  syncVisualInventoryHud(ctx, view);

  offs.push(
    subscribeInventorySession(() => {
      syncVisualInventoryHud(ctx, view);
    }),
  );

  offs.push(subscribeSceneHudVisibility(() => {
    syncVisualInventoryHud(ctx, view);
  }));

  const openBtn = view.get("open-backpack");

  if (openBtn) {
    offs.push(
      openBtn.on("click", () => {
        void openFullBackpack(ctx);
      }),
    );
  }

  for (let i = 0; i < QUICKBAR_SLOTS; i += 1) {
    const btn = view.get(`slot-${i}`);

    if (!btn) {
      continue;
    }

    const index = i;

    offs.push(
      btn.on("click", () => {
        const current = padSlots(
          getQuickbarEntries(getInventorySession()),
        );
        const entry = current[index];

        if (!entry) {
          return;
        }

        const def = findItem(readItems(ctx), entry.itemId);

        /**
         * 暂无独立 Visual 详情页：有物品时打开全屏背包，
         * 避免再挂一层会挡对话的 React HUD。
         */
        if (def) {
          void openFullBackpack(ctx);
        }
      }),
    );
  }

  view.onClose(() => {
    for (const off of offs) {
      try {
        off();
      } catch {
        // 忽略
      }
    }

    setVisualInventoryHudSession(false);
  });
}

/**
 * 在扩展 onRegister 中注册：任意途径打开 Visual HUD 时同步数据并绑点击。
 *
 * @param ctx - 扩展上下文
 * @returns 取消 onOpen 订阅
 *
 * @example
 * ```ts
 * static onRegister(ctx) {
 *   registerVisualInventoryHud(ctx);
 * }
 * ```
 */
export function registerVisualInventoryHud(
  ctx: ExtensionContext,
): () => void {
  return ctx.visualUI.onOpen(VISUAL_INVENTORY_HUD_NAME, (view) => {
    setVisualInventoryHudSession(true);
    bindVisualInventoryHudView(ctx, view);
    logInfo("visual-inventory-hud", "Visual HUD onOpen", {
      name: VISUAL_INVENTORY_HUD_NAME,
    });
  });
}

/**
 * 打开可视化快捷栏（带 pointerEventsPassthrough）。
 *
 * 若已打开则只刷新数据；失败时抛错由调用方决定是否回退 React HUD。
 *
 * @param ctx - 扩展上下文
 * @returns 打开后的句柄
 *
 * @throws 宿主找不到界面 JSON 或 open 失败时抛出
 *
 * @example
 * ```ts
 * await openVisualInventoryHud(ctx);
 * ```
 */
export async function openVisualInventoryHud(
  ctx: ExtensionContext,
): Promise<VisualUIViewHandle> {
  const existing = ctx.visualUI.attach(VISUAL_INVENTORY_HUD_NAME);

  if (existing) {
    setVisualInventoryHudSession(true);
    syncVisualInventoryHud(ctx, existing);

    return existing;
  }

  const view = await ctx.visualUI.open(
    VISUAL_INVENTORY_HUD_NAME,
    { ...VISUAL_INVENTORY_HUD_OPEN_OPTIONS },
  );

  setVisualInventoryHudSession(true);
  /**
   * onOpen 也会 bind；此处再 sync 一次，避免竞态下首帧空槽。
   */
  syncVisualInventoryHud(ctx, view);

  logInfo("visual-inventory-hud", "Visual HUD 已打开", {
    name: VISUAL_INVENTORY_HUD_NAME,
    pointerEventsPassthrough: true,
  });

  return view;
}

/**
 * 关闭可视化快捷栏（若未打开则 no-op）。
 *
 * @param ctx - 扩展上下文
 */
export function closeVisualInventoryHud(ctx: ExtensionContext): void {
  try {
    const view = ctx.visualUI.attach(VISUAL_INVENTORY_HUD_NAME);

    if (view) {
      view.close();
    }
  } catch (err) {
    logWarn("visual-inventory-hud", "关闭 Visual HUD 失败", { err });
  } finally {
    setVisualInventoryHudSession(false);
  }
}

/**
 * 打开 Visual HUD；失败时回退到程序 UI 紧凑包围盒（旧方案）。
 *
 * @param ctx - 扩展上下文
 * @param fallbackShow - React ui.show 回退实现
 * @returns `"visual"` | `"react-fallback"`
 */
export async function openInventoryHudPreferVisual(
  ctx: ExtensionContext,
  fallbackShow: () => Promise<void>,
): Promise<"visual" | "react-fallback"> {
  try {
    await openVisualInventoryHud(ctx);

    return "visual";
  } catch (err) {
    logWarn(
      "visual-inventory-hud",
      "Visual HUD 打开失败，回退 React backpack-hud",
      { err },
    );
    await fallbackShow();

    return "react-fallback";
  }
}
