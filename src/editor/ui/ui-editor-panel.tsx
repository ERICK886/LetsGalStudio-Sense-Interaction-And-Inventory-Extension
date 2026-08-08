/**
 * ui-editor-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.6.0
 *
 * 编辑器「UI」分区：快捷栏 HUD / 全屏背包可视化编辑。
 * - 配置写入 backpack-hud.settings；支持撤销/重做（桥接顶栏）
 * - 多选 + 显式对齐；右侧属性（单选节点 / 全局）
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  defaultBackpackScreen,
  resetBackpackScreenNode,
} from "../../domain/backpack-screen-config";
import { resolveBackpackLayout } from "../../domain/backpack-layout";
import { resolveHudLayout } from "../../domain/hud-layout";
import {
  defaultInventoryHud,
  normalizeInventoryHud,
  resetInventoryHudNode,
} from "../../domain/inventory-hud";
import {
  parseBackpackScreenJson,
  parseInventoryHudJson,
  stringifyBackpackScreen,
  stringifyInventoryHud,
} from "../../domain/serialize";
import type {
  BackpackNodeId,
  BackpackScreenConfig,
  InventoryHudConfig,
  UiRect,
} from "../../domain/types";
import {
  backpackScreenGlobalFields,
  backpackScreenNodeFields,
} from "../../schema/backpack-screen-schema";
import {
  inventoryHudGlobalFields,
  inventoryHudNodeFields,
  type HudNodeId,
} from "../../schema/inventory-hud-schema";
import { FormRenderer } from "../../schema/form-renderer";
import { createHistory } from "../../store/history";
import {
  BACKPACK_SCREEN_JSON_KEY,
  INVENTORY_HUD_JSON_KEY,
  readHudSetting,
  writeHudSetting,
} from "../../store/hud-settings";
import { notifySettingsField } from "../../store/settings-sync";
import {
  notifyUiHistoryTick,
  registerUiHistoryBridge,
} from "../../store/ui-edit-history-bridge";
import { useDesignSize } from "../../store/use-design-size";
import {
  FONT_SIZE_DEFAULT,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";
import type { AlignMode } from "./align-nodes";
import {
  alignRects,
  toggleOrReplaceSelection,
  type AlignableRect,
} from "./align-nodes";
import { AlignToolbar } from "./align-toolbar";
import { BackpackVisualCanvas } from "./backpack-visual-canvas";
import { HudVisualCanvas } from "./hud-visual-canvas";
import { ItemToastEditorPanel } from "./item-toast-editor-panel";

/** UI 子分区 */
type UiSubSection = "hud" | "backpack" | "itemToast";

/** 可对齐的背包节点（排除 backdrop / craftButton） */
const BAG_ALIGNABLE: readonly BackpackNodeId[] = [
  "panelChrome",
  "titleBlock",
  "closeButton",
  "itemGrid",
  "detailPanel",
];

/**
 * 从 settings 读取并解析 HUD 配置。
 *
 * @param ctx - 上下文
 * @returns InventoryHudConfig
 */
function loadHud(ctx: ReturnType<typeof useExtensionContext>): InventoryHudConfig {
  const raw = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);

  return parseInventoryHudJson(
    typeof raw === "string" ? raw : String(raw ?? ""),
  );
}

/**
 * @param ctx - 上下文
 * @returns BackpackScreenConfig
 */
function loadBackpackScreen(
  ctx: ReturnType<typeof useExtensionContext>,
): BackpackScreenConfig {
  const raw = readHudSetting(ctx, BACKPACK_SCREEN_JSON_KEY);

  return parseBackpackScreenJson(
    typeof raw === "string" ? raw : String(raw ?? ""),
  );
}

/**
 * @param tokens - 主题
 * @param primary - 强调
 */
