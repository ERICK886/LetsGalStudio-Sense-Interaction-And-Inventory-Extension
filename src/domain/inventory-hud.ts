/**
 * inventory-hud.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.3.0
 *
 * 物品栏 HUD 外观默认值、v1→v2 迁移与 JSON 规范化。
 * 「打开背包」已迁为 chrome overlay 按钮组件（role: openBag）。
 */
import {
  DEFAULT_DESIGN_HEIGHT,
  DEFAULT_DESIGN_WIDTH,
} from "./design-resolution";
import {
  computeHudAxisAlignedBounds,
  resolveHudLayout,
} from "./hud-layout";
import type {
  InventoryHudConfig,
  UiBoxStyle,
  UiOverlayElement,
  UiRect,
  UiTextStyle,
} from "./types";
import {
  cloneUiButtonSkin,
  normalizeUiButtonSkin,
} from "./ui-button-skin";
import {
  buildDefaultLayerOrder,
  normalizeLayerOrder,
} from "./layer-order";
import {
  cloneUiOverlayElement,
  cloneUiOverlays,
  normalizeUiOverlays,
} from "./ui-overlay";
import {
  normalizeUiBoxStyle,
  normalizeUiRect,
  normalizeUiTextStyle,
} from "./ui-style";

/** 默认布局参照宽（与全局设计分辨率默认一致） */
const DEFAULT_REF_W = DEFAULT_DESIGN_WIDTH;

/** 默认布局参照高 */
const DEFAULT_REF_H = DEFAULT_DESIGN_HEIGHT;

/** HUD 侧栏固定功能节点（可拖排序）；打开背包已迁为 overlay */
export const HUD_FIXED_LAYER_IDS = ["quickbarRoot"] as const;

/** HUD chrome 图层稳定 id（不可删） */
export const HUD_CHROME_OVERLAY_IDS = {
  openBag: "hud-chrome-open-bag",
} as const;

/**
 * @param id - 图层 id
 * @returns 是否为 HUD chrome 稳定 id
 */
export function isHudChromeOverlayId(id: string): boolean {
  return (Object.values(HUD_CHROME_OVERLAY_IDS) as string[]).includes(id);
}

/** 快捷栏左边距默认值（设计像素） */
const DEFAULT_LEFT = 37;

/** 快捷栏顶边距默认值（设计像素） */
const DEFAULT_TOP = 198;

/** 槽位尺寸默认值（设计像素） */
const DEFAULT_SLOT_SIZE = 64;

/** 槽位间距默认值（设计像素） */
const DEFAULT_GAP = 8;

/** 打开背包按钮默认文案 */
const DEFAULT_OPEN_BAG_LABEL = "打开背包";

/** 打开背包按钮默认矩形（设计像素） */
const DEFAULT_OPEN_BAG_RECT: Required<UiRect> = {
  x: 38,
  y: 776,
  w: 64,
  h: 64,
};

/** 强调色默认值（与全屏背包默认 accent 对齐） */
const DEFAULT_ACCENT = "#64e0d0";

/**
 * 槽位默认盒样式（贴近现网 quickbar：圆角 8、深色底、强边框）。
 */
const DEFAULT_SLOT_STYLE: UiBoxStyle = {
  background: "#1F1F26",
  borderColor: "#3C3C48",
  borderWidth: 1,
  borderRadius: 8,
  shadow: 0.35,
};

/**
 * 数量角标默认样式（贴近现网：11px / 700 / 主文本色）。
 */
const DEFAULT_BADGE_STYLE: UiBoxStyle & UiTextStyle = {
  color: "#F2F2F4",
  fontSize: 11,
  fontWeight: 700,
};

/**
 * 「打开背包」按钮默认样式（图标按钮：accent 底半透明 + 圆角 8）。
 */
const DEFAULT_OPEN_BAG_STYLE: UiBoxStyle & UiTextStyle = {
  background: "#64e0d022",
  borderColor: "#64e0d0",
  borderWidth: 1,
  borderRadius: 8,
  color: "#F2F2F4",
  fontSize: 24,
  fontWeight: 600,
  label: DEFAULT_OPEN_BAG_LABEL,
};

/**
 * 将数值钳制为非负有限数，非法时回退 defaultValue。
 *
 * @param value - 原始输入
 * @param defaultValue - 非法时的默认值
 * @returns 非负有限数
 */
