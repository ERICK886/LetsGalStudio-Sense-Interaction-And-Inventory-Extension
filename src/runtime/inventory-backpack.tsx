/**
 * inventory-backpack.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 完整背包网格：按最近获得排序，点击条目查看大图详情。
 */

import React, { useMemo, useState } from "react";
import { sortEntriesRecentFirst } from "../domain/inventory";
import { findItem } from "../domain/item-registry";
import type {
  InventoryEntry,
  InventoryState,
  ItemDefinition,
} from "../domain/types";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";
import { ItemDetailModal } from "./item-detail-modal";

/**
 * InventoryBackpack 组件属性。
 */
export interface InventoryBackpackProps {
  /** 当前库存状态 */
  inventory: InventoryState;

  /** 物品库定义列表（解析 icon / 名称） */
  items: readonly ItemDefinition[];

  /**
   * 关闭背包（遮罩 / 关闭按钮 / Escape 由上层也可处理）。
   */
  onClose: () => void;
}

/**
 * 条目在网格中的稳定 key。
 *
 * @param entry - 库存条目
 * @returns React key
 */
function entryKey(entry: InventoryEntry): string {
  if (entry.kind === "unique") {
    return `unique:${entry.instanceId}`;
  }

  return `stack:${entry.itemId}`;
}

/**
 * 堆叠数量展示文案；unique 不显示数量角标。
 *
 * @param entry - 库存条目
 * @returns 数量字符串或 null
 */
function entryCountLabel(entry: InventoryEntry): string | null {
  if (entry.kind === "stack" && entry.count > 1) {
    return String(entry.count);
  }

  return null;
}

/**
 * 关闭 / 次要按钮样式。
 *
 * @param tokens - 主题
 * @returns CSSProperties
 */
function bagButtonStyle(tokens: ThemeTokens): React.CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${tokens.borderStrong}`,
    background: tokens.bgSunken,
    color: tokens.textPrimary,
    borderRadius: 6,
    padding: "6px 14px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: 500,
    cursor: "pointer",
    lineHeight: 1.2,
  };
}

/**
 * 完整背包弹层：recent-first 网格，点击打开 {@link ItemDetailModal}。
 *
 * @param props.inventory - 库存
 * @param props.items - 物品库
 * @param props.onClose - 关闭背包
 * @returns 背包遮罩 UI
 *
 * @example
 * ```tsx
 * <InventoryBackpack
 *   inventory={inventory}
 *   items={itemsLibrary.items}
 *   onClose={() => setBagOpen(false)}
 * />
 * ```
 */
export function InventoryBackpack({
  inventory,
  items,
  onClose,
}: InventoryBackpackProps): React.ReactElement {
  const { tokens } = useTheme();
  const [detailItem, setDetailItem] = useState<ItemDefinition | null>(null);

  const sorted = useMemo(
    () => sortEntriesRecentFirst(inventory.entries),
    [inventory.entries],
  );

  const itemList = items as ItemDefinition[];

  /**
   * 点击背包格：解析物品定义并打开大图。
   *
   * @param entry - 被点击的库存条目
   */
  const handleSlotClick = (entry: InventoryEntry): void => {
    const def = findItem(itemList, entry.itemId);

    if (def === undefined) {
      console.warn(
        "[scene-interaction]",
        "backpack: missing item definition",
        entry.itemId,
      );

      return;
    }

    setDetailItem(def);
  };

  return (
    <>
      <div
        data-testid="inventory-backpack"
        role="dialog"
        aria-modal="true"
        aria-label="背包"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0, 0, 0, 0.5)",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <div
          data-testid="inventory-backpack-panel"
          onClick={(event) => {
            event.stopPropagation();
          }}
          style={{
            width: "min(560px, 100%)",
            maxHeight: "min(80vh, 720px)",
            display: "flex",
            flexDirection: "column",
            background: tokens.bgElevated,
            color: tokens.textPrimary,
            border: `1px solid ${tokens.borderStrong}`,
            borderRadius: 10,
            boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
            overflow: "hidden",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              borderBottom: `1px solid ${tokens.border}`,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: FONT_SIZE_TITLE,
                fontWeight: 650,
                flex: 1,
              }}
            >
              背包
            </span>
            <button
              type="button"
              data-testid="inventory-backpack-close"
              onClick={onClose}
              style={bagButtonStyle(tokens)}
            >
              关闭
            </button>
          </header>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: 16,
            }}
          >
            {sorted.length === 0 ? (
              <div
                data-testid="inventory-backpack-empty"
                style={{
                  padding: 32,
                  textAlign: "center",
                  color: tokens.textMuted,
                  fontSize: FONT_SIZE_DEFAULT,
                }}
              >
                背包是空的
              </div>
            ) : (
              <div
                data-testid="inventory-backpack-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
                  gap: 10,
                }}
              >
                {sorted.map((entry) => {
                  const def = findItem(itemList, entry.itemId);
                  const icon = def?.icon?.trim() || "";
                  const name = def?.name || entry.itemId;
                  const count = entryCountLabel(entry);

                  return (
                    <button
                      key={entryKey(entry)}
                      type="button"
                      data-testid="inventory-backpack-slot"
                      data-item-id={entry.itemId}
                      title={name}
                      onClick={() => handleSlotClick(entry)}
                      style={{
                        appearance: "none",
                        position: "relative",
                        width: "100%",
                        aspectRatio: "1 / 1",
                        padding: 6,
                        borderRadius: 8,
                        border: `1px solid ${tokens.borderStrong}`,
                        background: tokens.bgSunken,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      {icon ? (
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
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            color: tokens.textMuted,
                            wordBreak: "break-all",
                          }}
                        >
                          {name}
                        </span>
                      )}

                      {count !== null ? (
                        <span
                          style={{
                            position: "absolute",
                            right: 4,
                            bottom: 2,
                            fontSize: 11,
                            fontWeight: 700,
                            color: tokens.textPrimary,
                            textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                          }}
                        >
                          {count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <ItemDetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />
    </>
  );
}
