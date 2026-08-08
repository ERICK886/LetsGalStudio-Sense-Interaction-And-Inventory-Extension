/**
 * inventory-quickbar.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 运行时 8 格快捷栏：按最近获得截断，定位取自 InventoryHudConfig；
 * 点击槽打开大图，打开背包进入完整网格。
 * 另导出 InventoryHudLayer：自订阅 inventory / items / hud JSON。
 */

import React, { useMemo, useState } from "react";
import {
  useExtensionContext,
  type SaveAPI,
} from "@avg-studio/sdk";
import {
  getQuickbarEntries,
  QUICKBAR_SLOTS,
} from "../domain/inventory";
import { findItem } from "../domain/item-registry";
import { parseInventoryHudJson } from "../domain/serialize";
import type {
  InventoryEntry,
  InventoryHudConfig,
  InventoryState,
  ItemDefinition,
} from "../domain/types";
import { useInventory } from "../store/inventory-persistence";
import { useItemsLibrary } from "../store/items-persistence";
import type { SceneInteractionSaveMap } from "../store/save-types";
import {
  FONT_SIZE_DEFAULT,
  useTheme,
} from "../theme/theme-provider";
import { InventoryBackpack } from "./inventory-backpack";
import { ItemDetailModal } from "./item-detail-modal";

/**
 * InventoryQuickbar 组件属性。
 */
export interface InventoryQuickbarProps {
  /** 当前库存 */
  inventory: InventoryState;

  /** 物品库定义 */
  items: readonly ItemDefinition[];

  /** HUD 外观与定位 */
  hud: InventoryHudConfig;
}

/**
 * 快捷栏槽位稳定 key；空槽用 index。
 *
 * @param entry - 库存条目或 null
 * @param index - 槽位下标 0..7
 * @returns React key
 */
function slotKey(entry: InventoryEntry | null, index: number): string {
  if (entry === null) {
    return `empty:${index}`;
  }

  if (entry.kind === "unique") {
    return `unique:${entry.instanceId}`;
  }

  return `stack:${entry.itemId}`;
}

/**
 * 将 quickbar 条目补齐到 QUICKBAR_SLOTS 格（空位为 null）。
 *
 * @param entries - getQuickbarEntries 结果（最多 8）
 * @returns 长度固定为 QUICKBAR_SLOTS 的数组
 */
function padQuickbarSlots(
  entries: InventoryEntry[],
): Array<InventoryEntry | null> {
  const slots: Array<InventoryEntry | null> = entries.slice(0, QUICKBAR_SLOTS);

  while (slots.length < QUICKBAR_SLOTS) {
    slots.push(null);
  }

  return slots;
}

/**
 * 8 格快捷栏 + 打开背包 + 大图 / 背包弹层。
 *
 * 定位使用 `hud.left` / `hud.top`；槽位尺寸 `hud.slotSize`；间距 `hud.gap`。
 * 默认纵向排列（左侧锚点）。
 *
 * @param props.inventory - 库存状态
 * @param props.items - 物品库
 * @param props.hud - InventoryHudConfig
 * @returns 绝对定位快捷栏 UI（含弹层）
 *
 * @example
 * ```tsx
 * <InventoryQuickbar
 *   inventory={inventory}
 *   items={items}
 *   hud={parseInventoryHudJson(json)}
 * />
 * ```
 */