function clampNonNegativeNumber(value: unknown, defaultValue: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.max(0, value);
}

/**
 * 深拷贝 quickbarRoot 节点（避免默认对象被调用方就地修改）。
 *
 * @param node - 源节点
 * @returns 独立副本
 */
function cloneQuickbarRoot(
  node: InventoryHudConfig["nodes"]["quickbarRoot"],
): InventoryHudConfig["nodes"]["quickbarRoot"] {
  return {
    rect: { ...node.rect },
    direction: node.direction,
    slotSize: node.slotSize,
    gap: node.gap,
    slotStyle: { ...node.slotStyle },
    badgeStyle: { ...node.badgeStyle },
  };
}

/**
 * 深拷贝 openBagButton 节点。
 *
 * @param node - 源节点
 * @returns 独立副本
 */
function cloneOpenBagButton(
  node: InventoryHudConfig["nodes"]["openBagButton"],
): InventoryHudConfig["nodes"]["openBagButton"] {
  return {
    layout: node.layout,
    rect: node.rect ? { ...node.rect } : undefined,
    style: { ...node.style },
    ...cloneUiButtonSkin(node),
  };
}

/**
 * 规范化盒样式 + 文本样式的交叉类型（按钮 / 角标）。
 *
 * @param raw - 原始对象或部分字段
 * @param fallback - 缺省/非法字段回退
 * @returns 规范化后的 UiBoxStyle & UiTextStyle
 */
function normalizeBoxAndTextStyle(
  raw: unknown,
  fallback: UiBoxStyle & UiTextStyle,
): UiBoxStyle & UiTextStyle {
  const source =
    raw !== null && typeof raw === "object"
      ? (raw as Partial<UiBoxStyle & UiTextStyle>)
      : undefined;

  return {
    ...normalizeUiBoxStyle(source, fallback),
    ...normalizeUiTextStyle(source, fallback),
  };
}

/**
 * 规范化 quickbarRoot 节点；非法/缺字段回退 fallback。
 *
 * @param raw - 原始节点对象
 * @param fallback - 默认节点
 * @returns 规范化后的 quickbarRoot
 */
function normalizeQuickbarRoot(
  raw: unknown,
  fallback: InventoryHudConfig["nodes"]["quickbarRoot"],
): InventoryHudConfig["nodes"]["quickbarRoot"] {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return cloneQuickbarRoot(fallback);
  }

  const obj = raw as Record<string, unknown>;

  const direction =
    obj.direction === "row" || obj.direction === "column"
      ? obj.direction
      : fallback.direction;

  const normalizedRect = normalizeUiRect(
    obj.rect as Partial<UiRect> | undefined,
    { x: fallback.rect.x, y: fallback.rect.y },
  );

  return {
    rect: { x: normalizedRect.x, y: normalizedRect.y },
    direction,
    slotSize: clampNonNegativeNumber(obj.slotSize, fallback.slotSize),
    gap: clampNonNegativeNumber(obj.gap, fallback.gap),
    slotStyle: normalizeUiBoxStyle(
      obj.slotStyle as Partial<UiBoxStyle> | undefined,
      fallback.slotStyle,
    ),
    badgeStyle: normalizeBoxAndTextStyle(obj.badgeStyle, fallback.badgeStyle),
  };
}

/**
 * 规范化 openBagButton 节点；非法/缺字段回退 fallback。
 *
 * @param raw - 原始节点对象
 * @param fallback - 默认节点
 * @returns 规范化后的 openBagButton
 */
function normalizeOpenBagButton(
  raw: unknown,
  fallback: InventoryHudConfig["nodes"]["openBagButton"],
): InventoryHudConfig["nodes"]["openBagButton"] {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return cloneOpenBagButton(fallback);
  }

  const obj = raw as Record<string, unknown>;

  const layout =
    obj.layout === "absolute" || obj.layout === "belowRoot"
      ? obj.layout
      : fallback.layout;

  const result: InventoryHudConfig["nodes"]["openBagButton"] = {
    layout,
    style: normalizeBoxAndTextStyle(obj.style, fallback.style),
    ...normalizeUiButtonSkin(obj),
  };

  if (obj.rect !== undefined && obj.rect !== null && typeof obj.rect === "object") {
    result.rect = normalizeUiRect(
      obj.rect as Partial<UiRect>,
      fallback.rect ?? { x: 0, y: 0 },
    );
  } else if (fallback.rect !== undefined) {
    result.rect = { ...fallback.rect };
  }

  return result;
}

