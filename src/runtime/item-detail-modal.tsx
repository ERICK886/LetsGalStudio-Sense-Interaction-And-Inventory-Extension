/**
 * item-detail-modal.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 物品大图详情弹层：展示 detailImage、名称与描述。
 */

import React, { useEffect, useMemo } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import type { ItemDefinition } from "../domain/types";
import { resolveAssetUrl } from "../shared/resolve-asset-url";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";

/**
 * ItemDetailModal 组件属性。
 */
export interface ItemDetailModalProps {
  /**
   * 要展示的物品定义；为 null 时不渲染。
   */
  item: ItemDefinition | null;

  /**
   * 关闭弹层（点击遮罩 / 关闭按钮 / Escape）。
   */
  onClose: () => void;
}

/**
 * 关闭按钮样式。
 *
 * @param tokens - 主题 token
 * @returns CSSProperties
 */
function closeButtonStyle(tokens: ThemeTokens): React.CSSProperties {
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
 * 物品大图详情弹层。
 *
 * - 展示 `detailImage`（缺失时回退 `icon`）
 * - 展示名称与描述
 * - 点击遮罩或按 Escape 关闭
 *
 * @param props.item - 物品定义；null 时返回 null
 * @param props.onClose - 关闭回调
 * @returns 全屏遮罩 + 详情卡片，或 null
 *
 * @example
 * ```tsx
 * <ItemDetailModal
 *   item={selectedItem}
 *   onClose={() => setSelectedItem(null)}
 * />
 * ```
 */
export function ItemDetailModal({
  item,
  onClose,
}: ItemDetailModalProps): React.ReactElement | null {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();

  /**
   * Escape 键关闭弹层。
   */
  useEffect(() => {
    if (item === null) {
      return;
    }

    /**
     * @param event - 键盘事件
     */
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [item, onClose]);

  const imageSrc = useMemo(() => {
    if (item === null) {
      return "";
    }

    const raw =
      (item.detailImage && item.detailImage.trim()) ||
      (item.icon && item.icon.trim()) ||
      "";

    return resolveAssetUrl(raw, ctx.asset?.resolve?.bind(ctx.asset));
  }, [item, ctx.asset]);

  if (item === null) {
    return null;
  }

  return (
    <div
      data-testid="item-detail-modal"
      role="dialog"
      aria-modal="true"
      aria-label={item.name || "物品详情"}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.55)",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div
        data-testid="item-detail-modal-card"
        onClick={(event) => {
          event.stopPropagation();
        }}
        style={{
          width: "min(420px, 100%)",
          maxHeight: "min(80vh, 640px)",
          overflow: "auto",
          background: tokens.bgElevated,
          color: tokens.textPrimary,
          border: `1px solid ${tokens.borderStrong}`,
          borderRadius: 10,
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            maxHeight: 280,
            borderRadius: 8,
            background: tokens.bgSunken,
            border: `1px solid ${tokens.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {imageSrc ? (
            <img
              data-testid="item-detail-image"
              src={imageSrc}
              alt={item.name || "物品"}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          ) : (
            <span
              style={{
                color: tokens.textMuted,
                fontSize: FONT_SIZE_DEFAULT,
              }}
            >
              无图片
            </span>
          )}
        </div>

        <div
          style={{
            fontSize: FONT_SIZE_TITLE,
            fontWeight: 650,
            letterSpacing: "0.02em",
          }}
        >
          {item.name || "未命名物品"}
        </div>

        <div
          data-testid="item-detail-description"
          style={{
            fontSize: FONT_SIZE_DEFAULT,
            color: tokens.textSecondary,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
            minHeight: 40,
          }}
        >
          {item.description || "（无描述）"}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            data-testid="item-detail-close"
            onClick={onClose}
            style={closeButtonStyle(tokens)}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