export function InventoryQuickbar({
  inventory,
  items,
  hud,
}: InventoryQuickbarProps): React.ReactElement {
  const { tokens } = useTheme();
  const [bagOpen, setBagOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ItemDefinition | null>(null);

  const slots = useMemo(
    () => padQuickbarSlots(getQuickbarEntries(inventory)),
    [inventory],
  );

  const itemList = items as ItemDefinition[];
  const slotSize = Math.max(24, hud.slotSize || 64);
  const gap = Math.max(0, hud.gap || 0);

  /**
   * 点击非空槽：打开物品大图。
   *
   * @param entry - 槽内条目
   */
  const handleSlotClick = (entry: InventoryEntry): void => {
    const def = findItem(itemList, entry.itemId);

    if (def === undefined) {
      console.warn(
        "[scene-interaction]",
        "quickbar: missing item definition",
        entry.itemId,
      );

      return;
    }

    setDetailItem(def);
  };

  return (
    <>
      {hud.customCss.trim() ? (
        <style data-testid="inventory-hud-custom-css">{hud.customCss}</style>
      ) : null}

      <div
        className="inventory-hud-root"
        data-testid="inventory-quickbar"
        style={{
          position: "absolute",
          left: hud.left,
          top: hud.top,
          zIndex: 40,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap,
          pointerEvents: "auto",
        }}
      >
        {slots.map((entry, index) => {
          const def =
            entry !== null ? findItem(itemList, entry.itemId) : undefined;
          const icon = def?.icon?.trim() || "";
          const name = def?.name || entry?.itemId || "";
          const count =
            entry?.kind === "stack" && entry.count > 1
              ? String(entry.count)
              : null;

          return (
            <button
              key={slotKey(entry, index)}
              type="button"
              data-testid="inventory-quickbar-slot"
              data-slot-index={index}
              data-item-id={entry?.itemId ?? ""}
              disabled={entry === null}
              title={entry === null ? "空槽" : name}
              onClick={() => {
                if (entry !== null) {
                  handleSlotClick(entry);
                }
              }}
              style={{
                appearance: "none",
                position: "relative",
                width: slotSize,
                height: slotSize,
                padding: 4,
                borderRadius: 8,
                border: `1px solid ${tokens.borderStrong}`,
                background:
                  entry === null ? `${tokens.bgSunken}99` : tokens.bgElevated,
                cursor: entry === null ? "default" : "pointer",
                opacity: entry === null ? 0.55 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                boxShadow:
                  entry === null
                    ? "none"
                    : "0 2px 8px rgba(0,0,0,0.35)",
              }}
            >
              {entry !== null && icon ? (
                <img
                  src={icon}
                  alt={name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    pointerEvents: "none",
                  }}
                />
              ) : null}

              {entry !== null && !icon ? (
                <span
                  style={{
                    fontSize: 10,
                    color: tokens.textMuted,
                    wordBreak: "break-all",
                    lineHeight: 1.15,
                  }}
                >
                  {name || "?"}
                </span>
              ) : null}

              {count !== null ? (
                <span
                  style={{
                    position: "absolute",
                    right: 3,
                    bottom: 1,
                    fontSize: 11,
                    fontWeight: 700,
                    color: tokens.textPrimary,
                    textShadow: "0 1px 2px rgba(0,0,0,0.85)",
                  }}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}

        <button
          type="button"
          data-testid="inventory-quickbar-open-bag"
          onClick={() => setBagOpen(true)}
          style={{
            appearance: "none",
            width: slotSize,
            minHeight: 32,
            padding: "6px 4px",
            borderRadius: 8,
            border: `1px solid ${tokens.accent}`,
            background: `${tokens.accent}22`,
            color: tokens.textPrimary,
            fontSize: Math.max(11, FONT_SIZE_DEFAULT - 1),
            fontFamily: "inherit",
            fontWeight: 600,
            cursor: "pointer",
            lineHeight: 1.2,
          }}
        >
          {hud.openBagLabel || "打开背包"}
        </button>
      </div>

      {bagOpen ? (
        <InventoryBackpack
          inventory={inventory}
          items={items}
          onClose={() => setBagOpen(false)}
        />
      ) : null}

      <ItemDetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />
    </>
  );
}

/**
 * InventoryHudLayer 属性：自订阅存档与 settings。
 */
export interface InventoryHudLayerProps {
  /**
   * 强类型存档 API（读 inventoryJson）。
   */
  save: SaveAPI<SceneInteractionSaveMap>;
}

/**
 * 自包含 HUD 层：订阅 inventory / itemsLibrary / inventoryHudJson 并渲染快捷栏。
 *
 * 用于 `inventoryHudMode === "always"` 时挂在 App 运行态，或
 * `withScene` 时挂在 RuntimeShell 内。
 *
 * @param props.save - 存档 API
 * @returns InventoryQuickbar
 *
 * @example
 * ```tsx
 * {!isEditing && hudMode === "always" ? (
 *   <InventoryHudLayer save={save} />
 * ) : null}
 * ```
 */
export function InventoryHudLayer({
  save,
}: InventoryHudLayerProps): React.ReactElement {
  const ctx = useExtensionContext();
  const [inventory] = useInventory(save, ctx);
  const [itemsLibrary] = useItemsLibrary();
  const [hudJsonRaw] = ctx.settings.useValue("inventoryHudJson");

  const hud = useMemo(() => {
    const raw =
      typeof hudJsonRaw === "string"
        ? hudJsonRaw
        : hudJsonRaw === undefined || hudJsonRaw === null
          ? String(ctx.settings.get("inventoryHudJson") ?? "")
          : String(hudJsonRaw);

    return parseInventoryHudJson(raw);
  }, [hudJsonRaw, ctx.settings]);

  return (
    <InventoryQuickbar
      inventory={inventory}
      items={itemsLibrary.items}
      hud={hud}
    />
  );
}