/**
 * 由遗留 nodes.openBagButton + resolveHudLayout 生成「打开背包」按钮组件。
 *
 * @param nodes - HUD nodes（含 openBagButton 供迁移）
 * @returns chrome overlays
 */
export function buildHudChromeOverlays(
  nodes: InventoryHudConfig["nodes"],
): UiOverlayElement[] {
  const layout = resolveHudLayout({
    version: 2,
    accent: DEFAULT_ACCENT,
    customCss: "",
    overlays: [],
    nodes,
  });
  const btn = layout.openBagButton;
  // 允许空文案（纯图标）；仅缺省字段时用默认「打开背包」
  const label =
    typeof nodes.openBagButton.style.label === "string"
      ? nodes.openBagButton.style.label.trim()
      : DEFAULT_OPEN_BAG_LABEL;

  return [
    {
      id: HUD_CHROME_OVERLAY_IDS.openBag,
      kind: "button",
      name: "打开背包",
      role: "openBag",
      rect: { x: btn.x, y: btn.y, w: btn.w, h: btn.h },
      zIndex: 10,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
      customCss: "",
      style: { ...nodes.openBagButton.style, label },
      skin: cloneUiButtonSkin(nodes.openBagButton),
      props: {
        /** 默认纯图标；文案由 style.label 保留供无障碍/重置 */
        text: "",
        icon: "bag-shopping",
        thickness: 2,
        lineStyle: "solid",
        initialIndex: 0,
        initialOn: true,
        initialValue: 60,
        showValue: true,
        maxLength: 0,
        tabGap: 8,
      },
    },
  ];
}

/**
 * 补齐缺失的 HUD chrome overlays；已存在的保留用户编辑。
 *
 * @param overlays - 当前图层
 * @param nodes - 用于生成缺省 chrome
 */
export function ensureHudChromeOverlays(
  overlays: readonly UiOverlayElement[],
  nodes: InventoryHudConfig["nodes"],
): UiOverlayElement[] {
  const seeds = buildHudChromeOverlays(nodes);
  const byId = new Map(overlays.map((el) => [el.id, el]));
  const out: UiOverlayElement[] = [];

  for (const seed of seeds) {
    const existing = byId.get(seed.id);

    if (existing) {
      const cloned = cloneUiOverlayElement(existing);

      if (
        (cloned.role === "openBag" || seed.role === "openBag") &&
        !cloned.props.icon
      ) {
        cloned.props = { ...cloned.props, icon: "bag-shopping" };
      }

      if (cloned.role === "none" || cloned.role === undefined) {
        cloned.role = "openBag";
      }

      out.push(cloned);
      byId.delete(seed.id);
    } else {
      out.push(cloneUiOverlayElement(seed));
    }
  }

  for (const el of byId.values()) {
    out.push(cloneUiOverlayElement(el));
  }

  return out;
}

/**
 * 缩放可选矩形。
 *
 * @param rect - 源矩形
 * @param sx - X 比例
 * @param sy - Y 比例
 * @returns 新矩形；无源时 undefined
 */
function scaleOptionalUiRect(
  rect: UiRect | undefined,
  sx: number,
  sy: number,
): UiRect | undefined {
  if (!rect) {
    return undefined;
  }

  const next: UiRect = {
    x: Math.round(rect.x * sx),
    y: Math.round(rect.y * sy),
  };

  if (typeof rect.w === "number") {
    next.w = Math.max(1, Math.round(rect.w * sx));
  }

  if (typeof rect.h === "number") {
    next.h = Math.max(1, Math.round(rect.h * sy));
  }

  return next;
}

/**
 * 缩放样式中的尺寸字段（圆角、字号、边宽等）。
 *
 * @param style - 源样式
 * @param s - 均匀比例（通常 min(sx,sy)）
 * @returns 新样式
 */
