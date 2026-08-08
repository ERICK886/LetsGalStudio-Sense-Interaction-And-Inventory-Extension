/**
 * backpack-screen.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.5.0
 *
 * 背包全屏幕 UI（v2 节点布局）：
 * - 配置经 useBackpackScreenConfig → resolveBackpackLayout 解析；
 * - 设计分辨率 letterbox 舞台上绝对定位 backdrop / panelChrome / titleBlock /
 *   closeButton / itemGrid / detailPanel；合成钮锚定详情底边 + offsetY；
 * - 样式经 applyUiBoxStyle / applyUiTextStyle，缺省色由 accent 派生；
 * - 入场 / 退场动画挂在 backdrop + panelChrome；交互（选中 / 合成 / 关闭 / 模式切换）不变。
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
import { findItem } from "../domain/item-registry";
import {
  resolveBackpackLayout,
  type ResolvedBackpackLayout,
} from "../domain/backpack-layout";
import {
  accentAlpha,
  applyUiBoxStyle,
  applyUiTextStyle,
} from "../domain/ui-style";
import type {
  InventoryEntry,
  InventoryState,
  ItemDefinition,
  RecipeDefinition,
  UiBoxStyle,
} from "../domain/types";
import { formatIngredientSummary } from "../runtime/craft-panel";
import { fitDesignToHost } from "../shared/scene-layout";
import { resolveAssetUrl } from "../shared/resolve-asset-url";
import { useBackpackScreenConfig } from "../store/use-backpack-ui-config";
import { useDesignSize } from "../store/use-design-size";

/** 入场动画时长（毫秒） */
const ENTER_MS = 320;

/** 退场动画时长（毫秒） */
const EXIT_MS = 240;

/** 合成按钮预览 / 运行时默认高度（设计像素） */
const CRAFT_BUTTON_H = 44;

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
 * 合成按钮在设计舞台上的绝对矩形（贴详情底边 + offsetY）。
 *
 * @param layout - 解析布局
 * @returns Required rect（设计像素）
 *
 * @example
 * ```ts
 * const r = craftButtonRect(layout);
 * // r.y === detail.y + detail.h - pad - h + offsetY
 * ```
 */
