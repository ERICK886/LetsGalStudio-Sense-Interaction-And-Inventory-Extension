import { chakra } from "@chakra-ui/react";
/**
 * recipe-preview-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.1
 *
 * 配方编辑器中栏：视觉化公式预览（物品图标 + 数量 + 箭头）。
 * 图标路径经 ctx.asset.resolve 解析，与物品库预览一致。
 */

import React, { useMemo } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { findItem } from "../../domain/item-registry";
import type {
  ItemDefinition,
  RecipeDefinition,
  RecipeItemAmount,
} from "../../domain/types";
import { resolveAssetUrl } from "../../shared/resolve-asset-url";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/**
 * RecipePreviewPanel 组件属性。
 */
export interface RecipePreviewPanelProps {
  /** 当前选中配方；无选中时为 null */
  recipe: RecipeDefinition | null;

  /** 物品库，用于 itemId → name / icon */
  items: ItemDefinition[];
}

/**
 * 将一行 RecipeItemAmount 格式化为「名称 x数量」。
 *
 * @param line - 原料或产物行
 * @param items - 物品定义列表
 * @returns 展示文案；找不到物品时回退 itemId
 *
 * @example
 * ```ts
 * formatRecipeLine({ itemId: "herb", count: 2 }, items); // "草药 x2"
 * ```
 */
export function formatRecipeLine(
  line: RecipeItemAmount,
  items: readonly ItemDefinition[],
): string {
  const item = items.find((entry) => entry.id === line.itemId);
  const name = item?.name?.trim() || line.itemId || "（空）";

  return `${name} x${line.count}`;
}

/**
 * 将配方格式化为「原料 → 产物」预览串（文本回退 / 测试用）。
 *
 * @param recipe - 配方定义
 * @param items - 物品定义列表
 * @returns 完整预览文案
 */
export function formatRecipePreview(
  recipe: RecipeDefinition,
  items: readonly ItemDefinition[],
): string {
  const left =
    recipe.ingredients.length === 0
      ? "（无原料）"
      : recipe.ingredients
          .map((line) => formatRecipeLine(line, items))
          .join(" + ");

  const right =
    recipe.products.length === 0
      ? "（无产物）"
      : recipe.products
          .map((line) => formatRecipeLine(line, items))
          .join(" + ");

  return `${left} → ${right}`;
}

/**
 * 单行物品卡片：图标 + 名称 + 数量角标。
 *
 * @param props.line - 原料或产物行
 * @param props.items - 物品库
 * @param props.tokens - 主题
 * @param props.resolve - SDK asset.resolve
 * @param props.role - 用于 data-testid：ingredient | product
 * @returns 卡片元素
 */
function RecipeItemCard({
  line,
  items,
  tokens,
  resolve,
  role,
}: {
  line: RecipeItemAmount;
  items: readonly ItemDefinition[];
  tokens: ThemeTokens;
  resolve: ((uri: string) => { url: string }) | undefined;
  role: "ingredient" | "product";
}): React.ReactElement {
  const item = findItem(items, line.itemId);
  const name = item?.name?.trim() || line.itemId || "（空）";
  const iconUrl = useMemo(
    () => resolveAssetUrl(item?.icon?.trim() || "", resolve),
    [item?.icon, resolve],
  );

  return (
    <chakra.div
      data-testid={`recipe-preview-${role}-card`}
      data-item-id={line.itemId}
      style={{
        width: 96,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
      }}
    >
      <chakra.div
        style={{
          position: "relative",
          width: 72,
          height: 72,
          borderRadius: 10,
          border: `1px solid ${tokens.borderStrong}`,
          background: tokens.bgElevated,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          boxShadow: "0 2px 10px rgba(0,0,0,0.28)",
        }}
      >
        {iconUrl ? (
          <chakra.img
            src={iconUrl}
            alt={name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              padding: 6,
              boxSizing: "border-box",
            }}
          />
        ) : (
          <chakra.span
            style={{
              fontSize: 11,
              color: tokens.textMuted,
              padding: 6,
              textAlign: "center",
              wordBreak: "break-all",
              lineHeight: 1.2,
            }}
          >
            {name}
          </chakra.span>
        )}

        <chakra.span
          data-testid={`recipe-preview-${role}-count`}
          style={{
            position: "absolute",
            right: 4,
            bottom: 4,
            minWidth: 22,
            height: 20,
            padding: "0 5px",
            borderRadius: 6,
            background: tokens.accent,
            color: "#0B1210",
            fontSize: 12,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
          }}
        >
          ×{line.count}
        </chakra.span>
      </chakra.div>

      <chakra.span
        title={name}
        style={{
          fontSize: 12,
          color: tokens.textSecondary,
          textAlign: "center",
          lineHeight: 1.3,
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </chakra.span>
    </chakra.div>
  );
}

/**
 * 一组物品卡片，中间用「+」分隔。
 *
 * @param props.lines - 原料或产物列表
 * @param props.emptyLabel - 空列表文案
 * @param props.role - ingredient | product
 */
function RecipeItemGroup({
  lines,
  items,
  tokens,
  resolve,
  role,
  emptyLabel,
}: {
  lines: readonly RecipeItemAmount[];
  items: readonly ItemDefinition[];
  tokens: ThemeTokens;
  resolve: ((uri: string) => { url: string }) | undefined;
  role: "ingredient" | "product";
  emptyLabel: string;
}): React.ReactElement {
  if (lines.length === 0) {
    return (
      <chakra.div
        data-testid={`recipe-preview-${role}-empty`}
        style={{
          color: tokens.textMuted,
          fontSize: FONT_SIZE_DEFAULT,
          padding: "12px 16px",
        }}
      >
        {emptyLabel}
      </chakra.div>
    );
  }

  return (
    <chakra.div
      data-testid={`recipe-preview-${role}-group`}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      {lines.map((line, index) => (
        <React.Fragment key={`${role}-${line.itemId}-${index}`}>
          {index > 0 ? (
            <chakra.span
              aria-hidden
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: tokens.textMuted,
                lineHeight: 1,
                paddingBottom: 22,
              }}
            >
              +
            </chakra.span>
          ) : null}
          <RecipeItemCard
            line={line}
            items={items}
            tokens={tokens}
            resolve={resolve}
            role={role}
          />
        </React.Fragment>
      ))}
    </chakra.div>
  );
}