function scaleStyleMetrics<T extends UiBoxStyle | (UiBoxStyle & UiTextStyle)>(
  style: T,
  s: number,
): T {
  const next = { ...style } as T & {
    borderRadius?: number;
    borderWidth?: number;
    fontSize?: number;
  };

  if (typeof next.borderRadius === "number") {
    next.borderRadius = Math.max(0, Math.round(next.borderRadius * s));
  }

  if (typeof next.borderWidth === "number") {
    next.borderWidth = Math.max(0, Math.round(next.borderWidth * s));
  }

  if (typeof next.fontSize === "number") {
    next.fontSize = Math.max(1, Math.round(next.fontSize * s));
  }

  return next;
}

/**
 * 将 HUD 布局从一套设计分辨率等比缩放到另一套。
 *
 * @param cfg - 源配置
 * @param fromW - 源设计宽
 * @param fromH - 源设计高
 * @param toW - 目标设计宽
 * @param toH - 目标设计高
 * @returns 新配置（不修改入参）
 */
export function scaleInventoryHudLayout(
  cfg: InventoryHudConfig,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): InventoryHudConfig {
  const fw = Math.max(1, fromW);
  const fh = Math.max(1, fromH);
  const tw = Math.max(1, toW);
  const th = Math.max(1, toH);

  if (fw === tw && fh === th) {
    return cfg;
  }

  const sx = tw / fw;
  const sy = th / fh;
  const s = Math.min(sx, sy);
  const root = cloneQuickbarRoot(cfg.nodes.quickbarRoot);
  const openBag = cloneOpenBagButton(cfg.nodes.openBagButton);

  root.rect = {
    x: Math.round(root.rect.x * sx),
    y: Math.round(root.rect.y * sy),
  };
  root.slotSize = Math.max(1, Math.round(root.slotSize * s));
  root.gap = Math.max(0, Math.round(root.gap * s));
  root.slotStyle = scaleStyleMetrics({ ...root.slotStyle }, s);
  root.badgeStyle = scaleStyleMetrics({ ...root.badgeStyle }, s);
  openBag.rect = scaleOptionalUiRect(openBag.rect, sx, sy);
  openBag.style = scaleStyleMetrics({ ...openBag.style }, s);

  const overlays = cloneUiOverlays(cfg.overlays ?? []).map((el) => ({
    ...el,
    rect: {
      x: Math.round(el.rect.x * sx),
      y: Math.round(el.rect.y * sy),
      w: Math.max(1, Math.round(el.rect.w * sx)),
      h: Math.max(1, Math.round(el.rect.h * sy)),
    },
    style: scaleStyleMetrics({ ...el.style }, s),
  }));

  return {
    ...cfg,
    nodes: {
      quickbarRoot: root,
      openBagButton: openBag,
    },
    overlays,
    layerOrder: [...(cfg.layerOrder ?? [])],
  };
}

/**
 * 统计 HUD 在设计坐标中的右/下边界。
 *
 * @param cfg - HUD 配置
 * @returns right / bottom
 */
function measureInventoryHudExtent(cfg: InventoryHudConfig): {
  right: number;
  bottom: number;
} {
  const layout = resolveHudLayout(cfg);
  const bounds = computeHudAxisAlignedBounds(layout, 0);
  let right = bounds.x + bounds.w;
  let bottom = bounds.y + bounds.h;

  for (const el of cfg.overlays ?? []) {
    right = Math.max(right, el.rect.x + el.rect.w);
    bottom = Math.max(bottom, el.rect.y + el.rect.h);
  }

  return { right, bottom };
}

/**
 * 若 HUD 明显超出当前设计画幅（如打开背包钮仍在 1080 预设的 y=776），
 * 则从推断源分辨率缩放到目标设计尺寸。
 *
 * @param cfg - 当前配置
 * @param designW - 当前设计宽
 * @param designH - 当前设计高
 * @returns 适配后的配置；无需缩放时返回原引用
 */
