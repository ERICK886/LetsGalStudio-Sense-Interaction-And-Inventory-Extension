/**
 * types.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.4
 *
 * 场景交互扩展的领域类型定义（纯类型，无运行时逻辑）。
 * SceneAction 含 openScene、giveItem/removeItem、跳转片段与继续剧情。
 * SceneUiConfig 聚合获得提示、交互点悬停全局预设与场景返回按钮外观。
 */
export type MotionPresetId =
  | "none"
  | "fade"
  | "scale"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight";

export interface MotionSide {
  preset: MotionPresetId;
  delayMs: number;
  durationMs: number;
  customCss: string;
}

export interface ElementMotion {
  enter: MotionSide;
  exit: MotionSide;
}

export type LetterboxMode = "black" | "white" | "custom";

export type HotspotLabelMode = "hover" | "always" | "hidden";

/**
 * 场景↔场景切换转场模式（由「进入的目标场景」决定）。
 * - fade：新旧同时溶换（交叉淡入淡出，避免露透明底闪一下）
 * - cover：新场景叠在旧场景上覆入（可配合入场滑入/缩放）
 */
export type SceneTransitionMode = "fade" | "cover";

/** 交互点悬停阴影的单层配置（光晕 glow 或底影 base） */
export interface HoverShadowLayer {
  enabled: boolean;
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  blur: number;
  intensity: number;
}

/** 交互点悬停时的光标样式 */
export type HotspotHoverCursor =
  | "pointer"
  | "default"
  | "grab"
  | "crosshair"
  | "help"
  | "zoom-in";

/**
 * 交互点悬停效果：总开关 + 光晕/底影双层 + 动效/滤镜增强。
 *
 * `useGlobal` 仅用于交互点实例：缺省或 `true` 表示跟随 `SceneUiConfig.hotspotHover`；
 * 全局预设段不使用该字段。
 */
export interface HotspotHoverShadow {
  /** 缺省 / true = 跟随场景 UI 全局悬停预设；false = 使用本对象字段 */
  useGlobal?: boolean;
  enabled: boolean;
  glow: HoverShadowLayer;
  base: HoverShadowLayer;
  /** 悬停过渡时长（毫秒），默认 120 */
  transitionMs?: number;
  /** 悬停缩放（1 = 不变），默认 1 */
  hoverScale?: number;
  /** 悬停亮度（1 = 不变），默认 1 */
  brightness?: number;
  /** 悬停饱和度（1 = 不变），默认 1 */
  saturate?: number;
  /** 悬停对比度（1 = 不变），默认 1 */
  contrast?: number;
  /** 悬停光标；缺省 pointer */
  cursor?: HotspotHoverCursor;
}

/**
 * 交互点提示文本（标签）的外观配置。
 *
 * 全局段挂于 `SceneUiConfig.hotspotLabel`；交互点本地可跟随或覆盖。
 */
export interface HotspotLabelStyleConfig {
  /** 盒模型 + 文本样式 */
  style: UiBoxStyle & UiTextStyle;
  /** 水平内边距（px） */
  paddingX: number;
  /** 垂直内边距（px） */
  paddingY: number;
  /** 最大宽度（px）；超出省略 */
  maxWidth: number;
}

export interface HotspotLabel {
  text: string;
  mode: HotspotLabelMode;
  offsetX?: number;
  offsetY?: number;
  /**
   * 缺省 / true = 跟随 `SceneUiConfig.hotspotLabel` 外观；
   * false = 使用本对象 style / padding / maxWidth。
   */
  useGlobalStyle?: boolean;
  /** 本地外观（useGlobalStyle === false 时生效）；normalize 后保证有值 */
  style: UiBoxStyle & UiTextStyle;
  paddingX?: number;
  paddingY?: number;
  maxWidth?: number;
  customCss: string;
  motion: ElementMotion;
}

/** 获得物品 Toast 相对热区锚点的方位 */
export type ToastPlacement =
  | "above"
  | "below"
  | "left"
  | "right"
  | "center";

/** 场景变量动作的右值：常量或当前游戏变量。 */
export interface SceneVariableOperand {
  kind: "number" | "string" | "boolean" | "variable";
  value: string;
}

export type SceneVariableAssignment = "=" | "+=" | "-=" | "*=" | "/=";
export type SceneVariableBinaryOperator = "+" | "-" | "*" | "/";

