/**
 * backpack-screen.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.8
 *
 * 背包全屏幕 UI：
 * 深色底 + 青绿强调；顶栏 INVENTORY / 道具；
 * 物品 / 合成均为 CSS Grid + 右侧详情；详情大图置顶；
 * 无分类胶囊 tag（道具/合成由顶栏文字切换）；
 * 入场 / 退场动画（退场结束后再 onClose 卸载）。
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
import type {
  InventoryEntry,
  InventoryState,
  ItemDefinition,
  RecipeDefinition,
} from "../domain/types";
import { formatIngredientSummary } from "../runtime/craft-panel";
import { resolveAssetUrl } from "../shared/resolve-asset-url";

/**
 * 背包视觉 token（固定暗色青绿主题）。
 */
const BP = {
  bgPage: "#05080c",
  bgPanel: "rgba(14, 18, 24, 0.92)",
  bgGrid: "rgba(10, 14, 20, 0.55)",
  bgCell: "rgba(255, 255, 255, 0.03)",
  bgCellHover: "rgba(255, 255, 255, 0.06)",
  bgCellSelected: "rgba(100, 224, 208, 0.12)",
  bgPreview: "linear-gradient(145deg, #1a3a3c 0%, #0d1a28 55%, #0a1220 100%)",
  accent: "#64e0d0",
  accentDim: "rgba(100, 224, 208, 0.14)",
  accentTextOn: "#061012",
  text: "#f2f5f7",
  textMuted: "rgba(200, 210, 220, 0.55)",
  textSoft: "rgba(220, 230, 235, 0.82)",
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(100, 224, 208, 0.28)",
  font: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
} as const;

/** Grid 槽位最小边长（px） */
const GRID_CELL_MIN = 104;

/** 入场动画时长（毫秒） */
const ENTER_MS = 320;

/** 退场动画时长（毫秒） */
const EXIT_MS = 240;