function resetButtonStyle(
  tokens: ThemeTokens,
  primary: boolean,
): React.CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${primary ? tokens.accent : tokens.borderStrong}`,
    background: primary ? `${tokens.accent}18` : tokens.bgSunken,
    color: tokens.textPrimary,
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: 500,
    cursor: "pointer",
    width: "100%",
    textAlign: "left" as const,
  };
}

/**
 * 将 HUD 多选节点按模式对齐并返回新配置。
 *
 * @param hud - 当前配置
 * @param ids - 选中 id
 * @param mode - 对齐模式
 * @returns 新配置；无法对齐时返回原配置
 */
function applyHudAlign(
  hud: InventoryHudConfig,
  ids: readonly HudNodeId[],
  mode: AlignMode,
): InventoryHudConfig {
  const layout = resolveHudLayout(hud);
  const items: AlignableRect[] = [];

  for (const id of ids) {
    if (id === "quickbarRoot") {
      const slots = layout.slots;

      if (slots.length === 0) {
        continue;
      }

      let minX = slots[0]!.x;
      let minY = slots[0]!.y;
      let maxX = slots[0]!.x + slots[0]!.w;
      let maxY = slots[0]!.y + slots[0]!.h;

      for (const s of slots) {
        minX = Math.min(minX, s.x);
        minY = Math.min(minY, s.y);
        maxX = Math.max(maxX, s.x + s.w);
        maxY = Math.max(maxY, s.y + s.h);
      }

      items.push({
        id,
        rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      });
    } else if (id === "openBagButton") {
      items.push({
        id,
        rect: { ...layout.openBagButton },
      });
    }
  }

  const aligned = alignRects(items, mode);

  if (aligned.size === 0) {
    return hud;
  }

  let next = hud;

  for (const [id, rect] of aligned) {
    if (id === "quickbarRoot") {
      const old = items.find((i) => i.id === "quickbarRoot")!.rect;
      const dx = rect.x - old.x;
      const dy = rect.y - old.y;

      next = {
        ...next,
        nodes: {
          ...next.nodes,
          quickbarRoot: {
            ...next.nodes.quickbarRoot,
            rect: {
              x: Math.max(0, next.nodes.quickbarRoot.rect.x + dx),
              y: Math.max(0, next.nodes.quickbarRoot.rect.y + dy),
            },
          },
        },
      };
    } else if (id === "openBagButton") {
      next = {
        ...next,
        nodes: {
          ...next.nodes,
          openBagButton: {
            ...next.nodes.openBagButton,
            layout: "absolute",
            rect: {
              x: rect.x,
              y: rect.y,
              w: rect.w,
              h: rect.h,
            },
          },
        },
      };
    }
  }

  return next;
}

/**
 * 将背包多选节点对齐。
 *
 * @param bag - 当前配置
 * @param ids - 选中 id
 * @param mode - 对齐模式
 */
function applyBagAlign(
  bag: BackpackScreenConfig,
  ids: readonly BackpackNodeId[],
  mode: AlignMode,
): BackpackScreenConfig {
  const layout = resolveBackpackLayout(bag);
  const items: AlignableRect[] = [];

  for (const id of ids) {
    if (!BAG_ALIGNABLE.includes(id)) {
      continue;
    }

    const node = layout[id as keyof typeof layout] as {
      rect?: Required<UiRect>;
    };

    if (node?.rect) {
      items.push({ id, rect: { ...node.rect } });
    }
  }

  const aligned = alignRects(items, mode);

  if (aligned.size === 0) {
    return bag;
  }

  let nextNodes = { ...bag.nodes };

  for (const [id, rect] of aligned) {
    const key = id as BackpackNodeId;
    const prev = nextNodes[key] as { rect?: UiRect };

    nextNodes = {
      ...nextNodes,
      [key]: {
        ...prev,
        rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      },
    };
  }

  return { ...bag, nodes: nextNodes };
}

/**
 * 编辑器 UI 可视化主面板。
 *
 * @returns UI 编辑器
 */
export function UiEditorPanel(): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const { size: designSize } = useDesignSize();

  const [sub, setSub] = useState<UiSubSection>("hud");
  const [hud, setHud] = useState<InventoryHudConfig>(() => loadHud(ctx));
  const [bag, setBag] = useState<BackpackScreenConfig>(() =>
    loadBackpackScreen(ctx),
  );

  const [selectedHudIds, setSelectedHudIds] = useState<HudNodeId[]>([]);
  const [selectedBagIds, setSelectedBagIds] = useState<BackpackNodeId[]>([]);

  const hudHistoryRef = useRef(createHistory<InventoryHudConfig>());
  const bagHistoryRef = useRef(createHistory<BackpackScreenConfig>());
  const hudSeededRef = useRef(false);
  const bagSeededRef = useRef(false);
  const skipHudHistoryRef = useRef(false);
  const skipBagHistoryRef = useRef(false);
  const subRef = useRef(sub);

  subRef.current = sub;

  useEffect(() => {
    setHud(loadHud(ctx));
    setBag(loadBackpackScreen(ctx));
  }, [ctx]);

  useEffect(() => {
    if (!hudSeededRef.current) {
      hudHistoryRef.current.push(hud);
      hudSeededRef.current = true;
      notifyUiHistoryTick();
    }
  }, [hud]);

  useEffect(() => {
    if (!bagSeededRef.current) {
      bagHistoryRef.current.push(bag);
      bagSeededRef.current = true;
      notifyUiHistoryTick();
    }
  }, [bag]);

  const writeHudOnly = useCallback(
    (normalized: InventoryHudConfig): void => {
      setHud(normalized);
      writeHudSetting(
        ctx,
        INVENTORY_HUD_JSON_KEY,
        stringifyInventoryHud(normalized),
      );
      notifySettingsField(INVENTORY_HUD_JSON_KEY);
    },
    [ctx],
  );

  const writeBagOnly = useCallback(
    (next: BackpackScreenConfig): void => {
      setBag(next);
      writeHudSetting(
        ctx,
        BACKPACK_SCREEN_JSON_KEY,
        stringifyBackpackScreen(next),
      );
      notifySettingsField(BACKPACK_SCREEN_JSON_KEY);
    },
    [ctx],
  );

  const persistHud = useCallback(
    (next: InventoryHudConfig): void => {
      const normalized = normalizeInventoryHud(next);

      if (!skipHudHistoryRef.current) {
        hudHistoryRef.current.push(normalized);
        notifyUiHistoryTick();
      }

      skipHudHistoryRef.current = false;
      writeHudOnly(normalized);
    },
    [writeHudOnly],
  );

  const persistBag = useCallback(
    (next: BackpackScreenConfig): void => {
      if (!skipBagHistoryRef.current) {
        bagHistoryRef.current.push(next);
        notifyUiHistoryTick();
      }

      skipBagHistoryRef.current = false;
      writeBagOnly(next);
    },
    [writeBagOnly],
  );

  useEffect(() => {
    registerUiHistoryBridge({
      undo(): boolean {
        if (subRef.current === "hud") {
          const next = hudHistoryRef.current.undo();

          if (next === undefined) {
            return false;
          }

          skipHudHistoryRef.current = true;
          writeHudOnly(hudHistoryRef.current.present ?? next);
          notifyUiHistoryTick();

          return true;
        }

        if (subRef.current === "itemToast") {
          return false;
        }

        const next = bagHistoryRef.current.undo();

        if (next === undefined) {
          return false;
        }

        skipBagHistoryRef.current = true;
        writeBagOnly(bagHistoryRef.current.present ?? next);
        notifyUiHistoryTick();

        return true;
      },
      redo(): boolean {
        if (subRef.current === "hud") {
          const next = hudHistoryRef.current.redo();

          if (next === undefined) {
            return false;
          }

          skipHudHistoryRef.current = true;
          writeHudOnly(hudHistoryRef.current.present ?? next);
          notifyUiHistoryTick();

          return true;
        }

        if (subRef.current === "itemToast") {
          return false;
        }

        const next = bagHistoryRef.current.redo();

        if (next === undefined) {
          return false;
        }

        skipBagHistoryRef.current = true;
        writeBagOnly(bagHistoryRef.current.present ?? next);
        notifyUiHistoryTick();

        return true;
      },
      canUndo(): boolean {
        if (subRef.current === "hud") {
          return hudHistoryRef.current.canUndo;
        }

        if (subRef.current === "itemToast") {
          return false;
        }

        return bagHistoryRef.current.canUndo;
      },
      canRedo(): boolean {
        if (subRef.current === "hud") {
          return hudHistoryRef.current.canRedo;
        }

        if (subRef.current === "itemToast") {
          return false;
        }

        return bagHistoryRef.current.canRedo;
      },
    });

    return () => {
      registerUiHistoryBridge(null);
    };
  }, [writeHudOnly, writeBagOnly]);

  const primaryHudId =
    selectedHudIds.length === 1 ? selectedHudIds[0]! : null;
  const primaryBagId =
    selectedBagIds.length === 1 ? selectedBagIds[0]! : null;

  const hudSchema = useMemo(() => {
    return primaryHudId !== null
      ? inventoryHudNodeFields(primaryHudId)
      : inventoryHudGlobalFields();
  }, [primaryHudId]);

  const bagSchema = useMemo(() => {
    return primaryBagId !== null
      ? backpackScreenNodeFields(primaryBagId)
      : backpackScreenGlobalFields();
  }, [primaryBagId]);

  const handleSelectHud = useCallback(
    (id: HudNodeId | null, shiftKey = false): void => {
      if (id === null) {
        setSelectedHudIds([]);

        return;
      }

      setSelectedHudIds((prev) =>
        toggleOrReplaceSelection(prev, id, shiftKey),
      );
    },
    [],
  );

  const handleSelectBag = useCallback(
    (id: BackpackNodeId | null, shiftKey = false): void => {
      if (id === null) {
        setSelectedBagIds([]);

        return;
      }

      setSelectedBagIds((prev) =>
        toggleOrReplaceSelection(prev, id, shiftKey),
      );
    },
    [],
  );

  const handleAlignHud = useCallback(
    (mode: AlignMode): void => {
      persistHud(applyHudAlign(hud, selectedHudIds, mode));
    },
    [hud, persistHud, selectedHudIds],
  );

  const handleAlignBag = useCallback(
    (mode: AlignMode): void => {
      persistBag(applyBagAlign(bag, selectedBagIds, mode));
    },
    [bag, persistBag, selectedBagIds],
  );

  const handleResetHudNode = useCallback((): void => {
    if (primaryHudId === null) {
      return;
    }

    persistHud(resetInventoryHudNode(hud, primaryHudId));
  }, [hud, persistHud, primaryHudId]);

  const handleResetHudAll = useCallback((): void => {
    persistHud(defaultInventoryHud());
    setSelectedHudIds([]);
  }, [persistHud]);

  const handleResetBagNode = useCallback((): void => {
    if (primaryBagId === null) {
      return;
    }

    persistBag(
      resetBackpackScreenNode(
        bag,
        primaryBagId,
        designSize.width,
        designSize.height,
      ),
    );
  }, [bag, designSize.height, designSize.width, persistBag, primaryBagId]);

  const handleResetBagAll = useCallback((): void => {
    persistBag(defaultBackpackScreen(designSize.width, designSize.height));
    setSelectedBagIds([]);
  }, [designSize.height, designSize.width, persistBag]);

  const tabBtn = (id: UiSubSection, label: string): React.ReactElement => {
    const active = sub === id;

    return (
      <button
        key={id}
        type="button"
        data-testid={`ui-editor-tab-${id}`}
        onClick={() => {
          setSub(id);
          setSelectedHudIds([]);
          setSelectedBagIds([]);
          notifyUiHistoryTick();
        }}
        style={{
          appearance: "none",
          border: `1px solid ${active ? tokens.accent : tokens.borderStrong}`,
          background: active ? `${tokens.accent}22` : tokens.bgSunken,
          color: tokens.textPrimary,
          borderRadius: 6,
          padding: "6px 12px",
          fontSize: FONT_SIZE_DEFAULT,
          fontFamily: "inherit",
          fontWeight: active ? 650 : 500,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };

  const selectedLabel =
    sub === "hud"
      ? selectedHudIds.length === 0
        ? "全局"
        : selectedHudIds.length === 1
          ? selectedHudIds[0]!
          : `多选 ${selectedHudIds.length} 项`
      : selectedBagIds.length === 0
        ? "全局"
        : selectedBagIds.length === 1
          ? selectedBagIds[0]!
          : `多选 ${selectedBagIds.length} 项`;

  const hudFormValue = useMemo(
    () => hud as unknown as Record<string, unknown>,
    [hud],
  );
  const bagFormValue = useMemo(
    () => bag as unknown as Record<string, unknown>,
    [bag],
  );

  return (
    <div
      data-testid="ui-editor-panel"
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <aside
        data-testid="ui-editor-left"
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: `1px solid ${tokens.border}`,
          background: tokens.bgElevated,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: tokens.textMuted,
            letterSpacing: "0.08em",
            marginBottom: 4,
          }}
        >
          界面
        </div>
        {tabBtn("hud", "快捷栏 HUD")}
        {tabBtn("backpack", "全屏背包")}
        {tabBtn("itemToast", "获得提示")}
        <p
          style={{
            marginTop: 12,
            fontSize: 12,
            color: tokens.textMuted,
            lineHeight: 1.55,
          }}
        >
          {sub === "hud"
            ? "Shift+单击多选；顶栏 Ctrl+Z / Y 撤销重做；间隙点击可选中快捷栏。"
            : sub === "backpack"
              ? "Shift+单击多选节点后可用右侧对齐；Ctrl+Z / Y 撤销重做。"
              : "调整位置、间距与样式；左侧预览随表单实时同步。"}
        </p>
      </aside>

      <main
        data-testid="ui-editor-center"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          borderRight: `1px solid ${tokens.border}`,
          background: tokens.bgSunken,
        }}
      >
        {sub === "hud" ? (
          <HudVisualCanvas
            designWidth={designSize.width}
            designHeight={designSize.height}
            hud={hud}
            selectedNodeIds={selectedHudIds}
            onSelectNode={handleSelectHud}
            onHudChange={persistHud}
          />
        ) : sub === "backpack" ? (
          <BackpackVisualCanvas
            designWidth={designSize.width}
            designHeight={designSize.height}
            config={bag}
            selectedNodeIds={selectedBagIds}
            onSelectNode={handleSelectBag}
            onConfigChange={persistBag}
          />
        ) : (
          <ItemToastEditorPanel />
        )}
      </main>

      <aside
        data-testid="ui-editor-right"
        style={{
          width: 300,
          flexShrink: 0,
          minHeight: 0,
          overflow: "auto",
          background: tokens.bgElevated,
          padding: 12,
          display: sub === "itemToast" ? "none" : "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: tokens.textMuted,
            lineHeight: 1.45,
          }}
        >
          编辑目标：{selectedLabel}
        </div>

        {sub === "hud" ? (
          <AlignToolbar
            selectedCount={selectedHudIds.length}
            onAlign={handleAlignHud}
          />
        ) : (
          <AlignToolbar
            selectedCount={selectedBagIds.filter((id) =>
              BAG_ALIGNABLE.includes(id),
            ).length}
            onAlign={handleAlignBag}
          />
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {sub === "hud" ? (
            <>
              {primaryHudId !== null ? (
                <button
                  type="button"
                  data-testid="ui-editor-reset-hud-node"
                  onClick={handleResetHudNode}
                  style={resetButtonStyle(tokens, false)}
                >
                  重置此节点
                </button>
              ) : null}
              <button
                type="button"
                data-testid="ui-editor-reset-hud-all"
                onClick={handleResetHudAll}
                style={resetButtonStyle(tokens, true)}
              >
                全部重置为默认
              </button>
            </>
          ) : (
            <>
              {primaryBagId !== null ? (
                <button
                  type="button"
                  data-testid="ui-editor-reset-bag-node"
                  onClick={handleResetBagNode}
                  style={resetButtonStyle(tokens, false)}
                >
                  重置此节点
                </button>
              ) : null}
              <button
                type="button"
                data-testid="ui-editor-reset-bag-all"
                onClick={handleResetBagAll}
                style={resetButtonStyle(tokens, true)}
              >
                全部重置为默认
              </button>
            </>
          )}
        </div>

        {sub === "hud" ? (
          selectedHudIds.length > 1 ? (
            <p style={{ fontSize: 12, color: tokens.textMuted, margin: 0 }}>
              多选时请用上方对齐工具；属性表单仅在单选时可用。
            </p>
          ) : (
            <FormRenderer
              schema={hudSchema}
              value={hudFormValue}
              onChange={(next) => {
                persistHud(parseInventoryHudJson(JSON.stringify(next)));
              }}
            />
          )
        ) : selectedBagIds.length > 1 ? (
          <p style={{ fontSize: 12, color: tokens.textMuted, margin: 0 }}>
            多选时请用上方对齐工具；属性表单仅在单选时可用。
          </p>
        ) : (
          <FormRenderer
            schema={bagSchema}
            value={bagFormValue}
            onChange={(next) => {
              persistBag(
                parseBackpackScreenJson(
                  JSON.stringify(next),
                  designSize.width,
                  designSize.height,
                ),
              );
            }}
          />
        )}
      </aside>
    </div>
  );
}
