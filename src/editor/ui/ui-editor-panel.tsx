/**
 * ui-editor-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.8.0
 *
 * 编辑器「UI」分区：快捷栏 HUD / 全屏背包 / 场景 UI 可视化编辑。
 * - 「场景 UI」含二级子页：获得提示 / 交互点悬停 / 返回场景
 * - 配置写入 backpack-hud.settings（HUD/背包）与 editor.sceneUiJson（场景 UI）；支持撤销/重做（桥接顶栏）
 * - 多选 + 显式对齐；右侧属性（单选节点 / 全局）
 */

import { Button, Checkbox, chakra } from "@chakra-ui/react";
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
  isBackpackChromeOverlayId,
  resetBackpackScreenNode,
} from "../../domain/backpack-screen-config";
import { resolveBackpackLayout } from "../../domain/backpack-layout";
import { resolveHudLayout } from "../../domain/hud-layout";
import {
  defaultInventoryHud,
  isHudChromeOverlayId,
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
  UiOverlayKind,
  UiRect,
} from "../../domain/types";
import {
  createUiOverlayElement,
  overlaySelectionId,
  parseOverlaySelectionId,
  UI_OVERLAY_KIND_LABELS,
} from "../../domain/ui-overlay";
import {
  backpackScreenGlobalFields,
  backpackScreenNodeFields,
} from "../../schema/backpack-screen-schema";
import {
  inventoryHudGlobalFields,
  inventoryHudNodeFields,
  type HudNodeId,
} from "../../schema/inventory-hud-schema";
import { uiOverlayFields } from "../../schema/ui-overlay-schema";
import { FormRenderer } from "../../schema/form-renderer";
import { createHistory } from "../../store/history";
import {
  BACKPACK_SCREEN_JSON_KEY,
  AUTO_SHOW_HUD_KEY,
  SHOW_OPEN_BAG_BUTTON_KEY,
  INVENTORY_HUD_JSON_KEY,
  readHudSetting,
  writeHudSetting,
} from "../../store/hud-settings";
import { notifySettingsField } from "../../store/settings-sync";
import { useAutoShowHud } from "../../store/use-auto-show-hud";
import { useShowOpenBagButton } from "../../store/use-show-open-bag-button";
import {
  notifyUiHistoryTick,
  registerUiHistoryBridge,
} from "../../store/ui-edit-history-bridge";
import { useDesignSize } from "../../store/use-design-size";
import { IconLabel } from "../../shared/fa-icon";
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
import { HotspotHoverEditorPanel } from "./hotspot-hover-editor-panel";
import { HotspotLabelEditorPanel } from "./hotspot-label-editor-panel";
import { OverlayPalette } from "./overlay-palette";
import { SceneReturnEditorPanel } from "./scene-return-editor-panel";

/** UI 子分区 */
type UiSubSection = "hud" | "backpack" | "sceneUi";

/** 「场景 UI」分区内的二级子页 */
type SceneUiTab =
  | "itemToast"
  | "hotspotHover"
  | "hotspotLabel"
  | "sceneReturn";

/** 可对齐的背包功能节点 */
const BAG_ALIGNABLE: readonly BackpackNodeId[] = [
  "itemGrid",
  "detailPanel",
];

/**
 * 从 settings 读取并解析 HUD 配置。
 *
 * @param ctx - 上下文
 * @param designW - 当前设计宽
 * @param designH - 当前设计高
 * @returns InventoryHudConfig（已按设计分辨率适配）
 */
function loadHud(
  ctx: ReturnType<typeof useExtensionContext>,
  designW: number,
  designH: number,
): InventoryHudConfig {
  const raw = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);

  return parseInventoryHudJson(
    typeof raw === "string" ? raw : String(raw ?? ""),
    designW,
    designH,
  );
}

/**
 * @param ctx - 上下文
 * @param designW - 当前设计宽
 * @param designH - 当前设计高
 * @returns BackpackScreenConfig（已按设计分辨率适配）
 */
