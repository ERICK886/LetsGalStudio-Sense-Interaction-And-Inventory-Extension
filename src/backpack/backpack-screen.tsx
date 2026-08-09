/**
 * backpack-screen.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.5.3
 *
 * 背包全屏幕 UI（v2）：
 * - 功能节点仅 itemGrid / detailPanel；遮罩/主面板/标题/关闭/模式/合成等为 overlays 组件；
 * - 按钮通过 role（closeBag / toggleMode / craft）接到关闭、模式切换与合成；
 * - 入场 / 退场：宿主遮罩淡入淡出 + 内容包装层位移动画。
 *
 * 属于 backpack-hud 程序，不依赖场景壳。
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { canCraftRecipe } from "../domain/crafting";
import { sortEntriesRecentFirst } from "../domain/inventory";
import { resolveItemToastAppearance } from "../domain/item-toast-config";
import { findItem } from "../domain/item-registry";
import {
  resolveBackpackLayout,
  type ResolvedBackpackLayout,
} from "../domain/backpack-layout";
import { BAG_CHROME_OVERLAY_IDS } from "../domain/backpack-screen-config";
import { layerZIndex } from "../domain/layer-order";
import { MOTION_DEFAULT_DURATION_MS } from "../domain/motion";
import {
  advanceToastQueue,
  emptyToastQueue,
  enqueueToast,
  type ToastQueueState,
} from "../domain/toast-queue";
import {
  accentAlpha,
  applyUiBoxStyle,
  applyUiTextStyle,
} from "../domain/ui-style";
import type {
  ElementMotion,
  InventoryEntry,
  InventoryState,
  ItemDefinition,
  RecipeDefinition,
  UiBoxStyle,
  UiOverlayRole,
  UiTextStyle,
} from "../domain/types";
import { formatIngredientSummary } from "../runtime/craft-panel";
import { ToastLayer } from "../runtime/toast-layer";
import { UiOverlayLayer } from "../runtime/ui-overlay-layer";
import { fitDesignToHost } from "../shared/scene-layout";
import { resolveAssetUrl } from "../shared/resolve-asset-url";
import { useBackpackScreenConfig } from "../store/use-backpack-ui-config";
import { useDesignSize } from "../store/use-design-size";
import { useSceneUiConfig } from "../store/use-scene-ui-config";

/** 合成成功轻提示动效（与获得物品默认 toast 一致：上滑进 / 下滑出） */
const CRAFT_SUCCESS_TOAST_MOTION: ElementMotion = {
  enter: {
    preset: "slideUp",
    delayMs: 0,
    durationMs: MOTION_DEFAULT_DURATION_MS,
    customCss: "",
  },
  exit: {
    preset: "slideDown",
    delayMs: 0,
    durationMs: MOTION_DEFAULT_DURATION_MS,
    customCss: "",
  },
};

/** 相对合成按钮顶边的提示间距（设计像素） */
const CRAFT_SUCCESS_TOAST_GAP = 12;

/** 入场动画时长（毫秒） */
const ENTER_MS = 320;

/** 退场动画时长（毫秒） */
const EXIT_MS = 240;

/** 主界面模式：物品列表 / 合成 */
type ScreenMode = "items" | "craft";

/**
 * 运行时视觉 token：由 layout.accent + 各节点 style 派生。
 * 节点 style 有值时优先；否则用 accent / 中性色回退。
 */
interface BackpackTokens {
  /** 页面 / 遮罩底 */
  bgPage: string;

  /** 主面板底 */
  bgPanel: string;

  /** 网格区底 */
  bgGrid: string;

  /** 槽位默认底 */
  bgCell: string;

  /** 槽位悬停底 */
  bgCellHover: string;

  /** 槽位选中底 */
  bgCellSelected: string;

  /** 详情大图渐变底 */
  bgPreview: string;

  /** 强调色 */
  accent: string;

  /** 强调色弱化（光晕 / 选中描边） */
  accentDim: string;

  /** 强调色底上的文字色 */
  accentTextOn: string;

  /** 主文字 */
  text: string;

  /** 次要文字 */
  textMuted: string;

  /** 柔和正文 */
  textSoft: string;

  /** 默认边框 */
  border: string;

  /** 强调边框 */
  borderStrong: string;

  /** 字体栈 */
  font: string;
}