export function adaptInventoryHudToDesign(
  cfg: InventoryHudConfig,
  designW: number,
  designH: number,
): InventoryHudConfig {
  const dw = Math.max(1, designW);
  const dh = Math.max(1, designH);
  const { right, bottom } = measureInventoryHudExtent(cfg);
  const slack = 8;

  if (right <= dw + slack && bottom <= dh + slack) {
    return cfg;
  }

  /**
   * HUD 默认只占画幅一角；只要外接边落在 1920×1080 参照内，
   * 即按该参照缩放（打开背包默认 y=776 在 720 高画布上必触发）。
   */
  const fromW =
    right <= DEFAULT_REF_W + slack ? DEFAULT_REF_W : Math.max(right, dw);
  const fromH =
    bottom <= DEFAULT_REF_H + slack ? DEFAULT_REF_H : Math.max(bottom, dh);

  return scaleInventoryHudLayout(cfg, fromW, fromH, dw, dh);
}

/**
 * 返回 v2 约定的物品栏 HUD 默认配置（基准 1920×1080；其它设计尺寸等比缩放）。
 *
 * @param refW - 参考设计宽度，默认 1920
 * @param refH - 参考设计高度，默认 1080
 * @returns 默认 InventoryHudConfig（version: 2）
 *
 * @example
 * ```ts
 * const hud = defaultInventoryHud();
 * // hud.version === 2
 * // hud.nodes.quickbarRoot.rect === { x: 37, y: 198 }
 * ```
 */
export function defaultInventoryHud(
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): InventoryHudConfig {
  const nodes: InventoryHudConfig["nodes"] = {
    quickbarRoot: {
      rect: { x: DEFAULT_LEFT, y: DEFAULT_TOP },
      direction: "column",
      slotSize: DEFAULT_SLOT_SIZE,
      gap: DEFAULT_GAP,
      slotStyle: { ...DEFAULT_SLOT_STYLE },
      badgeStyle: { ...DEFAULT_BADGE_STYLE },
    },
    openBagButton: {
      layout: "absolute",
      rect: { ...DEFAULT_OPEN_BAG_RECT },
      style: { ...DEFAULT_OPEN_BAG_STYLE },
    },
  };
  const overlays = buildHudChromeOverlays(nodes);

  const base: InventoryHudConfig = {
    version: 2,
    accent: DEFAULT_ACCENT,
    customCss: "",
    overlays,
    layerOrder: ["quickbarRoot", `overlay:${HUD_CHROME_OVERLAY_IDS.openBag}`],
    nodes,
  };

  if (refW === DEFAULT_REF_W && refH === DEFAULT_REF_H) {
    return base;
  }

  return scaleInventoryHudLayout(base, DEFAULT_REF_W, DEFAULT_REF_H, refW, refH);
}

/**
 * 将 v1 扁平字段迁移并填入默认 nodes 骨架。
 *
 * @param obj - 原始对象（含 left/top/slotSize 等）
 * @param defaults - 默认 v2 配置
 * @returns 迁移后的 InventoryHudConfig
 */
function migrateV1ToV2(
  obj: Record<string, unknown>,
  defaults: InventoryHudConfig,
): InventoryHudConfig {
  const left = clampNonNegativeNumber(obj.left, defaults.nodes.quickbarRoot.rect.x);
  const top = clampNonNegativeNumber(obj.top, defaults.nodes.quickbarRoot.rect.y);
  const slotSize = clampNonNegativeNumber(
    obj.slotSize,
    defaults.nodes.quickbarRoot.slotSize,
  );
  const gap = clampNonNegativeNumber(obj.gap, defaults.nodes.quickbarRoot.gap);

  const openBagLabel =
    typeof obj.openBagLabel === "string"
      ? obj.openBagLabel
      : defaults.nodes.openBagButton.style.label ?? DEFAULT_OPEN_BAG_LABEL;

  const customCss =
    typeof obj.customCss === "string" ? obj.customCss : defaults.customCss;

  const accent =
    typeof obj.accent === "string" && obj.accent.trim().length > 0
      ? obj.accent.trim()
      : defaults.accent;

  const nodes: InventoryHudConfig["nodes"] = {
    quickbarRoot: {
      ...cloneQuickbarRoot(defaults.nodes.quickbarRoot),
      rect: { x: left, y: top },
      slotSize,
      gap,
    },
    openBagButton: {
      ...cloneOpenBagButton(defaults.nodes.openBagButton),
      style: {
        ...defaults.nodes.openBagButton.style,
        label: openBagLabel,
      },
    },
  };
  const overlays = ensureHudChromeOverlays([], nodes);

  return {
    version: 2,
    accent,
    customCss,
    overlays,
    layerOrder: buildDefaultLayerOrder(HUD_FIXED_LAYER_IDS, overlays),
    nodes,
  };
}