export type SceneAction =
  | { type: "none" }
  | {
      type: "openScene";
      sceneIdOrName: string;
      /** 缺省：自动压入打开前的 currentSceneId；可指定为另一场景 id/name */
      returnTarget?: string;
      /** 缺省 true；false = 只切场景、不改返回栈 */
      pushReturn?: boolean;
    }
  | {
      type: "giveItem";
      itemId: string;
      amount: number;
      toastText: string;
      toastMotion: ElementMotion;
      toastPlacement?: ToastPlacement;
      toastOffsetX?: number;
      toastOffsetY?: number;
      toastGap?: number;
      toastStyle?: Partial<UiBoxStyle & UiTextStyle>;
    }
  /** 从库存扣除物品；数量不足则失败不改库存 */
  | {
      type: "removeItem";
      itemId: string;
      amount: number;
    }
  /** 修改 Studio 游戏变量；先计算右值，再按赋值运算符写回。 */
  | {
      type: "editVariable";
      target: string;
      assignment: SceneVariableAssignment;
      operand: SceneVariableOperand;
      binary?: {
        operator: SceneVariableBinaryOperator;
        operand: SceneVariableOperand;
      };
    }
  /** 跳转剧本片段（可跳回）：flow.callFragment */
  | {
      type: "jumpFragmentReturn";
      fragmentId: string;
      /** 所属章节；片段选择器同步写入，供跨章跳转 */
      chapterId?: string;
    }
  /** 跳转剧本片段（不可跳回）：flow.unsafe_goToFragment */
  | {
      type: "jumpFragmentGoto";
      fragmentId: string;
      chapterId?: string;
    }
  /**
   * 继续剧情：关闭场景交互叠层并解除 `openSceneInteraction` 阻塞，
   * 使剧本从打开场景后的下一节点继续执行。
   */
  | { type: "continueStory" };

export type HotspotConditionOperator =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "truthy" | "falsy";

export interface HotspotCondition {
  source: "game";
  target: string;
  valueType: "string" | "number" | "bool";
  operator: HotspotConditionOperator;
  value?: string | number | boolean;
  compareTo?: { source: "game"; target: string };
}

export interface HotspotConditionGroup {
  logic: "all" | "any";
  conditions: HotspotCondition[];
}

export interface HotspotElement {
  type: "hotspot";
  id: string;
  name: string;
  x: number;
  y: number;
  visual: { kind: "image"; src: string; width?: number; height?: number };
  hoverShadow: HotspotHoverShadow;
  label?: HotspotLabel;
  actions: SceneAction[];
  once: boolean;
  visibleByDefault: boolean;
  visibleIf?: HotspotConditionGroup;
  customCss: string;
  motion: ElementMotion;
}

export interface SceneDefinition {
  id: string;
  name: string;
  baseImage: string;
  hotspots: HotspotElement[];
  /**
   * @deprecated 已弃用：运行时恒透明铺底，编辑器不再提供画面底色配置。
   * 存档字段仍可读入以兼容旧数据，渲染时忽略。
   */
  letterboxMode?: LetterboxMode;
  /**
   * @deprecated 同 {@link SceneDefinition.letterboxMode}
   */
  letterboxColor?: string;
  customCss?: string;
  /**
   * 进入本场景时的切换转场；缺省 `fade`。
   */
  transitionMode?: SceneTransitionMode;
  motion?: ElementMotion;
}

export interface ScenesLibraryFile {
  version: 1;
  scenes: SceneDefinition[];
}

export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  detailImage: string;
  stackable: boolean;
  maxStack?: number;
}

export interface ItemsLibraryFile {
  version: 1;
  items: ItemDefinition[];
}

/** 配方原料/产物一行 */
export interface RecipeItemAmount {
  itemId: string;
  /** 数量；规范化后 >= 1 */
  count: number;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  ingredients: RecipeItemAmount[];
  products: RecipeItemAmount[];
  description?: string;
}

export interface RecipesLibraryFile {
  version: 1;
  recipes: RecipeDefinition[];
}

export type InventoryEntry =
  | { kind: "stack"; itemId: string; count: number; lastGainedAt: number }
  | { kind: "unique"; instanceId: string; itemId: string; lastGainedAt: number };

export interface InventoryState {
  entries: InventoryEntry[];
}

export interface SceneProgress {
  consumed: Record<string, boolean>;
  visibility?: Record<string, boolean>;
}

export type InventoryHudMode = "withScene" | "always";

