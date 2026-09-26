import { chakra } from "@chakra-ui/react";
/**
 * item-preview-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 物品库编辑器中栏：icon + detailImage + 名称/描述文案预览。
 * 图片路径经 ctx.asset.resolve 解析（与场景底图 / 交互点一致）。
 */

import React, { useMemo } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import type { ItemDefinition } from "../../domain/types";
import { resolveAssetUrl } from "../../shared/resolve-asset-url";
import { createContextAssetResolver } from "../../shared/resolve-context-asset-url";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/**
 * ItemPreviewPanel 组件属性。
 */
export interface ItemPreviewPanelProps {
  /** 当前选中物品；无选中时为 null */
  item: ItemDefinition | null;
}

/**
 * 预览区图片块：有 URI 则 resolve 后展示，否则占位。
 *
 * @param props.label - 区块标题
 * @param props.src - 领域资源路径（如 ui/item1.png）
 * @param props.maxHeight - 最大高度
 * @param props.testId - data-testid
 * @param props.tokens - 主题
 * @param props.resolve - SDK asset.resolve
 * @returns 预览块
 */
function PreviewImageBlock({
  label,
  src,
  maxHeight,
  testId,
  tokens,
  resolve,
}: {
  label: string;
  src: string;
  maxHeight: number;
  testId: string;
  tokens: ThemeTokens;
  resolve: ((uri: string) => { url: string }) | undefined;
}): React.ReactElement {
  const url = useMemo(
    () => resolveAssetUrl(src, resolve),
    [src, resolve],
  );

  return (
    <chakra.div
      data-testid={testId}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
        width: "100%",
        maxWidth: 360,
      }}
    >
      <chakra.span
        style={{
          alignSelf: "flex-start",
          fontSize: 12,
          color: tokens.textMuted,
          fontWeight: 550,
        }}
      >
        {label}
      </chakra.span>
      <chakra.div
        style={{
          width: "100%",
          minHeight: Math.min(120, maxHeight),
          maxHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          border: `1px dashed ${tokens.borderStrong}`,
          background: tokens.bgElevated,
          overflow: "hidden",
        }}
      >
        {url ? (
          <chakra.img
            src={url}
            alt={label}
            style={{
              maxWidth: "100%",
              maxHeight,
              objectFit: "contain",
              display: "block",
            }}
          />
        ) : (
          <chakra.span style={{ color: tokens.textMuted, fontSize: FONT_SIZE_DEFAULT }}>
            未设置
          </chakra.span>
        )}
      </chakra.div>
    </chakra.div>
  );
}

/**
 * 中栏物品预览：图标、详情大图与文案。
 *
 * @param props.item - 选中物品；null 时空状态
 * @returns 预览面板 UI
 *
 * @example
 * ```tsx
 * <ItemPreviewPanel item={selectedItem} />
 * ```
 */
export function ItemPreviewPanel({
  item,
}: ItemPreviewPanelProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const resolve = createContextAssetResolver(ctx);

  if (item === null) {
    return (
      <chakra.div
        data-testid="item-preview-panel"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tokens.textMuted,
          fontSize: FONT_SIZE_DEFAULT,
          background: tokens.bgSunken,
        }}
      >
        从左侧新建或选择物品后预览
      </chakra.div>
    );
  }

  return (
    <chakra.div
      data-testid="item-preview-panel"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        padding: 24,
        boxSizing: "border-box",
        overflow: "auto",
        background: tokens.bgSunken,
        color: tokens.textPrimary,
      }}
    >
      <chakra.div
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <chakra.span
          data-testid="item-preview-name"
          style={{
            fontSize: FONT_SIZE_TITLE,
            fontWeight: 650,
            letterSpacing: "0.02em",
          }}
        >
          {item.name || "（未命名）"}
        </chakra.span>
        <chakra.span
          data-testid="item-preview-id"
          style={{ fontSize: 12, color: tokens.textMuted }}
        >
          {item.id}
        </chakra.span>
        <chakra.p
          data-testid="item-preview-description"
          style={{
            margin: "8px 0 0",
            fontSize: FONT_SIZE_DEFAULT,
            color: tokens.textSecondary,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {item.description.trim() ? item.description : "（无描述）"}
        </chakra.p>
        <chakra.span style={{ fontSize: 12, color: tokens.textMuted, marginTop: 4 }}>
          {item.stackable
            ? `可堆叠${item.maxStack != null ? ` · 上限 ${item.maxStack}` : ""}`
            : "不可堆叠（唯一实例）"}
        </chakra.span>
      </chakra.div>

      <PreviewImageBlock
        label="图标 (icon)"
        src={item.icon}
        maxHeight={96}
        testId="item-preview-icon"
        tokens={tokens}
        resolve={resolve}
      />

      <PreviewImageBlock
        label="详情大图 (detailImage)"
        src={item.detailImage}
        maxHeight={240}
        testId="item-preview-detail"
        tokens={tokens}
        resolve={resolve}
      />
    </chakra.div>
  );
}