function craftButtonRect(
  layout: ResolvedBackpackLayout,
): { x: number; y: number; w: number; h: number } {
  const detail = layout.detailPanel.rect;
  const pad = Math.max(8, layout.detailPanel.padding);
  const w = Math.max(48, detail.w - pad * 2);
  const h = CRAFT_BUTTON_H;
  const x = detail.x + pad;
  const y = detail.y + detail.h - pad - h + layout.craftButton.offsetY;

  return { x, y, w, h };
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
   */
  onCraftRecipe: (recipeId: string) => void;

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
 * @param props.selectedStyle - 选中态盒样式（来自 layout.itemGrid.selectedStyle）
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
  selectedStyle,
}: {
  active: boolean;
  title: string;
  testId: string;
  onClick: () => void;
  iconUrl: string;
  label: string;
  disabledLook?: boolean;
  tokens: BackpackTokens;
  selectedStyle: UiBoxStyle;
}): React.ReactElement {
  const selectedCss = applyUiBoxStyle(selectedStyle);
  const selectedBorder =
    selectedStyle.borderColor?.trim() || tokens.accent;
  const selectedBg =
    selectedStyle.background?.trim() || tokens.bgCellSelected;

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
        borderRadius: selectedStyle.borderRadius ?? 12,
        border: active
          ? `${selectedStyle.borderWidth ?? 1}px solid ${selectedBorder}`
          : `1px solid ${tokens.border}`,
        background: active ? selectedBg : tokens.bgCell,
        boxShadow: active
          ? `0 0 0 1px ${tokens.accentDim}, 0 8px 24px rgba(0,0,0,0.35)`
          : "none",
        color: tokens.text,
        cursor: "pointer",
        fontFamily: tokens.font,
        overflow: "hidden",
        opacity: disabledLook && !active ? 0.55 : 1,
        transition:
          "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
        ...(active ? selectedCss : null),
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = tokens.bgCellHover;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active
          ? selectedBg
          : tokens.bgCell;
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
              width: "70%",
              height: "70%",
              maxWidth: 64,
              maxHeight: 64,
              objectFit: "contain",
              pointerEvents: "none",
            }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 35% 30%, #e8e0d0 0%, #6a7a88 100%)",
              opacity: 0.7,
            }}
          />
        )}
      </div>

      <div
        style={{
          fontSize: 12,
          fontWeight: 650,
          lineHeight: 1.25,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
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
 * @param props.tokens - 视觉 token
 * @returns 预览块
 */
function DetailHeroImage({
  url,
  alt,
  heroHeight,
  tokens,
}: {
  url: string;
  alt: string;
  heroHeight: number;
  tokens: BackpackTokens;
}): React.ReactElement {
  return (
    <div
      data-testid="backpack-screen-preview"
      style={{
        width: "100%",
        height: heroHeight,
        maxHeight: "34%",
        flexShrink: 0,
        borderRadius: 14,
        border: `1px solid ${tokens.border}`,
        background: tokens.bgPreview,
        overflow: "hidden",
        boxSizing: "border-box",
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
  const { size: designSize } = useDesignSize();

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hostSize, setHostSize] = useState({ w: 0, h: 0 });

  const [mode, setMode] = useState<ScreenMode>("items");
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [selectedRecipeKey, setSelectedRecipeKey] = useState<string | null>(
    null,
  );

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

  const backdropCss = applyUiBoxStyle(layout.backdrop.style);
  const panelCss = applyUiBoxStyle(layout.panelChrome.style);
  const gridCss = applyUiBoxStyle(layout.itemGrid.style);
  const detailCss = applyUiBoxStyle(layout.detailPanel.style);
  const closeBoxCss = applyUiBoxStyle(layout.closeButton.style);
  const closeTextCss = applyUiTextStyle(layout.closeButton.style);
  const craftBoxCss = applyUiBoxStyle(layout.craftButton.style);
  const craftTextCss = applyUiTextStyle(layout.craftButton.style);
  const eyebrowCss = applyUiTextStyle(layout.titleBlock.eyebrow);
  const titleCss = applyUiTextStyle(layout.titleBlock.title);
  const modeLinkCss = applyUiTextStyle(layout.titleBlock.modeLink);

  const titleEyebrow =
    layout.titleBlock.eyebrow.label?.trim() || "INVENTORY";
  const titleLabel = isCraft
    ? "合成"
    : layout.titleBlock.title.label?.trim() || "道具";
  const modeLinkLabel = isCraft
    ? "返回道具"
    : layout.titleBlock.modeLink.label?.trim() || "打开合成";
  const closeLabel = layout.closeButton.style.label?.trim() || "×";
  const craftLabel = layout.craftButton.style.label?.trim() || "合成";

  const panel = layout.panelChrome.rect;
  const title = layout.titleBlock.rect;
  const close = layout.closeButton.rect;
  const grid = layout.itemGrid.rect;
  const detail = layout.detailPanel.rect;
  const craftRect = craftButtonRect(layout);
  const gridCellMin = layout.itemGrid.cellMin;
  const heroHeight = layout.detailPanel.heroHeight;
  const detailPad = layout.detailPanel.padding;

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
        background: tokens.bgPage,
        color: tokens.text,
        fontFamily: tokens.font,
        pointerEvents: exiting ? "none" : "auto",
        overflow: "hidden",
      }}
    >
      <BackpackMotionStyles />

      {/* backdrop：铺满宿主，入场 / 退场动画 */}
      <div
        data-testid="backpack-screen-backdrop"
        style={{
          position: "absolute",
          inset: 0,
          background: tokens.bgPage,
          ...backdropCss,
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
            {/* panelChrome：底板 + 面板动画 */}
            <div
              data-testid="backpack-screen-panel"
              style={{
                position: "absolute",
                left: panel.x,
                top: panel.y,
                width: panel.w,
                height: panel.h,
                boxSizing: "border-box",
                borderRadius: 18,
                border: `1px solid ${tokens.border}`,
                background: tokens.bgPanel,
                boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
                overflow: "hidden",
                transformOrigin: "50% 40%",
                ...panelCss,
                animation: panelAnimation,
              }}
            />

            {/* titleBlock */}
            <div
              data-testid="backpack-screen-title"
              style={{
                position: "absolute",
                left: title.x,
                top: title.y,
                width: title.w,
                height: title.h,
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 4,
                pointerEvents: "auto",
              }}
            >
              <div
                style={{
                  color: tokens.accent,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.22em",
                  ...eyebrowCss,
                }}
              >
                {titleEyebrow}
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 36,
                  fontWeight: 750,
                  letterSpacing: "0.04em",
                  color: tokens.text,
                  lineHeight: 1.1,
                  ...titleCss,
                }}
              >
                {titleLabel}
              </h1>
              <div
                style={{
                  marginTop: 6,
                  width: 44,
                  height: 3,
                  borderRadius: 2,
                  background: tokens.accent,
                }}
              />
              <button
                type="button"
                data-testid="backpack-screen-mode-toggle"
                onClick={() => setMode(isCraft ? "items" : "craft")}
                style={{
                  appearance: "none",
                  marginTop: 8,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: tokens.accent,
                  fontSize: 13,
                  fontFamily: tokens.font,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 4,
                  textAlign: "left",
                  ...modeLinkCss,
                }}
              >
                {modeLinkLabel}
              </button>
            </div>

            {/* closeButton */}
            <button
              type="button"
              data-testid="backpack-screen-close"
              aria-label="关闭背包"
              onClick={requestClose}
              style={{
                appearance: "none",
                position: "absolute",
                left: close.x,
                top: close.y,
                width: close.w,
                height: close.h,
                boxSizing: "border-box",
                display: "grid",
                placeItems: "center",
                borderRadius: 10,
                border: `1px solid ${tokens.border}`,
                background: "rgba(255,255,255,0.06)",
                color: tokens.text,
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer",
                fontFamily: tokens.font,
                ...closeBoxCss,
                ...closeTextCss,
              }}
            >
              {closeLabel}
            </button>

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
                      color: tokens.textMuted,
                      fontSize: 14,
                    }}
                  >
                    暂无配方
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
                          selectedStyle={layout.itemGrid.selectedStyle}
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
                    color: tokens.textMuted,
                    fontSize: 14,
                  }}
                >
                  背包是空的
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
                        selectedStyle={layout.itemGrid.selectedStyle}
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
                      color: tokens.textMuted,
                      fontSize: 14,
                    }}
                  >
                    选择配方以查看详情
                  </div>
                ) : (
                  <>
                    <DetailHeroImage
                      url={recipePreviewUrl}
                      alt={selectedRecipe.name}
                      heroHeight={heroHeight}
                      tokens={tokens}
                    />

                    <div>
                      <h2
                        style={{
                          margin: "0 0 8px",
                          fontSize: 28,
                          fontWeight: 750,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {selectedRecipe.name}
                      </h2>
                      <div
                        style={{
                          color: tokens.accent,
                          fontSize: 14,
                          fontWeight: 600,
                        }}
                      >
                        {selectedRecipe.canCraft ? "可合成" : "原料不足"}
                      </div>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: 15,
                        lineHeight: 1.75,
                        color: tokens.textSoft,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {selectedRecipe.recipe.description?.trim() ||
                        `需要：${selectedRecipe.summary}`}
                    </p>

                    <div
                      style={{
                        fontSize: 13,
                        color: tokens.textMuted,
                        lineHeight: 1.6,
                      }}
                    >
                      <div
                        style={{ marginBottom: 4, color: tokens.textSoft }}
                      >
                        原料
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
                    color: tokens.textMuted,
                    fontSize: 14,
                  }}
                >
                  选择物品以查看详情
                </div>
              ) : (
                <>
                  <DetailHeroImage
                    url={itemPreviewUrl}
                    alt={selectedItem.name}
                    heroHeight={heroHeight}
                    tokens={tokens}
                  />

                  <div>
                    <h2
                      style={{
                        margin: "0 0 8px",
                        fontSize: 28,
                        fontWeight: 750,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {selectedItem.name}
                    </h2>
                    <div
                      style={{
                        color: tokens.accent,
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {selectedItem.meta}
                    </div>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      maxWidth: 560,
                      fontSize: 15,
                      lineHeight: 1.75,
                      color: tokens.textSoft,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {selectedItem.def?.description?.trim() || "暂无描述。"}
                  </p>
                </>
              )}
            </section>

            {/* craftButton：详情底边 + offsetY；仅合成模式显示 */}
            {isCraft && selectedRecipe ? (
              <button
                type="button"
                data-testid={`craft-button-${selectedRecipe.recipe.id}`}
                disabled={!selectedRecipe.canCraft}
                onClick={() => {
                  if (selectedRecipe.canCraft) {
                    onCraftRecipe(selectedRecipe.recipe.id);
                  }
                }}
                style={{
                  appearance: "none",
                  position: "absolute",
                  left: craftRect.x,
                  top: craftRect.y,
                  width: craftRect.w,
                  height: craftRect.h,
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 18px",
                  fontSize: 15,
                  fontFamily: tokens.font,
                  fontWeight: 700,
                  cursor: selectedRecipe.canCraft
                    ? "pointer"
                    : "not-allowed",
                  background: selectedRecipe.canCraft
                    ? tokens.accent
                    : "rgba(255,255,255,0.08)",
                  color: selectedRecipe.canCraft
                    ? tokens.accentTextOn
                    : tokens.textMuted,
                  opacity: selectedRecipe.canCraft ? 1 : 0.7,
                  ...craftBoxCss,
                  ...craftTextCss,
                  ...(selectedRecipe.canCraft
                    ? null
                    : {
                        background: "rgba(255,255,255,0.08)",
                        color: tokens.textMuted,
                      }),
                }}
              >
                {selectedRecipe.canCraft ? craftLabel : "原料不足"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