/** 主界面模式：物品列表 / 合成 */
type ScreenMode = "items" | "craft";

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
      @keyframes bp-header-in {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
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
}: {
  active: boolean;
  title: string;
  testId: string;
  onClick: () => void;
  iconUrl: string;
  label: string;
  disabledLook?: boolean;
}): React.ReactElement {
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
        borderRadius: 12,
        border: active
          ? `1px solid ${BP.accent}`
          : `1px solid ${BP.border}`,
        background: active ? BP.bgCellSelected : BP.bgCell,
        boxShadow: active
          ? `0 0 0 1px ${BP.accentDim}, 0 8px 24px rgba(0,0,0,0.35)`
          : "none",
        color: BP.text,
        cursor: "pointer",
        fontFamily: BP.font,
        overflow: "hidden",
        opacity: disabledLook && !active ? 0.55 : 1,
        transition:
          "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = BP.bgCellHover;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active
          ? BP.bgCellSelected
          : BP.bgCell;
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
            background: BP.accent,
            boxShadow: `0 0 12px ${BP.accent}`,
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
 * @returns 预览块
 */
function DetailHeroImage({
  url,
  alt,
}: {
  url: string;
  alt: string;
}): React.ReactElement {
  return (
    <div
      data-testid="backpack-screen-preview"
      style={{
        width: "100%",
        height: "min(280px, 34vh)",
        flexShrink: 0,
        borderRadius: 14,
        border: `1px solid ${BP.border}`,
        background: BP.bgPreview,
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
              boxShadow: `0 0 40px ${BP.accentDim}`,
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 全屏幕背包面板（物品 / 合成均为 Grid + 右侧详情，大图置顶）。
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

  const headerAnimation = exiting
    ? `bp-backdrop-out ${EXIT_MS}ms ease forwards`
    : `bp-header-in ${ENTER_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both`;

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

  return (
    <div
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
        padding: "clamp(20px, 4vw, 48px) clamp(24px, 5vw, 64px)",
        background: BP.bgPage,
        color: BP.text,
        fontFamily: BP.font,
        pointerEvents: exiting ? "none" : "auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        animation: backdropAnimation,
      }}
    >
      <BackpackMotionStyles />

      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
          flexShrink: 0,
          animation: headerAnimation,
        }}
      >
        <div>
          <div
            style={{
              color: BP.accent,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.22em",
              marginBottom: 6,
            }}
          >
            INVENTORY
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(28px, 3.2vw, 40px)",
              fontWeight: 750,
              letterSpacing: "0.04em",
              color: BP.text,
              lineHeight: 1.1,
            }}
          >
            {isCraft ? "合成" : "道具"}
          </h1>
          <div
            style={{
              marginTop: 10,
              width: 44,
              height: 3,
              borderRadius: 2,
              background: BP.accent,
            }}
          />
          <button
            type="button"
            data-testid="backpack-screen-mode-toggle"
            onClick={() => setMode(isCraft ? "items" : "craft")}
            style={{
              appearance: "none",
              marginTop: 14,
              padding: 0,
              border: "none",
              background: "transparent",
              color: BP.accent,
              fontSize: 13,
              fontFamily: BP.font,
              fontWeight: 600,
              letterSpacing: "0.08em",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 4,
            }}
          >
            {isCraft ? "返回道具" : "打开合成"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
          }}
        >
          <button
            type="button"
            data-testid="backpack-screen-close"
            aria-label="关闭背包"
            onClick={requestClose}
            style={{
              appearance: "none",
              width: 40,
              height: 40,
              borderRadius: 8,
              border: `1px solid ${BP.border}`,
              background: "rgba(255,255,255,0.04)",
              color: BP.text,
              fontSize: 20,
              lineHeight: 1,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            ×
          </button>
          <span
            style={{
              fontSize: 11,
              color: BP.textMuted,
              letterSpacing: "0.14em",
              fontWeight: 600,
            }}
          >
            {isCraft
              ? "SELECT A RECIPE · CRAFT"
              : "SELECT AN ITEM · VIEW DETAILS"}
          </span>
        </div>
      </header>

      <div
        data-testid="backpack-screen-panel"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          borderRadius: 18,
          border: `1px solid ${BP.border}`,
          background: BP.bgPanel,
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          overflow: "hidden",
          animation: panelAnimation,
          transformOrigin: "50% 40%",
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 36%)",
          }}
        >
          {/* 左：物品 / 合成 Grid */}
          <aside
            data-testid={
              isCraft ? "backpack-screen-craft-grid" : "backpack-screen-grid"
            }
            style={{
              borderRight: `1px solid ${BP.border}`,
              background: BP.bgGrid,
              overflow: "auto",
              minHeight: 0,
              padding: 16,
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
                    color: BP.textMuted,
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
                    gridTemplateColumns: `repeat(auto-fill, minmax(${GRID_CELL_MIN}px, 1fr))`,
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
                  color: BP.textMuted,
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
                  gridTemplateColumns: `repeat(auto-fill, minmax(${GRID_CELL_MIN}px, 1fr))`,
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
                    />
                  );
                })}
              </div>
            )}
          </aside>

          {/* 右：详情（大图置顶） */}
          <section
            data-testid="backpack-screen-detail"
            style={{
              minHeight: 0,
              overflow: "auto",
              padding: "24px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {isCraft ? (
              !selectedRecipe ? (
                <div
                  style={{
                    flex: 1,
                    display: "grid",
                    placeItems: "center",
                    color: BP.textMuted,
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
                  />

                  <div>
                    <h2
                      style={{
                        margin: "0 0 8px",
                        fontSize: "clamp(24px, 2.4vw, 32px)",
                        fontWeight: 750,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {selectedRecipe.name}
                    </h2>
                    <div
                      style={{
                        color: BP.accent,
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
                      color: BP.textSoft,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {selectedRecipe.recipe.description?.trim() ||
                      `需要：${selectedRecipe.summary}`}
                  </p>

                  <div
                    style={{
                      fontSize: 13,
                      color: BP.textMuted,
                      lineHeight: 1.6,
                    }}
                  >
                    <div style={{ marginBottom: 4, color: BP.textSoft }}>
                      原料
                    </div>
                    {selectedRecipe.summary}
                  </div>

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
                      marginTop: "auto",
                      alignSelf: "stretch",
                      border: "none",
                      borderRadius: 10,
                      padding: "12px 18px",
                      fontSize: 15,
                      fontFamily: BP.font,
                      fontWeight: 700,
                      cursor: selectedRecipe.canCraft
                        ? "pointer"
                        : "not-allowed",
                      background: selectedRecipe.canCraft
                        ? BP.accent
                        : "rgba(255,255,255,0.08)",
                      color: selectedRecipe.canCraft
                        ? BP.accentTextOn
                        : BP.textMuted,
                      opacity: selectedRecipe.canCraft ? 1 : 0.7,
                    }}
                  >
                    {selectedRecipe.canCraft ? "合成" : "原料不足"}
                  </button>
                </>
              )
            ) : !selectedItem ? (
              <div
                style={{
                  flex: 1,
                  display: "grid",
                  placeItems: "center",
                  color: BP.textMuted,
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
                />

                <div>
                  <h2
                    style={{
                      margin: "0 0 8px",
                      fontSize: "clamp(24px, 2.4vw, 32px)",
                      fontWeight: 750,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {selectedItem.name}
                  </h2>
                  <div
                    style={{
                      color: BP.accent,
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
                    color: BP.textSoft,
                    whiteSpace: "pre-wrap",
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
  );
}