/**
 * 将任意 JSON 输入规范化为 InventoryHudConfig（version 2）。
 *
 * - `version === 2` 且 `nodes` 为对象：逐字段 normalize，缺节点用 default
 * - 否则视为 v1：读 `left/top/slotSize/gap/openBagLabel/customCss/accent` 填入默认 nodes
 *
 * @param raw - 原始对象或 undefined
 * @param refW - 参考设计宽度，默认 1920
 * @param refH - 参考设计高度，默认 1080
 * @returns 规范化后的 HUD 配置；非法根回退 defaultInventoryHud(refW, refH)
 *
 * @example
 * ```ts
 * normalizeInventoryHud({ left: 40, top: 80, openBagLabel: "背包" });
 * // → version 2，nodes.quickbarRoot.rect = { x: 40, y: 80 }
 * ```
 */
export function normalizeInventoryHud(
  raw: unknown,
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): InventoryHudConfig {
  const defaults = defaultInventoryHud(refW, refH);

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return defaultInventoryHud(refW, refH);
  }

  const obj = raw as Record<string, unknown>;

  if (obj.version === 2 && obj.nodes !== null && typeof obj.nodes === "object") {
    const nodesRaw = obj.nodes as Record<string, unknown>;
    const nodes: InventoryHudConfig["nodes"] = {
      quickbarRoot: normalizeQuickbarRoot(
        nodesRaw.quickbarRoot,
        defaults.nodes.quickbarRoot,
      ),
      openBagButton: normalizeOpenBagButton(
        nodesRaw.openBagButton,
        defaults.nodes.openBagButton,
      ),
    };
    const overlays = ensureHudChromeOverlays(
      normalizeUiOverlays(obj.overlays),
      nodes,
    );

    return adaptInventoryHudToDesign(
      {
        version: 2,
        accent:
          typeof obj.accent === "string" && obj.accent.trim().length > 0
            ? obj.accent.trim()
            : defaults.accent,
        customCss:
          typeof obj.customCss === "string" ? obj.customCss : defaults.customCss,
        overlays,
        layerOrder: normalizeLayerOrder(
          obj.layerOrder,
          HUD_FIXED_LAYER_IDS,
          overlays,
        ),
        nodes,
      },
      refW,
      refH,
    );
  }

  return adaptInventoryHudToDesign(migrateV1ToV2(obj, defaults), refW, refH);
}

/**
 * 将指定节点重置为默认值，其余字段保持不变。
 *
 * @param cfg - 当前 HUD 配置
 * @param nodeId - 要重置的节点 id
 * @param refW - 参考设计宽度，默认 1920
 * @param refH - 参考设计高度，默认 1080
 * @returns 新配置（不修改入参）
 *
 * @example
 * ```ts
 * const next = resetInventoryHudNode(cfg, "quickbarRoot");
 * // next.nodes.quickbarRoot 与 defaultInventoryHud().nodes.quickbarRoot 深相等
 * ```
 */
export function resetInventoryHudNode(
  cfg: InventoryHudConfig,
  nodeId: "quickbarRoot" | "openBagButton",
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): InventoryHudConfig {
  const defaults = defaultInventoryHud(refW, refH);

  if (nodeId === "quickbarRoot") {
    return {
      ...cfg,
      nodes: {
        ...cfg.nodes,
        quickbarRoot: cloneQuickbarRoot(defaults.nodes.quickbarRoot),
      },
    };
  }

  /** 遗留 openBagButton：重置节点并重建 chrome 打开背包按钮 */
  const nodes: InventoryHudConfig["nodes"] = {
    ...cfg.nodes,
    openBagButton: cloneOpenBagButton(defaults.nodes.openBagButton),
  };
  const withoutChrome = (cfg.overlays ?? []).filter(
    (el) => !isHudChromeOverlayId(el.id),
  );
  const overlays = ensureHudChromeOverlays(withoutChrome, nodes);

  return {
    ...cfg,
    nodes,
    overlays,
    layerOrder: normalizeLayerOrder(
      cfg.layerOrder,
      HUD_FIXED_LAYER_IDS,
      overlays,
    ),
  };
}