/**
 * 基于解析布局构建视觉 token。
 *
 * @param layout - resolveBackpackLayout 结果
 * @returns BackpackTokens（节点 style 优先，否则 accent / 中性回退）
 *
 * @example
 * ```ts
 * const tokens = buildTokens(resolveBackpackLayout(cfg));
 * // tokens.accent === cfg.accent
 * ```
 */
function buildTokens(layout: ResolvedBackpackLayout): BackpackTokens {
  const accent =
    typeof layout.accent === "string" && layout.accent.trim().length > 0
      ? layout.accent.trim()
      : "#64e0d0";

  const bgPage =
    layout.backdrop.style.background?.trim() || "#05080c";
  const bgPanel =
    layout.panelChrome.style.background?.trim() ||
    "rgba(14, 18, 24, 0.92)";
  const bgGrid =
    layout.itemGrid.style.background?.trim() || "rgba(10, 14, 20, 0.55)";
  const bgCellSelected =
    layout.itemGrid.selectedStyle.background?.trim() ||
    accentAlpha(accent, "1f");
  const border =
    layout.panelChrome.style.borderColor?.trim() ||
    "rgba(255, 255, 255, 0.08)";
  const text =
    layout.titleBlock.title.color?.trim() || "#f2f5f7";

  return {
    bgPage,
    bgPanel,
    bgGrid,
    bgCell: "rgba(255, 255, 255, 0.03)",
    bgCellHover: "rgba(255, 255, 255, 0.06)",
    bgCellSelected,
    bgPreview: `linear-gradient(145deg, ${accentAlpha(accent, "33")} 0%, #0d1a28 55%, #0a1220 100%)`,
    accent,
    accentDim: accentAlpha(accent, "24"),
    accentTextOn: "#061012",
    text,
    textMuted: "rgba(200, 210, 220, 0.55)",
    textSoft: "rgba(220, 230, 235, 0.82)",
    border,
    borderStrong: accentAlpha(accent, "47"),
    font: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  };
}

/**
 * 注入背包全屏入场 / 退场关键帧。
 *
 * @returns style 节点
 */
function BackpackMotionStyles(): React.ReactElement {
  return (
    <style>{`
      @keyframes bp-backdrop-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes bp-backdrop-out {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes bp-panel-in {
        from {
          opacity: 0;
          transform: translateY(18px) scale(0.985);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes bp-panel-out {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(12px) scale(0.99);
        }
      }
    `}</style>
  );
}

/**
 * 物品 Grid 单元格。
 */
interface ItemCellView {
  key: string;
  entry: InventoryEntry;
  def: ItemDefinition | undefined;
  name: string;
  meta: string;
}

/**
 * 合成 Grid 单元格。
 */
interface RecipeCellView {
  key: string;
  recipe: RecipeDefinition;
  name: string;
  summary: string;
  canCraft: boolean;
  /** 首个产物物品定义（用于图标 / 大图） */
  productDef: ItemDefinition | undefined;
}

/**
 * BackpackScreen 属性。
 */
export interface BackpackScreenProps {
  /** 当前库存 */
  inventory: InventoryState;

  /** 物品库 */
  items: readonly ItemDefinition[];

  /** 配方库（合成页） */
  recipes: readonly RecipeDefinition[];

  /**
   * 合成回调。
   *
   * @param recipeId - 配方 id
   * @returns 是否合成成功
   */
  onCraftRecipe: (recipeId: string) => boolean;

  /** 关闭全屏背包 */
  onClose: () => void;
}

/**
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
 * @param entry - 库存条目
 * @param def - 物品定义
 * @returns 副标题（详情区文案，非 tag）
 */
function metaLabelOf(
  entry: InventoryEntry,
  def: ItemDefinition | undefined,
): string {
  const stackable = def?.stackable ?? entry.kind === "stack";

  if (!stackable || entry.kind === "unique") {
    return "不可叠加";
  }

  const count = entry.kind === "stack" ? entry.count : 1;

  return `持有 ×${count}`;
}

/**
 * @param inventory - 库存
 * @param items - 物品库
 * @returns 物品单元格
 */
function buildItemCells(
  inventory: InventoryState,
  items: readonly ItemDefinition[],
): ItemCellView[] {
  const entries = Array.isArray(inventory?.entries) ? inventory.entries : [];
  const sorted = sortEntriesRecentFirst(entries);
  const catalog = items as ItemDefinition[];

  return sorted.map((entry) => {
    const def = findItem(catalog, entry.itemId);

    return {
      key: entryKey(entry),
      entry,
      def,
      name: def?.name || entry.itemId,
      meta: metaLabelOf(entry, def),
    };
  });
}