/**
 * 中栏配方视觉化预览：原料图标 → 产物图标。
 *
 * @param props - RecipePreviewPanelProps
 * @returns 预览面板 UI
 *
 * @example
 * ```tsx
 * <RecipePreviewPanel recipe={selectedRecipe} items={items} />
 * ```
 */
export function RecipePreviewPanel({
  recipe,
  items,
}: RecipePreviewPanelProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const resolve = ctx.asset?.resolve?.bind(ctx.asset);

  const formulaText = useMemo(() => {
    if (recipe === null) {
      return null;
    }

    return formatRecipePreview(recipe, items);
  }, [recipe, items]);

  return (
    <chakra.div
      data-testid="recipe-preview-panel"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: tokens.bgSunken,
        color: tokens.textPrimary,
      }}
    >
      <chakra.div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
          background: tokens.bgElevated,
        }}
      >
        <chakra.span
          style={{
            fontSize: FONT_SIZE_TITLE,
            fontWeight: 650,
            color: tokens.textPrimary,
          }}
        >
          配方预览
        </chakra.span>
      </chakra.div>

      <chakra.div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          overflow: "auto",
        }}
      >
        {recipe === null ? (
          <chakra.div
            data-testid="recipe-preview-empty"
            style={{
              color: tokens.textMuted,
              fontSize: FONT_SIZE_DEFAULT,
              textAlign: "center",
            }}
          >
            请选择配方
          </chakra.div>
        ) : (
          <chakra.div
            data-testid="recipe-preview-formula"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              alignItems: "center",
              width: "100%",
              maxWidth: 640,
            }}
          >
            <chakra.div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <chakra.div
                style={{
                  fontSize: FONT_SIZE_TITLE + 2,
                  fontWeight: 650,
                  color: tokens.textPrimary,
                  letterSpacing: "0.02em",
                }}
              >
                {recipe.name || "（未命名）"}
              </chakra.div>
              {recipe.description?.trim() ? (
                <chakra.div
                  data-testid="recipe-preview-description"
                  style={{
                    fontSize: FONT_SIZE_DEFAULT,
                    color: tokens.textMuted,
                    lineHeight: 1.45,
                    maxWidth: 420,
                  }}
                >
                  {recipe.description}
                </chakra.div>
              ) : null}
            </chakra.div>

            <chakra.div
              data-testid="recipe-preview-visual"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                width: "100%",
                padding: "20px 16px",
                borderRadius: 12,
                border: `1px solid ${tokens.border}`,
                background: tokens.bgElevated,
              }}
            >
              <RecipeItemGroup
                lines={recipe.ingredients}
                items={items}
                tokens={tokens}
                resolve={resolve}
                role="ingredient"
                emptyLabel="（无原料）"
              />

              <chakra.span
                aria-hidden
                data-testid="recipe-preview-arrow"
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: tokens.accent,
                  lineHeight: 1,
                  paddingBottom: 22,
                  flexShrink: 0,
                }}
              >
                →
              </chakra.span>

              <RecipeItemGroup
                lines={recipe.products}
                items={items}
                tokens={tokens}
                resolve={resolve}
                role="product"
                emptyLabel="（无产物）"
              />
            </chakra.div>

            {formulaText ? (
              <chakra.div
                data-testid="recipe-preview-formula-text"
                style={{
                  fontSize: 12,
                  color: tokens.textMuted,
                  textAlign: "center",
                  lineHeight: 1.4,
                  wordBreak: "break-word",
                }}
              >
                {formulaText}
              </chakra.div>
            ) : null}
          </chakra.div>
        )}
      </chakra.div>
    </chakra.div>
  );
}