/** 自由布局节点的矩形区域（设计像素坐标） */
export interface UiRect {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/** 自由布局节点的盒模型视觉样式 */
export interface UiBoxStyle {
  background?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  shadow?: number;
}

/** 自由布局节点的文本样式 */
export interface UiTextStyle {
  color?: string;
  fontSize?: number;
  fontWeight?: number;
  label?: string;
}

/**
 * 按钮图片三态（常态 / 悬停 / 按下）。
 *
 * 缺省某态时运行时按 pressed → hover → normal 回退。
 */
export interface UiButtonSkin {
  /** 常态背景/图标（asset URI 或路径） */
  imageSrc?: string;
  /** 悬停态背景/图标 */
  hoverImageSrc?: string;
  /** 按下态背景/图标 */
  pressedImageSrc?: string;
}

/**
 * 场景返回按钮外观与布局（挂于 SceneUiConfig.sceneReturn）。
 *
 * `enabled === false` 时默认不渲染返回按钮；「打开场景交互」方法可用
 * `showReturnButton` 参数按次强制显示/隐藏。栈逻辑仍可由动作/剧本驱动。
 */
export interface SceneReturnButtonConfig extends UiButtonSkin {
  /** 全局总开关；false 时默认不显示（可被方法参数覆盖） */
  enabled: boolean;
  /** 设计分辨率下的矩形（与背包等节点一致使用 UiRect） */
  rect: UiRect;
  /** 按钮文案（normalize 后保证非空） */
  label: string;
  /** 常态：盒模型 + 文本样式 */
  style: UiBoxStyle & UiTextStyle;
  /** 悬停态样式覆盖（可选） */
  hoverStyle?: Partial<UiBoxStyle & UiTextStyle>;
}

/** 全局获得物品 Toast 样式与锚点配置（version 1） */
export interface ItemToastConfig {
  version: 1;
  placement: ToastPlacement;
  offsetX: number;
  offsetY: number;
  gap: number;
  style: UiBoxStyle & UiTextStyle;
  /**
   * 获得物品时播放的 SE 资源 URI；空 / 未配置则不播放。
   */
  seSrc?: string;
}

/**
 * 场景 UI 预设（version 1）：获得提示 + 交互点悬停/提示文本 + 返回按钮全局默认。
 *
 * 持久化于 `editor.sceneUiJson`；`hotspotHover` 段不含 `useGlobal`。
 */
export interface SceneUiConfig {
  version: 1;
  /** 获得物品 Toast 全局默认（结构同 ItemToastConfig） */
  itemToast: ItemToastConfig;
  /** 交互点悬停阴影全局默认（不含 useGlobal） */
  hotspotHover: HotspotHoverShadow;
  /** 交互点提示文本外观全局默认 */
  hotspotLabel: HotspotLabelStyleConfig;
  /** 场景返回按钮外观与布局 */
  sceneReturn: SceneReturnButtonConfig;
}

/**
 * 物品栏 HUD 自由布局配置（version 2，节点化）。
 *
 * v1 扁平 `left/top/slotSize/...` 仅在 `normalizeInventoryHud` 输入侧迁移，不再作为正式字段。
 */
/**
 * UI 区块自由图层种类（对齐 Studio 可视化「基础 / 控件」）。
 * 控件类在背包/HUD 中以外观与轻交互为主，不接系统设置绑定。
 */
export type UiOverlayKind =
  | "text"
  | "image"
  | "button"
  | "rect"
  | "line"
  | "mask"
  | "select"
  | "switch"
  | "slider"
  | "checkbox"
  | "input"
  | "tabs";

/**
 * 自由图层运行时角色（背包 chrome 按钮等）。
 * `none` / 缺省：仅外观。
 */
export type UiOverlayRole =
  | "none"
  | "closeBag"
  | "craft"
  | "toggleMode"
  | "openBag";

/**
 * 自由图层元素（叠在固定功能节点之上，可增删）。
 */
export interface UiOverlayElement {
  id: string;
  kind: UiOverlayKind;
  /** 侧栏显示名 */
  name: string;
  /** 设计像素矩形（必含正 w/h） */
  rect: Required<UiRect>;
  /** 叠放顺序，越大越靠上 */
  zIndex: number;
  /** 旋转角度（度） */
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  /** 0–1 */
  opacity: number;
  /** 元素级自定义 CSS（支持 &:hover 等） */
  customCss: string;
  /**
   * 运行时动作角色；按钮类常用。
   * @default "none"
   */
  role?: UiOverlayRole;
  /** 盒/字样式（按 kind 取用） */
  style: UiBoxStyle & UiTextStyle;
  /** 按钮 / 图片等可选三态皮 */
  skin?: UiButtonSkin;
  props: {
    text?: string;
    /**
     * Font Awesome 图标名（不含 fa-），如 `xmark`；
     * 有值时按钮/文字可渲染图标。
     */
    icon?: string;
    asset?: string;
    /** 线粗细 */
    thickness?: number;
    lineStyle?: "solid" | "dashed" | "dotted";
    /** 下拉 / 页签：逗号分隔 */
    options?: string;
    /** 下拉初始下标 / 页签当前页 */
    initialIndex?: number;
    /** 开关 / 勾选初始态 */
    initialOn?: boolean;
    /** 滑块初始值 0–100 */
    initialValue?: number;
    showValue?: boolean;
    placeholder?: string;
    maxLength?: number;
    /** 开关/勾选/滑块素材 */
    onAsset?: string;
    offAsset?: string;
    trackAsset?: string;
    fillAsset?: string;
    handleAsset?: string;
    checkedAsset?: string;
    uncheckedAsset?: string;
    tabAsset?: string;
    activeTabAsset?: string;
    tabGap?: number;
  };
}

export interface InventoryHudConfig {
  version: 2;
  accent: string;
  customCss: string;
  /** 自由图层（装饰/附加控件），缺省 [] */
  overlays?: UiOverlayElement[];
  /**
   * 节点侧栏叠放顺序（固定节点 id + `overlay:<id>`）。
   * 下标越大越靠上；缺省：固定节点在前，图层按 zIndex。
   */
  layerOrder?: string[];
  nodes: {
    quickbarRoot: {
      rect: { x: number; y: number };
      direction: "column" | "row";
      slotSize: number;
      gap: number;
      slotStyle: UiBoxStyle;
      badgeStyle: UiBoxStyle & UiTextStyle;
    };
    openBagButton: {
      layout: "belowRoot" | "absolute";
      /** absolute：x/y/w/h；belowRoot：可选 w/h 覆盖默认尺寸（x/y 忽略） */
      rect?: UiRect;
      style: UiBoxStyle & UiTextStyle;
    } & UiButtonSkin;
  };
}

/**
 * 全屏背包自由布局配置（version 2，节点化）。
 *
 * v1 扁平 `pagePaddingX/pagePaddingY/detailRatio/...` 仅在
 * `normalizeBackpackScreen` 输入侧迁移，不再作为正式字段。
 */
export interface BackpackScreenConfig {
  version: 2;
  accent: string;
  /** 自由图层（装饰/附加控件），缺省 [] */
  overlays?: UiOverlayElement[];
  /**
   * 节点侧栏叠放顺序（固定节点 id + `overlay:<id>`）。
   * 下标越大越靠上；缺省：固定节点在前，图层按 zIndex。
   */
  layerOrder?: string[];
  nodes: {
    backdrop: { style: UiBoxStyle };
    panelChrome: { rect: UiRect; style: UiBoxStyle };
    titleBlock: {
      rect: UiRect;
      eyebrow?: UiTextStyle;
      title?: UiTextStyle;
      modeLink?: UiTextStyle;
    };
    closeButton: {
      rect: UiRect;
      style: UiBoxStyle & UiTextStyle;
    } & UiButtonSkin;
    itemGrid: {
      rect: UiRect;
      cellMin: number;
      style: UiBoxStyle;
      /** 格子常态（未选中）盒样式 */
      cellStyle?: UiBoxStyle;
      selectedStyle?: UiBoxStyle;
      /** 格内名称文字 */
      cellLabelStyle?: UiTextStyle;
      /** 格内物品图片边长（设计像素） */
      iconMaxSize?: number;
      /** 道具模式空网格文案（label 可覆写，如「背包是空的」） */
      emptyStyle?: UiTextStyle;
      /** 合成模式空网格文案（label 可覆写，如「暂无配方」） */
      emptyCraftStyle?: UiTextStyle;
    };
    detailPanel: {
      rect: UiRect;
      heroHeight: number;
      padding: number;
      /** 详情面板容器 */
      style: UiBoxStyle;
      /** 顶部大图框 */
      heroStyle?: UiBoxStyle;
      /** 物品 / 配方名称 */
      titleStyle?: UiTextStyle;
      /** 数量、可合成状态等副文案 */
      metaStyle?: UiTextStyle;
      /** 描述正文 */
      descriptionStyle?: UiTextStyle;
      /** 道具模式未选中空态（label 可覆写） */
      emptyStyle?: UiTextStyle;
      /** 合成模式未选中空态（label 可覆写） */
      emptyCraftStyle?: UiTextStyle;
      /** 「原料」小标题 */
      ingredientsLabelStyle?: UiTextStyle;
      /** 原料列表正文 */
      ingredientsStyle?: UiTextStyle;
    };
    craftButton: {
      /** 相对详情底边的额外 Y 偏移（像素） */
      offsetY?: number;
      /** 可选宽度；缺省为详情区内宽 */
      w?: number;
      /** 可选高度；缺省 44 */
      h?: number;
      style: UiBoxStyle & UiTextStyle;
    } & UiButtonSkin;
  };
}

/**
 * 全屏背包节点 id。
 * 编辑器侧仅暴露 itemGrid / detailPanel；其余 chrome 已迁为 overlays（仍保留以便旧配置 normalize）。
 */
export type BackpackNodeId =
  | "backdrop"
  | "panelChrome"
  | "titleBlock"
  | "closeButton"
  | "itemGrid"
  | "detailPanel"
  | "craftButton";

/** 编辑器可直接选中的功能节点（不含已组件化的 chrome） */
export type BackpackEditorNodeId = "itemGrid" | "detailPanel";