/**
 * @param recipes - 配方库
 * @param items - 物品库
 * @param inventory - 库存
 * @returns 合成单元格
 */
function buildRecipeCells(
  recipes: readonly RecipeDefinition[],
  items: readonly ItemDefinition[],
  inventory: InventoryState,
): RecipeCellView[] {
  const catalog = items as ItemDefinition[];
  const list = Array.isArray(recipes) ? recipes : [];

  return list.map((recipe) => {
    const firstProductId = recipe.products[0]?.itemId;
    const productDef = firstProductId
      ? findItem(catalog, firstProductId)
      : undefined;

    return {
      key: `recipe:${recipe.id}`,
      recipe,
      name: recipe.name?.trim() || recipe.id,
      summary: formatIngredientSummary(recipe, items),
      canCraft: canCraftRecipe(inventory, recipe),
      productDef,
    };
  });
}

/**
 * Grid 槽位共用外观。
 *
 * @param props.active - 选中
 * @param props.title - title
 * @param props.testId - data-testid
 * @param props.onClick - 点击
 * @param props.iconUrl - 图标 URL
 * @param props.label - 底部名称
 * @param props.disabledLook - 视觉弱化（如不可合成）
 * @param props.tokens - 视觉 token
 * @param props.cellStyle - 常态盒样式
 * @param props.selectedStyle - 选中态盒样式
 * @param props.cellLabelStyle - 名称文字样式
 * @param props.iconMaxSize - 格内图片边长
 * @returns 槽位按钮
 */
function GridCellButton({
  active,
  title,
  testId,
  onClick,
  iconUrl,
  label,
  disabledLook = false,
  tokens,
  cellStyle,
  selectedStyle,
  cellLabelStyle,
  iconMaxSize,
}: {
  active: boolean;
  title: string;
  testId: string;
  onClick: () => void;
  iconUrl: string;
  label: string;
  disabledLook?: boolean;
  tokens: BackpackTokens;
  cellStyle: UiBoxStyle;
  selectedStyle: UiBoxStyle;
  cellLabelStyle: UiTextStyle;
  iconMaxSize: number;
}): React.ReactElement {
  const idleCss = applyUiBoxStyle(cellStyle);
  const selectedCss = applyUiBoxStyle(selectedStyle);
  const labelCss = applyUiTextStyle(cellLabelStyle);
  const selectedBorder =
    selectedStyle.borderColor?.trim() || tokens.accent;
  const selectedBg =
    selectedStyle.background?.trim() || tokens.bgCellSelected;
  const idleBorder =
    cellStyle.borderColor?.trim() || tokens.border;
  const idleBg = cellStyle.background?.trim() || tokens.bgCell;
  const radius =
    (active ? selectedStyle.borderRadius : cellStyle.borderRadius) ?? 12;
  const borderW = active
    ? (selectedStyle.borderWidth ?? 1)
    : (cellStyle.borderWidth ?? 1);
  const iconCap = Math.max(24, iconMaxSize);

  return (
    <button
      type="button"
      role="listitem"
      data-testid={testId}
      title={title}
      aria-pressed={active}
      onClick={onClick}
      style={{
        appearance: "none",
        position: "relative",
        aspectRatio: "1 / 1",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "flex-end",
        padding: 10,
        borderRadius: radius,
        border: `${borderW}px solid ${active ? selectedBorder : idleBorder}`,
        background: active ? selectedBg : idleBg,
        boxShadow: active
          ? `0 0 0 1px ${tokens.accentDim}, 0 8px 24px rgba(0,0,0,0.35)`
          : "none",
        color: cellLabelStyle.color?.trim() || tokens.text,
        cursor: "pointer",
        fontFamily: tokens.font,
        overflow: "hidden",
        opacity: disabledLook && !active ? 0.55 : 1,
        transition:
          "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
        ...(active ? selectedCss : idleCss),
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = tokens.bgCellHover;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? selectedBg : idleBg;
      }}
    >
      {active ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: 2,
            background: tokens.accent,
            boxShadow: `0 0 12px ${tokens.accent}`,
          }}
        />
      ) : null}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          placeItems: "center",
          padding: "4px 4px 8px",
        }}
      >
        {iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            style={{
              width: iconCap,
              height: iconCap,
              objectFit: "contain",
              pointerEvents: "none",
              flexShrink: 0,
            }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: iconCap,
              height: iconCap,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 35% 30%, #e8e0d0 0%, #6a7a88 100%)",
              opacity: 0.7,
              flexShrink: 0,
            }}
          />
        )}
      </div>

      <div
        style={{
          lineHeight: 1.25,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          ...labelCss,
        }}
      >
        {label}
      </div>
    </button>
  );
}