function loadBackpackScreen(
  ctx: ReturnType<typeof useExtensionContext>,
  designW: number,
  designH: number,
): BackpackScreenConfig {
  const raw = readHudSetting(ctx, BACKPACK_SCREEN_JSON_KEY);

  return parseBackpackScreenJson(
    typeof raw === "string" ? raw : String(raw ?? ""),
    designW,
    designH,
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
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
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
  ids: readonly string[],
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
  ids: readonly string[],
  mode: AlignMode,
): BackpackScreenConfig {
  const layout = resolveBackpackLayout(bag);
  const items: AlignableRect[] = [];

  for (const id of ids) {
    if (!BAG_ALIGNABLE.includes(id as BackpackNodeId)) {
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
  const autoShowHud = useAutoShowHud(ctx);
  const showOpenBagButton = useShowOpenBagButton(ctx);
  const { size: designSize } = useDesignSize();

  const [sub, setSub] = useState<UiSubSection>("hud");
  const [sceneUiTab, setSceneUiTab] = useState<SceneUiTab>("itemToast");
  const [hud, setHud] = useState<InventoryHudConfig>(() =>
    loadHud(ctx, designSize.width, designSize.height),
  );
  const [bag, setBag] = useState<BackpackScreenConfig>(() =>
    loadBackpackScreen(ctx, designSize.width, designSize.height),
  );

  const [selectedHudIds, setSelectedHudIds] = useState<string[]>([]);
  const [selectedBagIds, setSelectedBagIds] = useState<string[]>([]);

  const hudHistoryRef = useRef(createHistory<InventoryHudConfig>());
  const bagHistoryRef = useRef(createHistory<BackpackScreenConfig>());
  const hudSeededRef = useRef(false);
  const bagSeededRef = useRef(false);
  const skipHudHistoryRef = useRef(false);
  const skipBagHistoryRef = useRef(false);
  const subRef = useRef(sub);

  subRef.current = sub;

  useEffect(() => {
    setHud(loadHud(ctx, designSize.width, designSize.height));
    setBag(
      loadBackpackScreen(ctx, designSize.width, designSize.height),
    );
  }, [ctx, designSize.height, designSize.width]);

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

  const handleShowOpenBagButtonChange = useCallback(
    (enabled: boolean): void => {
      writeHudSetting(ctx, SHOW_OPEN_BAG_BUTTON_KEY, enabled);
      notifySettingsField(SHOW_OPEN_BAG_BUTTON_KEY);
    },
    [ctx],
  );

  const handleAutoShowHudChange = useCallback(
    (enabled: boolean): void => {
      writeHudSetting(ctx, AUTO_SHOW_HUD_KEY, enabled);
      notifySettingsField(AUTO_SHOW_HUD_KEY);
    },
    [ctx],
  );

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

  /**
   * 存盘仍是更大画幅（如 1920）而当前设计更小时，把适配结果写回，
   * 避免编辑器/预览长期依赖运行时临时缩放。
   */
  useEffect(() => {
    const bagRaw = readHudSetting(ctx, BACKPACK_SCREEN_JSON_KEY);
    const bagText =
      typeof bagRaw === "string" ? bagRaw : String(bagRaw ?? "");
    const bagStored = parseBackpackScreenJson(bagText);
    const bagAdapted = parseBackpackScreenJson(
      bagText,
      designSize.width,
      designSize.height,
    );

    if (
      stringifyBackpackScreen(bagStored) !==
      stringifyBackpackScreen(bagAdapted)
    ) {
      skipBagHistoryRef.current = true;
      writeBagOnly(bagAdapted);
    }

    const hudRaw = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);
    const hudText =
      typeof hudRaw === "string" ? hudRaw : String(hudRaw ?? "");
    const hudStored = parseInventoryHudJson(hudText);
    const hudAdapted = parseInventoryHudJson(
      hudText,
      designSize.width,
      designSize.height,
    );

    if (stringifyInventoryHud(hudStored) !== stringifyInventoryHud(hudAdapted)) {
      skipHudHistoryRef.current = true;
      writeHudOnly(hudAdapted);
    }
  }, [
    ctx,
    designSize.height,
    designSize.width,
    writeBagOnly,
    writeHudOnly,
  ]);

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

  /** 画布拖拽等连续动作：开始（栈顶即动作前状态） */
  const beginHudAction = useCallback((): void => {
    hudHistoryRef.current.beginAction();
  }, []);

  /** 画布拖拽等连续动作：结束 */
  const endHudAction = useCallback((): void => {
    hudHistoryRef.current.endAction();
    notifyUiHistoryTick();
  }, []);

  /** 画布拖拽等连续动作：开始 */
  const beginBagAction = useCallback((): void => {
    bagHistoryRef.current.beginAction();
  }, []);

  /** 画布拖拽等连续动作：结束 */
  const endBagAction = useCallback((): void => {
    bagHistoryRef.current.endAction();
    notifyUiHistoryTick();
  }, []);

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

        if (subRef.current === "sceneUi") {
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

        if (subRef.current === "sceneUi") {
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

        if (subRef.current === "sceneUi") {
          return false;
        }

        return bagHistoryRef.current.canUndo;
      },
      canRedo(): boolean {
        if (subRef.current === "hud") {
          return hudHistoryRef.current.canRedo;
        }

        if (subRef.current === "sceneUi") {
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
    if (primaryHudId === null) {
      return inventoryHudGlobalFields();
    }

    const overlayId = parseOverlaySelectionId(primaryHudId);

    if (overlayId !== null) {
      const index = (hud.overlays ?? []).findIndex((o) => o.id === overlayId);
      const el = index >= 0 ? hud.overlays![index]! : null;

      if (el && index >= 0) {
        return uiOverlayFields(`overlays.${index}`, el.kind);
      }
    }

    if (primaryHudId === "quickbarRoot" || primaryHudId === "openBagButton") {
      return inventoryHudNodeFields(primaryHudId as HudNodeId);
    }

    return inventoryHudGlobalFields();
  }, [hud.overlays, primaryHudId]);

  const bagSchema = useMemo(() => {
    if (primaryBagId === null) {
      return backpackScreenGlobalFields();
    }

    const overlayId = parseOverlaySelectionId(primaryBagId);

    if (overlayId !== null) {
      const index = (bag.overlays ?? []).findIndex((o) => o.id === overlayId);
      const el = index >= 0 ? bag.overlays![index]! : null;

      if (el && index >= 0) {
        return uiOverlayFields(`overlays.${index}`, el.kind);
      }
    }

    if (primaryBagId === "itemGrid" || primaryBagId === "detailPanel") {
      return backpackScreenNodeFields(primaryBagId);
    }

    return backpackScreenGlobalFields();
  }, [bag.overlays, primaryBagId]);

  const handleSelectHud = useCallback(
    (id: string | null, shiftKey = false): void => {
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
    (id: string | null, shiftKey = false): void => {
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

  const handleAddHudOverlay = useCallback(
    (kind: UiOverlayKind): void => {
      const el = createUiOverlayElement(
        kind,
        designSize.width,
        designSize.height,
      );
      persistHud({
        ...hud,
        overlays: [...(hud.overlays ?? []), el],
      });
      setSelectedHudIds([overlaySelectionId(el.id)]);
    },
    [designSize.height, designSize.width, hud, persistHud],
  );

  const handleAddBagOverlay = useCallback(
    (kind: UiOverlayKind): void => {
      const el = createUiOverlayElement(
        kind,
        designSize.width,
        designSize.height,
      );
      persistBag({
        ...bag,
        overlays: [...(bag.overlays ?? []), el],
      });
      setSelectedBagIds([overlaySelectionId(el.id)]);
    },
    [bag, designSize.height, designSize.width, persistBag],
  );

  const handleDeleteHudOverlay = useCallback((): void => {
    if (primaryHudId === null) {
      return;
    }

    const overlayId = parseOverlaySelectionId(primaryHudId);

    if (overlayId === null || isHudChromeOverlayId(overlayId)) {
      return;
    }

    persistHud({
      ...hud,
      overlays: (hud.overlays ?? []).filter((o) => o.id !== overlayId),
    });
    setSelectedHudIds([]);
  }, [hud, persistHud, primaryHudId]);

  const handleDeleteBagOverlay = useCallback((): void => {
    if (primaryBagId === null) {
      return;
    }

    const overlayId = parseOverlaySelectionId(primaryBagId);

    if (overlayId === null || isBackpackChromeOverlayId(overlayId)) {
      return;
    }

    persistBag({
      ...bag,
      overlays: (bag.overlays ?? []).filter((o) => o.id !== overlayId),
    });
    setSelectedBagIds([]);
  }, [bag, persistBag, primaryBagId]);

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

    if (parseOverlaySelectionId(primaryHudId) !== null) {
      return;
    }

    persistHud(
      resetInventoryHudNode(
        hud,
        primaryHudId as HudNodeId,
        designSize.width,
        designSize.height,
      ),
    );
  }, [designSize.height, designSize.width, hud, persistHud, primaryHudId]);

  const handleResetHudAll = useCallback((): void => {
    persistHud(defaultInventoryHud(designSize.width, designSize.height));
    setSelectedHudIds([]);
  }, [designSize.height, designSize.width, persistHud]);

  const handleResetBagNode = useCallback((): void => {
    if (primaryBagId === null) {
      return;
    }

    if (parseOverlaySelectionId(primaryBagId) !== null) {
      return;
    }

    persistBag(
      resetBackpackScreenNode(
        bag,
        primaryBagId as BackpackNodeId,
        designSize.width,
        designSize.height,
      ),
    );
  }, [bag, designSize.height, designSize.width, persistBag, primaryBagId]);

  const handleResetBagAll = useCallback((): void => {
    persistBag(defaultBackpackScreen(designSize.width, designSize.height));
    setSelectedBagIds([]);
  }, [designSize.height, designSize.width, persistBag]);

  const tabBtn = (
    id: UiSubSection,
    label: string,
    icon: string,
  ): React.ReactElement => {
    const active = sub === id;

    return (
      <Button size="xs" variant="plain"
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
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <IconLabel icon={icon}>{label}</IconLabel>
      </Button>
    );
  };

  /**
   * 「场景 UI」分区二级子页切换按钮。
   *
   * @param id - 子页 id
   * @param label - 按钮文案
   * @param icon - FA 图标名
   * @returns 按钮 React 元素
   */
  const sceneUiTabBtn = (
    id: SceneUiTab,
    label: string,
    icon: string,
  ): React.ReactElement => {
    const active = sceneUiTab === id;

    return (
      <Button size="xs" variant="plain"
        key={id}
        type="button"
        data-testid={`ui-editor-scene-ui-tab-${id}`}
        onClick={() => {
          setSceneUiTab(id);
        }}
        style={{
          appearance: "none",
          border: `1px solid ${active ? tokens.accent : tokens.borderStrong}`,
          background: active ? `${tokens.accent}22` : "transparent",
          color: tokens.textPrimary,
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: FONT_SIZE_DEFAULT,
          fontFamily: "inherit",
          fontWeight: active ? 650 : 500,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <IconLabel icon={icon}>{label}</IconLabel>
      </Button>
    );
  };

  const formatSelectionLabel = (ids: readonly string[]): string => {
    if (ids.length === 0) {
      return "全局";
    }

    if (ids.length > 1) {
      return `多选 ${ids.length} 项`;
    }

    const id = ids[0]!;
    const overlayId = parseOverlaySelectionId(id);

    if (overlayId !== null) {
      const list = sub === "hud" ? hud.overlays : bag.overlays;
      const el = (list ?? []).find((o) => o.id === overlayId);

      return el
        ? `图层 · ${UI_OVERLAY_KIND_LABELS[el.kind]} · ${el.name}`
        : `图层 · ${overlayId}`;
    }

    return id;
  };

  const selectedLabel =
    sub === "hud"
      ? formatSelectionLabel(selectedHudIds)
      : formatSelectionLabel(selectedBagIds);

  const hudOverlayId =
    primaryHudId !== null ? parseOverlaySelectionId(primaryHudId) : null;
  const canDeleteHudOverlay =
    hudOverlayId !== null && !isHudChromeOverlayId(hudOverlayId);
  const bagOverlayId =
    primaryBagId !== null ? parseOverlaySelectionId(primaryBagId) : null;
  const canDeleteBagOverlay =
    bagOverlayId !== null && !isBackpackChromeOverlayId(bagOverlayId);

  const hudFormValue = useMemo(
    () => hud as unknown as Record<string, unknown>,
    [hud],
  );
  const bagFormValue = useMemo(
    () => bag as unknown as Record<string, unknown>,
    [bag],
  );

  return (
    <chakra.div
      data-testid="ui-editor-panel"
      style={{
        display: "flex",
        flex: 1,
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <chakra.aside
        data-testid="ui-editor-left"
        style={{
          width: 220,
          flexShrink: 0,
          height: "100%",
          minHeight: 0,
          overflow: "auto",
          borderRight: `1px solid ${tokens.border}`,
          background: tokens.bgElevated,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <chakra.div
          style={{
            fontSize: 12,
            color: tokens.textMuted,
            letterSpacing: "0.08em",
            marginBottom: 4,
          }}
        >
          界面
        </chakra.div>
        {tabBtn("hud", "快捷栏 HUD", "grip")}
        {tabBtn("backpack", "全屏背包", "bag-shopping")}
        {tabBtn("sceneUi", "场景 UI", "clapperboard")}
        {sub === "hud" ? (
          <chakra.div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: 12,
            }}
          >
            <Checkbox.Root checked={autoShowHud}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: tokens.textPrimary,
                fontSize: FONT_SIZE_DEFAULT,
                cursor: "pointer",
              }}
                onCheckedChange={(details) =>
                  handleAutoShowHudChange(details.checked === true)
                } colorPalette="teal">
                <Checkbox.HiddenInput data-testid="ui-editor-auto-show-hud" />
                <Checkbox.Control />
                <Checkbox.Label>自动显示背包快捷栏</Checkbox.Label>
            </Checkbox.Root>
            <chakra.span style={{ fontSize: 11, color: tokens.textMuted, lineHeight: 1.45 }}>
              关闭后场景交互不再自动显示，也不会播放物品飞入快捷栏动画；剧本方法仍可手动打开。
            </chakra.span>
            <Checkbox.Root
              checked={showOpenBagButton}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
                color: tokens.textPrimary,
                fontSize: FONT_SIZE_DEFAULT,
                cursor: "pointer",
              }}
              onCheckedChange={(details) =>
                handleShowOpenBagButtonChange(details.checked === true)
              }
              colorPalette="teal"
            >
              <Checkbox.HiddenInput data-testid="ui-editor-show-open-bag-button" />
              <Checkbox.Control />
              <Checkbox.Label>显示打开背包按钮</Checkbox.Label>
            </Checkbox.Root>
            <chakra.span style={{ fontSize: 11, color: tokens.textMuted, lineHeight: 1.45 }}>
              关闭后所有场景都隐藏背包按钮；开启时遵循场景属性中的开关。快捷栏物品仍可显示。
            </chakra.span>
          </chakra.div>
        ) : null}
        <chakra.p
          style={{
            marginTop: 12,
            fontSize: 12,
            color: tokens.textMuted,
            lineHeight: 1.55,
          }}
        >
          {sub === "hud"
            ? "右侧可添加文字/图片/按钮等图层；Shift+单击多选；Ctrl+Z / Y 撤销重做。"
            : sub === "backpack"
              ? "右侧可添加图层；Shift+单击多选后可用对齐；Ctrl+Z / Y 撤销重做。"
              : "获得提示、交互点悬停与返回场景的全局预设；中栏顶部切换子页。"}
        </chakra.p>
      </chakra.aside>

      <chakra.main
        data-testid="ui-editor-center"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
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
            onActionStart={beginHudAction}
            onActionEnd={endHudAction}
          />
        ) : sub === "backpack" ? (
          <BackpackVisualCanvas
            designWidth={designSize.width}
            designHeight={designSize.height}
            config={bag}
            selectedNodeIds={selectedBagIds}
            onSelectNode={handleSelectBag}
            onConfigChange={persistBag}
            onActionStart={beginBagAction}
            onActionEnd={endBagAction}
          />
        ) : (
          <chakra.div
            data-testid="ui-editor-scene-ui"
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              width: "100%",
              height: "100%",
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <chakra.div
              data-testid="ui-editor-scene-ui-tabs"
              style={{
                display: "flex",
                gap: 8,
                padding: "10px 12px",
                borderBottom: `1px solid ${tokens.border}`,
                background: tokens.bgElevated,
                flexShrink: 0,
              }}
            >
              {sceneUiTabBtn("itemToast", "获得提示", "bell")}
              {sceneUiTabBtn("hotspotHover", "交互点悬停", "hand-pointer")}
              {sceneUiTabBtn("hotspotLabel", "交互点提示", "comment")}
              {sceneUiTabBtn("sceneReturn", "返回场景", "arrow-left")}
            </chakra.div>
            <chakra.div style={{ flex: 1, minHeight: 0, display: "flex" }}>
              {sceneUiTab === "itemToast" ? (
                <ItemToastEditorPanel />
              ) : sceneUiTab === "hotspotHover" ? (
                <HotspotHoverEditorPanel />
              ) : sceneUiTab === "hotspotLabel" ? (
                <HotspotLabelEditorPanel />
              ) : (
                <SceneReturnEditorPanel />
              )}
            </chakra.div>
          </chakra.div>
        )}
      </chakra.main>

      <chakra.aside
        data-testid="ui-editor-right"
        style={{
          width: 300,
          flexShrink: 0,
          height: "100%",
          minHeight: 0,
          overflow: "auto",
          background: tokens.bgElevated,
          padding: 12,
          display: sub === "sceneUi" ? "none" : "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <chakra.div
          style={{
            fontSize: 12,
            color: tokens.textMuted,
            lineHeight: 1.45,
          }}
        >
          编辑目标：{selectedLabel}
        </chakra.div>

        {sub === "hud" ? (
          <OverlayPalette
            onAdd={handleAddHudOverlay}
            onDelete={handleDeleteHudOverlay}
            canDelete={canDeleteHudOverlay}
          />
        ) : (
          <OverlayPalette
            onAdd={handleAddBagOverlay}
            onDelete={handleDeleteBagOverlay}
            canDelete={canDeleteBagOverlay}
          />
        )}

        {sub === "hud" ? (
          <AlignToolbar
            selectedCount={selectedHudIds.length}
            onAlign={handleAlignHud}
          />
        ) : (
          <AlignToolbar
            selectedCount={selectedBagIds.filter((id) =>
              BAG_ALIGNABLE.includes(id as BackpackNodeId),
            ).length}
            onAlign={handleAlignBag}
          />
        )}

        <chakra.div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {sub === "hud" ? (
            <>
              {primaryHudId !== null && !canDeleteHudOverlay ? (
                <Button size="xs" variant="plain"
                  type="button"
                  data-testid="ui-editor-reset-hud-node"
                  onClick={handleResetHudNode}
                  style={resetButtonStyle(tokens, false)}
                >
                  <IconLabel icon="rotate-left">重置此节点</IconLabel>
                </Button>
              ) : null}
              <Button size="xs" variant="plain"
                type="button"
                data-testid="ui-editor-reset-hud-all"
                onClick={handleResetHudAll}
                style={resetButtonStyle(tokens, true)}
              >
                <IconLabel icon="arrows-rotate">全部重置为默认</IconLabel>
              </Button>
            </>
          ) : (
            <>
              {primaryBagId !== null && !canDeleteBagOverlay ? (
                <Button size="xs" variant="plain"
                  type="button"
                  data-testid="ui-editor-reset-bag-node"
                  onClick={handleResetBagNode}
                  style={resetButtonStyle(tokens, false)}
                >
                  <IconLabel icon="rotate-left">重置此节点</IconLabel>
                </Button>
              ) : null}
              <Button size="xs" variant="plain"
                type="button"
                data-testid="ui-editor-reset-bag-all"
                onClick={handleResetBagAll}
                style={resetButtonStyle(tokens, true)}
              >
                <IconLabel icon="arrows-rotate">全部重置为默认</IconLabel>
              </Button>
            </>
          )}
        </chakra.div>

        {sub === "hud" ? (
          selectedHudIds.length > 1 ? (
            <chakra.p style={{ fontSize: 12, color: tokens.textMuted, margin: 0 }}>
              多选时请用上方对齐工具；属性表单仅在单选时可用。
            </chakra.p>
          ) : (
            <FormRenderer
              schema={hudSchema}
              value={hudFormValue}
              onChange={(next) => {
                persistHud(
                  parseInventoryHudJson(
                    JSON.stringify(next),
                    designSize.width,
                    designSize.height,
                  ),
                );
              }}
            />
          )
        ) : selectedBagIds.length > 1 ? (
          <chakra.p style={{ fontSize: 12, color: tokens.textMuted, margin: 0 }}>
            多选时请用上方对齐工具；属性表单仅在单选时可用。
          </chakra.p>
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
      </chakra.aside>
    </chakra.div>
  );
}