/**
 * 详情区顶部大图。
 *
 * padding 放在内层容器上，img 用 maxWidth/maxHeight + object-fit:contain，
 * 避免「宽高 100% + padding」导致图片被裁切、只露出一角。
 *
 * @param props.url - 图片 URL
 * @param props.alt - alt
 * @param props.heroHeight - 大图高度（设计像素，来自 layout.detailPanel.heroHeight）
 * @param props.heroStyle - 大图框样式（来自 layout.detailPanel.heroStyle）
 * @param props.tokens - 视觉 token（无图占位光晕）
 * @returns 预览块
 */
function DetailHeroImage({
  url,
  alt,
  heroHeight,
  heroStyle,
  tokens,
}: {
  url: string;
  alt: string;
  heroHeight: number;
  heroStyle: UiBoxStyle;
  tokens: BackpackTokens;
}): React.ReactElement {
  const heroCss = applyUiBoxStyle(heroStyle);

  return (
    <div
      data-testid="backpack-screen-preview"
      style={{
        width: "100%",
        height: heroHeight,
        maxHeight: "34%",
        flexShrink: 0,
        overflow: "hidden",
        boxSizing: "border-box",
        ...heroCss,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          padding: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {url ? (
          <img
            src={url}
            alt={alt}
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: "100%",
              width: "auto",
              height: "auto",
              objectFit: "contain",
              objectPosition: "center",
            }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 35% 30%, #e8e0d0 0%, #b8a88a 45%, #6a7a88 100%)",
              opacity: 0.85,
              boxShadow: `0 0 40px ${tokens.accentDim}`,
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * @param style - 文本样式
 * @param fallback - label 缺省文案
 */
function textLabelOf(style: UiTextStyle, fallback: string): string {
  const label = style.label?.trim();

  return label && label.length > 0 ? label : fallback;
}

/**
 * 全屏幕背包面板（v2 绝对节点：物品 / 合成 Grid + 详情，大图置顶）。
 *
 * @param props - BackpackScreenProps
 * @returns 全屏 UI
 *
 * @example
 * ```tsx
 * <BackpackScreen
 *   inventory={inv}
 *   items={items}
 *   recipes={recipes}
 *   onCraftRecipe={craft}
 *   onClose={() => setOpen(false)}
 * />
 * ```
 */
export function BackpackScreen({
  inventory,
  items,
  recipes,
  onCraftRecipe,
  onClose,
}: BackpackScreenProps): React.ReactElement {
  const ctx = useExtensionContext();
  const resolve = ctx.asset?.resolve?.bind(ctx.asset);
  const screenCfg = useBackpackScreenConfig();
  const sceneUi = useSceneUiConfig();
  const { size: designSize } = useDesignSize();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });

  const [mode, setMode] = useState<ScreenMode>("items");
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [selectedRecipeKey, setSelectedRecipeKey] = useState<string | null>(
    null,
  );
  const [craftToastQueue, setCraftToastQueue] =
    useState<ToastQueueState>(emptyToastQueue);

  /**
   * 是否正在退场。挂载时固定播入场；仅关闭时切到退场，避免「shown」态重播入场。
   */
  const [exiting, setExiting] = useState(false);
  const closingRef = useRef(false);

  /**
   * 共享布局：与编辑器 backpack-visual-canvas 同源，避免 WYSIWYG 漂移。
   */
  const layout = useMemo(
    () => resolveBackpackLayout(screenCfg),
    [screenCfg],
  );

  const tokens = useMemo(() => buildTokens(layout), [layout]);

  /**
   * 测量宿主尺寸，供 letterbox / scale。
   */
  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const applySize = (w: number, h: number): void => {
      if (w <= 0 || h <= 0) {
        return;
      }

      setHostSize((prev) =>
        prev.w === w && prev.h === h ? prev : { w, h },
      );
    };

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (entry === undefined) {
        return;
      }

      applySize(entry.contentRect.width, entry.contentRect.height);
    });

    ro.observe(host);
    const rect = host.getBoundingClientRect();

    applySize(rect.width, rect.height);

    return () => ro.disconnect();
  }, []);

  const world = useMemo(
    () =>
      fitDesignToHost(
        hostSize.w,
        hostSize.h,
        designSize.width,
        designSize.height,
        1,
      ),
    [hostSize.w, hostSize.h, designSize.width, designSize.height],
  );

  const scale = world.scale > 0 ? world.scale : 0.001;
  const frameW = designSize.width * scale;
  const frameH = designSize.height * scale;

  /**
   * 请求关闭：先播退场，结束后再通知父级卸载。
   *
   * @remarks 退场中重复触发会被忽略。
   */
  const requestClose = useCallback((): void => {
    if (closingRef.current) {
      return;
    }

    closingRef.current = true;
    setExiting(true);
  }, []);

  /** 退场结束后真正关闭（父级卸载本组件） */
  useEffect(() => {
    if (!exiting) {
      return;
    }

    const timer = window.setTimeout(() => {
      onClose();
    }, EXIT_MS);

    return () => window.clearTimeout(timer);
  }, [exiting, onClose]);

  const itemCells = useMemo(
    () => buildItemCells(inventory, items),
    [inventory, items],
  );

  const recipeCells = useMemo(
    () => buildRecipeCells(recipes, items, inventory),
    [recipes, items, inventory],
  );

  const selectedItem = useMemo(() => {
    if (mode === "craft") {
      return null;
    }

    if (selectedItemKey) {
      const hit = itemCells.find((cell) => cell.key === selectedItemKey);

      if (hit) {
        return hit;
      }
    }

    return itemCells[0] ?? null;
  }, [selectedItemKey, itemCells, mode]);

  const selectedRecipe = useMemo(() => {
    if (mode !== "craft") {
      return null;
    }

    if (selectedRecipeKey) {
      const hit = recipeCells.find((cell) => cell.key === selectedRecipeKey);

      if (hit) {
        return hit;
      }
    }

    return recipeCells[0] ?? null;
  }, [selectedRecipeKey, recipeCells, mode]);

  useEffect(() => {
    if (mode === "craft") {
      return;
    }

    if (itemCells.length === 0) {
      setSelectedItemKey(null);

      return;
    }

    if (
      !selectedItemKey ||
      !itemCells.some((cell) => cell.key === selectedItemKey)
    ) {
      setSelectedItemKey(itemCells[0]!.key);
    }
  }, [itemCells, selectedItemKey, mode]);

  useEffect(() => {
    if (mode !== "craft") {
      return;
    }

    if (recipeCells.length === 0) {
      setSelectedRecipeKey(null);

      return;
    }

    if (
      !selectedRecipeKey ||
      !recipeCells.some((cell) => cell.key === selectedRecipeKey)
    ) {
      setSelectedRecipeKey(recipeCells[0]!.key);
    }
  }, [recipeCells, selectedRecipeKey, mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        requestClose();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const backdropAnimation = exiting
    ? `bp-backdrop-out ${EXIT_MS}ms ease forwards`
    : `bp-backdrop-in ${ENTER_MS}ms ease both`;

  const panelAnimation = exiting
    ? `bp-panel-out ${EXIT_MS}ms ease forwards`
    : `bp-panel-in ${ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both`;

  const itemPreviewUrl = resolveAssetUrl(
    selectedItem?.def?.detailImage?.trim() ||
      selectedItem?.def?.icon?.trim() ||
      "",
    resolve,
  );

  const recipePreviewUrl = resolveAssetUrl(
    selectedRecipe?.productDef?.detailImage?.trim() ||
      selectedRecipe?.productDef?.icon?.trim() ||
      "",
    resolve,
  );

  const isCraft = mode === "craft";

  const gridCss = applyUiBoxStyle(layout.itemGrid.style);
  const detailCss = applyUiBoxStyle(layout.detailPanel.style);
  const gridEmptyCss = applyUiTextStyle(layout.itemGrid.emptyStyle);
  const gridEmptyCraftCss = applyUiTextStyle(layout.itemGrid.emptyCraftStyle);
  const detailTitleCss = applyUiTextStyle(layout.detailPanel.titleStyle);
  const detailMetaCss = applyUiTextStyle(layout.detailPanel.metaStyle);
  const detailDescriptionCss = applyUiTextStyle(
    layout.detailPanel.descriptionStyle,
  );
  const detailEmptyCss = applyUiTextStyle(layout.detailPanel.emptyStyle);
  const detailEmptyCraftCss = applyUiTextStyle(
    layout.detailPanel.emptyCraftStyle,
  );
  const detailIngredientsLabelCss = applyUiTextStyle(
    layout.detailPanel.ingredientsLabelStyle,
  );
  const detailIngredientsCss = applyUiTextStyle(
    layout.detailPanel.ingredientsStyle,
  );
  const gridEmptyLabel = textLabelOf(
    layout.itemGrid.emptyStyle,
    "背包是空的",
  );
  const gridEmptyCraftLabel = textLabelOf(
    layout.itemGrid.emptyCraftStyle,
    "暂无配方",
  );
  const emptyItemLabel = textLabelOf(
    layout.detailPanel.emptyStyle,
    "选择物品以查看详情",
  );
  const emptyCraftLabel = textLabelOf(
    layout.detailPanel.emptyCraftStyle,
    "选择配方以查看详情",
  );
  const ingredientsHeading = textLabelOf(
    layout.detailPanel.ingredientsLabelStyle,
    "原料",
  );

  const grid = layout.itemGrid.rect;
  const detail = layout.detailPanel.rect;
  const gridCellMin = layout.itemGrid.cellMin;
  const heroHeight = layout.detailPanel.heroHeight;
  const detailPad = layout.detailPanel.padding;
  const heroStyle = layout.detailPanel.heroStyle;

  const chromeBackdrop = (screenCfg.overlays ?? []).find(
    (el) => el.id === BAG_CHROME_OVERLAY_IDS.backdrop,
  );
  const hostBackdropCss = applyUiBoxStyle(
    chromeBackdrop?.style ?? layout.backdrop.style,
  );

  const showCraftButton = isCraft && Boolean(selectedRecipe);
  const hiddenRoles: UiOverlayRole[] = showCraftButton ? [] : ["craft"];
  const disabledRoles: UiOverlayRole[] =
    selectedRecipe && !selectedRecipe.canCraft ? ["craft"] : [];
  const labelByRole: Partial<Record<UiOverlayRole, string>> = {
    toggleMode: isCraft ? "返回道具" : "合成",
    craft: selectedRecipe?.canCraft === false ? "原料不足" : "合成",
  };

  const showCraftSuccessToast = useCallback((): void => {
    const craftEl = (screenCfg.overlays ?? []).find(
      (el) => el.id === BAG_CHROME_OVERLAY_IDS.craft,
    );
    const rect = craftEl?.rect;
    const anchorX =
      typeof rect?.x === "number" &&
      typeof rect.w === "number" &&
      rect.w > 0
        ? rect.x + rect.w / 2
        : detail.x + detail.w / 2;
    const anchorY =
      typeof rect?.y === "number" ? rect.y : detail.y + detail.h;

    const appearance = resolveItemToastAppearance(sceneUi.itemToast, {
      placement: "above",
      gap: CRAFT_SUCCESS_TOAST_GAP,
    });

    setCraftToastQueue((prev) =>
      enqueueToast(prev, {
        text: "合成成功",
        anchorHotspotId: BAG_CHROME_OVERLAY_IDS.craft,
        anchorPixel: { x: anchorX, y: anchorY },
        motion: CRAFT_SUCCESS_TOAST_MOTION,
        placement: appearance.placement,
        offsetX: appearance.offsetX,
        offsetY: appearance.offsetY,
        gap: appearance.gap,
        style: appearance.style,
      }),
    );
  }, [detail.h, detail.w, detail.x, detail.y, sceneUi.itemToast, screenCfg.overlays]);

  const advanceCraftToast = useCallback((): void => {
    setCraftToastQueue((prev) => advanceToastQueue(prev));
  }, []);

  const handleOverlayAction = useCallback(
    (role: UiOverlayRole): void => {
      if (role === "closeBag") {
        requestClose();

        return;
      }

      if (role === "toggleMode") {
        setMode((prev) => (prev === "craft" ? "items" : "craft"));

        return;
      }

      if (role === "craft" && selectedRecipe?.canCraft) {
        const ok = onCraftRecipe(selectedRecipe.recipe.id);

        if (ok) {
          showCraftSuccessToast();
        }
      }
    },
    [onCraftRecipe, requestClose, selectedRecipe, showCraftSuccessToast],
  );

  return (
    <div
      ref={hostRef}
      data-testid="backpack-screen"
      data-anim={exiting ? "exit" : "enter"}
      role="dialog"
      aria-modal="true"
      aria-label="背包"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        boxSizing: "border-box",
        /* 宿主透明：仅 backdrop 绘制页面色并淡入淡出，避免同色遮挡 */
        background: "transparent",
        color: tokens.text,
        fontFamily: tokens.font,
        pointerEvents: exiting ? "none" : "auto",
        overflow: "hidden",
      }}
    >
      <BackpackMotionStyles />

      {/* 宿主级遮罩：覆盖 letterbox；舞台内另有 mask 组件（同源样式） */}
      <div
        data-testid="backpack-screen-backdrop"
        style={{
          position: "absolute",
          inset: 0,
          background: tokens.bgPage,
          ...hostBackdropCss,
          animation: backdropAnimation,
        }}
      />

      {hostSize.w > 0 && hostSize.h > 0 ? (
        <div
          data-testid="backpack-screen-frame"
          style={{
            position: "absolute",
            left: world.offsetX,
            top: world.offsetY,
            width: frameW,
            height: frameH,
            overflow: "hidden",
          }}
        >
          <div
            data-testid="backpack-screen-stage"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: designSize.width,
              height: designSize.height,
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
            }}
          >
            {/*
              内容包装层：overlays（chrome 组件）+ itemGrid + detailPanel
            */}
            <div
              data-testid="backpack-screen-panel-content"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: designSize.width,
                height: designSize.height,
                transformOrigin: "50% 40%",
                animation: panelAnimation,
              }}
            >
            <UiOverlayLayer
              overlays={screenCfg.overlays ?? []}
              onOverlayAction={handleOverlayAction}
              hiddenRoles={hiddenRoles}
              disabledRoles={disabledRoles}
              labelByRole={labelByRole}
            />

            <div
              data-testid="backpack-craft-toast-host"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1000,
                pointerEvents: "none",
              }}
            >
              <ToastLayer
                queue={craftToastQueue}
                onAdvance={advanceCraftToast}
                hotspots={[]}
                contentRect={{
                  originX: 0,
                  originY: 0,
                  width: designSize.width,
                  height: designSize.height,
                }}
              />
            </div>

            {/* itemGrid */}
            <aside
              data-testid={
                isCraft ? "backpack-screen-craft-grid" : "backpack-screen-grid"
              }
              style={{
                position: "absolute",
                left: grid.x,
                top: grid.y,
                width: grid.w,
                height: grid.h,
                zIndex: layerZIndex(
                  screenCfg.layerOrder,
                  "itemGrid",
                  10,
                ),
                boxSizing: "border-box",
                borderRight: `1px solid ${tokens.border}`,
                background: tokens.bgGrid,
                overflow: "auto",
                padding: 16,
                ...gridCss,
              }}
            >
              {isCraft ? (
                recipeCells.length === 0 ? (
                  <div
                    data-testid="backpack-screen-craft-empty"
                    style={{
                      height: "100%",
                      minHeight: 160,
                      display: "grid",
                      placeItems: "center",
                      ...gridEmptyCraftCss,
                    }}
                  >
                    {gridEmptyCraftLabel}
                  </div>
                ) : (
                  <div
                    role="list"
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(auto-fill, minmax(${gridCellMin}px, 1fr))`,
                      gap: 12,
                      alignContent: "start",
                    }}
                  >
                    {recipeCells.map((cell) => {
                      const icon = resolveAssetUrl(
                        cell.productDef?.icon?.trim() || "",
                        resolve,
                      );

                      return (
                        <GridCellButton
                          key={cell.key}
                          active={selectedRecipe?.key === cell.key}
                          title={`${cell.name} · ${cell.summary}`}
                          testId={`backpack-craft-slot-${cell.recipe.id}`}
                          onClick={() => setSelectedRecipeKey(cell.key)}
                          iconUrl={icon}
                          label={cell.name}
                          disabledLook={!cell.canCraft}
                          tokens={tokens}
                          cellStyle={layout.itemGrid.cellStyle}
                          selectedStyle={layout.itemGrid.selectedStyle}
                          cellLabelStyle={layout.itemGrid.cellLabelStyle}
                          iconMaxSize={layout.itemGrid.iconMaxSize}
                        />
                      );
                    })}
                  </div>
                )
              ) : itemCells.length === 0 ? (
                <div
                  data-testid="backpack-screen-empty"
                  style={{
                    height: "100%",
                    minHeight: 160,
                    display: "grid",
                    placeItems: "center",
                    ...gridEmptyCss,
                  }}
                >
                  {gridEmptyLabel}
                </div>
              ) : (
                <div
                  role="list"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(auto-fill, minmax(${gridCellMin}px, 1fr))`,
                    gap: 12,
                    alignContent: "start",
                  }}
                >
                  {itemCells.map((cell) => {
                    const icon = resolveAssetUrl(
                      cell.def?.icon?.trim() || "",
                      resolve,
                    );

                    return (
                      <GridCellButton
                        key={cell.key}
                        active={selectedItem?.key === cell.key}
                        title={`${cell.name} · ${cell.meta}`}
                        testId="backpack-screen-slot"
                        onClick={() => setSelectedItemKey(cell.key)}
                        iconUrl={icon}
                        label={cell.name}
                        tokens={tokens}
                        cellStyle={layout.itemGrid.cellStyle}
                        selectedStyle={layout.itemGrid.selectedStyle}
                        cellLabelStyle={layout.itemGrid.cellLabelStyle}
                        iconMaxSize={layout.itemGrid.iconMaxSize}
                      />
                    );
                  })}
                </div>
              )}
            </aside>

            {/* detailPanel */}
            <section
              data-testid="backpack-screen-detail"
              style={{
                position: "absolute",
                left: detail.x,
                top: detail.y,
                width: detail.w,
                height: detail.h,
                zIndex: layerZIndex(
                  screenCfg.layerOrder,
                  "detailPanel",
                  10,
                ),
                boxSizing: "border-box",
                minHeight: 0,
                overflow: "auto",
                padding: detailPad,
                display: "flex",
                flexDirection: "column",
                gap: 16,
                ...detailCss,
              }}
            >
              {isCraft ? (
                !selectedRecipe ? (
                  <div
                    style={{
                      flex: 1,
                      display: "grid",
                      placeItems: "center",
                      ...detailEmptyCraftCss,
                    }}
                  >
                    {emptyCraftLabel}
                  </div>
                ) : (
                  <>
                    <DetailHeroImage
                      url={recipePreviewUrl}
                      alt={selectedRecipe.name}
                      heroHeight={heroHeight}
                      heroStyle={heroStyle}
                      tokens={tokens}
                    />

                    <div>
                      <h2
                        style={{
                          margin: "0 0 8px",
                          letterSpacing: "0.02em",
                          ...detailTitleCss,
                        }}
                      >
                        {selectedRecipe.name}
                      </h2>
                      <div style={detailMetaCss}>
                        {selectedRecipe.canCraft ? "可合成" : "原料不足"}
                      </div>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        lineHeight: 1.75,
                        whiteSpace: "pre-wrap",
                        ...detailDescriptionCss,
                      }}
                    >
                      {selectedRecipe.recipe.description?.trim() ||
                        `需要：${selectedRecipe.summary}`}
                    </p>

                    <div
                      style={{
                        lineHeight: 1.6,
                        ...detailIngredientsCss,
                      }}
                    >
                      <div
                        style={{
                          marginBottom: 4,
                          ...detailIngredientsLabelCss,
                        }}
                      >
                        {ingredientsHeading}
                      </div>
                      {selectedRecipe.summary}
                    </div>
                  </>
                )
              ) : !selectedItem ? (
                <div
                  style={{
                    flex: 1,
                    display: "grid",
                    placeItems: "center",
                    ...detailEmptyCss,
                  }}
                >
                  {emptyItemLabel}
                </div>
              ) : (
                <>
                  <DetailHeroImage
                    url={itemPreviewUrl}
                    alt={selectedItem.name}
                    heroHeight={heroHeight}
                    heroStyle={heroStyle}
                    tokens={tokens}
                  />

                  <div>
                    <h2
                      style={{
                        margin: "0 0 8px",
                        letterSpacing: "0.02em",
                        ...detailTitleCss,
                      }}
                    >
                      {selectedItem.name}
                    </h2>
                    <div style={detailMetaCss}>{selectedItem.meta}</div>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      maxWidth: 560,
                      lineHeight: 1.75,
                      whiteSpace: "pre-wrap",
                      ...detailDescriptionCss,
                    }}
                  >
                    {selectedItem.def?.description?.trim() || "暂无描述。"}
                  </p>
                </>
              )}
            </section>

            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
