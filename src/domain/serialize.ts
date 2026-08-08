/**
 * serialize.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景库 / 物品库 / 库存 / 进度 / HUD 的 JSON 安全编解码与规范化。
 */
import { clamp01 } from "../shared/coords";
import { logError } from "../shared/logger";
import { normalizeHotspotLabel } from "./hotspot-label";
import {
  defaultBackpackScreen,
  normalizeBackpackScreen,
} from "./backpack-screen-config";
import {
  defaultInventoryHud,
  normalizeInventoryHud,
} from "./inventory-hud";
import {
  normalizeLetterboxColor,
  normalizeLetterboxMode,
} from "./letterbox";
import {
  defaultElementMotion,
  defaultMotionSide,
  normalizeElementMotion,
} from "./motion";
import type {
  BackpackScreenConfig,
  ElementMotion,
  HotspotElement,
  InventoryEntry,
  InventoryHudConfig,
  InventoryState,
  ItemDefinition,
  SceneAction,
  SceneDefinition,
  SceneProgress,
  ScenesLibraryFile,
  ItemsLibraryFile,
  RecipeDefinition,
  RecipeItemAmount,
  RecipesLibraryFile,
} from "./types";

const SCOPE = "serialize";

/**
 * 安全解析 JSON 字符串。
 *
 * @param raw - JSON 文本
 * @param scope - logError 用的子 scope
 * @returns 解析结果；失败时 null 并 logError
 */
function safeParseJson(raw: string, scope: string): unknown | null {
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    logError(SCOPE, `invalid JSON in ${scope}`, err);
    return null;
  }
}

/**
 * 判断根对象是否误传为纯数组（不做大地图兼容）。
 *
 * @param root - 解析后的根值
 * @param kind - 库类型标识，用于日志
 * @returns 若为纯数组则 true（应回退空库）
 */
function isBareArrayRoot(root: unknown, kind: string): boolean {
  if (Array.isArray(root)) {
    logError(SCOPE, `bare array root rejected for ${kind}`);
    return true;
  }

  return false;
}

/**
 * 返回 toast 友好默认动效：enter slideUp / exit slideDown。
 *
 * @returns giveItem.toastMotion 缺省值
 */
function defaultToastMotion(): ElementMotion {
  const enterDefault = defaultMotionSide();
  const exitDefault = defaultMotionSide();

  return {
    enter: { ...enterDefault, preset: "slideUp" },
    exit: { ...exitDefault, preset: "slideDown" },
  };
}

/**
 * 将 giveItem 的 amount 规范化为至少 1 的整数。
 *
 * @param value - 原始数量
 * @returns >= 1 的整数
 */
function normalizeGiveItemAmount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

/**
 * 规范化 toast 动效；缺省时 slideUp / slideDown。
 *
 * @param raw - 原始 toastMotion
 * @returns 规范化 ElementMotion
 */
function normalizeToastMotion(raw: unknown): ElementMotion {
  if (raw === null || raw === undefined) {
    return defaultToastMotion();
  }

  if (typeof raw !== "object") {
    return defaultToastMotion();
  }

  const obj = raw as Record<string, unknown>;
  const normalized = normalizeElementMotion(raw);
  const toastDefault = defaultToastMotion();

  return {
    enter: {
      ...toastDefault.enter,
      ...normalized.enter,
      preset: obj.enter === undefined ? "slideUp" : normalized.enter.preset,
    },
    exit: {
      ...toastDefault.exit,
      ...normalized.exit,
      preset: obj.exit === undefined ? "slideDown" : normalized.exit.preset,
    },
  };
}

/**
 * 规范化单条场景动作。
 *
 * @param raw - 原始动作对象
 * @returns 合法 SceneAction 或 null（无法识别时丢弃）
 */
function normalizeSceneAction(raw: unknown): SceneAction | null {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  switch (obj.type) {
    case "none":
      return { type: "none" };

    case "openScene":
      return {
        type: "openScene",
        sceneIdOrName:
          typeof obj.sceneIdOrName === "string" ? obj.sceneIdOrName : "",
      };

    case "giveItem":
      return {
        type: "giveItem",
        itemId: typeof obj.itemId === "string" ? obj.itemId : "",
        amount: normalizeGiveItemAmount(obj.amount),
        toastText: typeof obj.toastText === "string" ? obj.toastText : "",
        toastMotion: normalizeToastMotion(obj.toastMotion),
      };

    default:
      return null;
  }
}

/**
 * 规范化交互点视觉配置。
 *
 * @param raw - 原始 visual 对象
 * @returns 合法 visual 子结构
 */
function normalizeHotspotVisual(
  raw: unknown,
): HotspotElement["visual"] {
  const fallback: HotspotElement["visual"] = {
    kind: "image",
    src: "",
  };

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return fallback;
  }

  const obj = raw as Record<string, unknown>;

  if (obj.kind !== "image") {
    return fallback;
  }

  const visual: HotspotElement["visual"] = {
    kind: "image",
    src: typeof obj.src === "string" ? obj.src : "",
  };

  if (typeof obj.width === "number" && Number.isFinite(obj.width)) {
    visual.width = obj.width;
  }

  if (typeof obj.height === "number" && Number.isFinite(obj.height)) {
    visual.height = obj.height;
  }

  return visual;
}

/**
 * 规范化单个交互点元素。
 *
 * @param raw - 原始 hotspot 对象
 * @returns 合法 HotspotElement 或 null
 */
function normalizeHotspotElement(raw: unknown): HotspotElement | null {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.trim() === "") {
    logError(SCOPE, "hotspot entry dropped: missing id");
    return null;
  }

  const hoverShadowRaw =
    obj.hoverShadow !== null &&
    typeof obj.hoverShadow === "object"
      ? (obj.hoverShadow as Record<string, unknown>)
      : undefined;

  const actionsRaw = Array.isArray(obj.actions) ? obj.actions : [];
  const actions = actionsRaw
    .map(normalizeSceneAction)
    .filter((action): action is SceneAction => action !== null);

  const label = normalizeHotspotLabel(obj.label);

  const hotspot: HotspotElement = {
    type: "hotspot",
    id: obj.id,
    name: typeof obj.name === "string" ? obj.name : "",
    x: clamp01(typeof obj.x === "number" ? obj.x : 0),
    y: clamp01(typeof obj.y === "number" ? obj.y : 0),
    visual: normalizeHotspotVisual(obj.visual),
    hoverShadow: {
      enabled:
        hoverShadowRaw?.enabled === undefined
          ? true
          : Boolean(hoverShadowRaw.enabled),
    },
    actions,
    once: Boolean(obj.once),
    visibleByDefault:
      obj.visibleByDefault === undefined ? true : Boolean(obj.visibleByDefault),
    customCss: typeof obj.customCss === "string" ? obj.customCss : "",
    motion: normalizeElementMotion(obj.motion ?? defaultElementMotion()),
  };

  if (label !== undefined) {
    hotspot.label = label;
  }

  return hotspot;
}

/**
 * 规范化单条场景定义。
 *
 * @param raw - 原始场景对象
 * @returns 合法 SceneDefinition 或 null
 */
function normalizeSceneDefinition(raw: unknown): SceneDefinition | null {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.trim() === "") {
    logError(SCOPE, "scene entry dropped: missing id");
    return null;
  }

  const hotspotsRaw = Array.isArray(obj.hotspots) ? obj.hotspots : [];
  const hotspots = hotspotsRaw
    .map(normalizeHotspotElement)
    .filter((hotspot): hotspot is HotspotElement => hotspot !== null);

  const scene: SceneDefinition = {
    id: obj.id,
    name: typeof obj.name === "string" ? obj.name : "",
    baseImage: typeof obj.baseImage === "string" ? obj.baseImage : "",
    hotspots,
  };

  const letterboxMode = normalizeLetterboxMode(obj.letterboxMode);
  if (letterboxMode !== undefined) {
    scene.letterboxMode = letterboxMode;
  }

  const letterboxColor = normalizeLetterboxColor(obj.letterboxColor);
  if (letterboxColor !== undefined) {
    scene.letterboxColor = letterboxColor;
  }

  if (typeof obj.customCss === "string" && obj.customCss !== "") {
    scene.customCss = obj.customCss;
  }

  if (obj.motion !== undefined) {
    scene.motion = normalizeElementMotion(obj.motion);
  }

  return scene;
}

/**
 * 规范化单条物品定义。
 *
 * @param raw - 原始物品对象
 * @returns 合法 ItemDefinition 或 null
 */
function normalizeItemDefinition(raw: unknown): ItemDefinition | null {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.trim() === "") {
    logError(SCOPE, "item entry dropped: missing id");
    return null;
  }

  const item: ItemDefinition = {
    id: obj.id,
    name: typeof obj.name === "string" ? obj.name : "",
    description: typeof obj.description === "string" ? obj.description : "",
    icon: typeof obj.icon === "string" ? obj.icon : "",
    detailImage: typeof obj.detailImage === "string" ? obj.detailImage : "",
    stackable: Boolean(obj.stackable),
  };

  if (typeof obj.maxStack === "number" && Number.isFinite(obj.maxStack)) {
    item.maxStack = Math.max(1, Math.floor(obj.maxStack));
  }

  return item;
}

/**
 * 规范化配方原料/产物一行。
 *
 * @param raw - 原始 { itemId, count } 对象
 * @returns 合法 RecipeItemAmount；空 itemId 或非法结构时 null
 */
function normalizeRecipeItemAmount(raw: unknown): RecipeItemAmount | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const itemId = typeof obj.itemId === "string" ? obj.itemId.trim() : "";

  if (!itemId) {
    return null;
  }

  const n =
    typeof obj.count === "number" && Number.isFinite(obj.count)
      ? obj.count
      : 1;

  return { itemId, count: Math.max(1, Math.floor(n)) };
}

/**
 * 规范化单条配方定义。
 *
 * @param raw - 原始配方对象
 * @returns 合法 RecipeDefinition 或 null（缺少 id 时丢弃并 logError）
 */
function normalizeRecipeDefinition(raw: unknown): RecipeDefinition | null {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id.trim() === "") {
    logError(SCOPE, "recipe entry dropped: missing id");
    return null;
  }

  const ingredientsRaw = Array.isArray(obj.ingredients) ? obj.ingredients : [];
  const ingredients = ingredientsRaw
    .map(normalizeRecipeItemAmount)
    .filter((row): row is RecipeItemAmount => row !== null);

  const productsRaw = Array.isArray(obj.products) ? obj.products : [];
  const products = productsRaw
    .map(normalizeRecipeItemAmount)
    .filter((row): row is RecipeItemAmount => row !== null);

  const recipe: RecipeDefinition = {
    id: obj.id,
    name: typeof obj.name === "string" ? obj.name : "",
    ingredients,
    products,
  };

  if (typeof obj.description === "string" && obj.description !== "") {
    recipe.description = obj.description;
  }

  return recipe;
}

/**
 * 规范化单条库存条目。
 *
 * @param raw - 原始 entry 对象
 * @returns 合法 InventoryEntry 或 null
 */
function normalizeInventoryEntry(raw: unknown): InventoryEntry | null {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  if (obj.kind === "stack") {
    if (typeof obj.itemId !== "string" || obj.itemId.trim() === "") {
      return null;
    }

    return {
      kind: "stack",
      itemId: obj.itemId,
      count:
        typeof obj.count === "number" && Number.isFinite(obj.count)
          ? Math.max(0, Math.floor(obj.count))
          : 0,
      lastGainedAt:
        typeof obj.lastGainedAt === "number" && Number.isFinite(obj.lastGainedAt)
          ? obj.lastGainedAt
          : 0,
    };
  }

  if (obj.kind === "unique") {
    if (
      typeof obj.instanceId !== "string" ||
      obj.instanceId.trim() === "" ||
      typeof obj.itemId !== "string" ||
      obj.itemId.trim() === ""
    ) {
      return null;
    }

    return {
      kind: "unique",
      instanceId: obj.instanceId,
      itemId: obj.itemId,
      lastGainedAt:
        typeof obj.lastGainedAt === "number" && Number.isFinite(obj.lastGainedAt)
          ? obj.lastGainedAt
          : 0,
    };
  }

  return null;
}

/**
 * 规范化 string -> boolean 记录表。
 *
 * @param raw - 原始对象
 * @returns 仅保留 string 键与 boolean 值的 Record
 */
function normalizeBooleanRecord(raw: unknown): Record<string, boolean> {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {};
  }

  const result: Record<string, boolean> = {};
  const obj = raw as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "boolean") {
      result[key] = value;
    }
  }

  return result;
}

/**
 * 返回空场景库（version 1）。
 *
 * @returns 空 ScenesLibraryFile
 */
export function emptyScenesLibrary(): ScenesLibraryFile {
  return { version: 1, scenes: [] };
}

/**
 * 返回空物品库（version 1）。
 *
 * @returns 空 ItemsLibraryFile
 */
export function emptyItemsLibrary(): ItemsLibraryFile {
  return { version: 1, items: [] };
}

/**
 * 返回空配方库（version 1）。
 *
 * @returns 空 RecipesLibraryFile
 */
export function emptyRecipesLibrary(): RecipesLibraryFile {
  return { version: 1, recipes: [] };
}

/**
 * 返回空玩家库存。
 *
 * @returns 空 InventoryState
 */
export function emptyInventory(): InventoryState {
  return { entries: [] };
}

/**
 * 返回空场景进度。
 *
 * @returns 空 SceneProgress（consumed 为空对象）
 */
export function emptyProgress(): SceneProgress {
  return { consumed: {} };
}

/** @see defaultInventoryHud in inventory-hud.ts */
export { defaultInventoryHud } from "./inventory-hud";

/**
 * 解析场景库 JSON 并规范化；非法根或纯数组回退空库。
 *
 * @param raw - JSON 字符串
 * @returns 规范化后的 ScenesLibraryFile
 */
export function parseScenesLibraryJson(raw: string): ScenesLibraryFile {
  const parsed = safeParseJson(raw, "scenesLibrary");

  if (parsed === null) {
    return emptyScenesLibrary();
  }

  if (isBareArrayRoot(parsed, "scenesLibrary")) {
    return emptyScenesLibrary();
  }

  if (typeof parsed !== "object") {
    logError(SCOPE, "scenesLibrary root must be object");
    return emptyScenesLibrary();
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.scenes)) {
    logError(SCOPE, "scenesLibrary root must include scenes array");
    return emptyScenesLibrary();
  }

  const scenes = obj.scenes
    .map(normalizeSceneDefinition)
    .filter((scene): scene is SceneDefinition => scene !== null);

  return { version: 1, scenes };
}

/**
 * 将场景库序列化为 JSON 字符串。
 *
 * @param lib - 场景库
 * @returns JSON 文本
 */
export function stringifyScenesLibrary(lib: ScenesLibraryFile): string {
  return JSON.stringify(lib);
}

/**
 * 解析物品库 JSON 并规范化。
 *
 * @param raw - JSON 字符串
 * @returns 规范化后的 ItemsLibraryFile
 */
export function parseItemsLibraryJson(raw: string): ItemsLibraryFile {
  const parsed = safeParseJson(raw, "itemsLibrary");

  if (parsed === null) {
    return emptyItemsLibrary();
  }

  if (isBareArrayRoot(parsed, "itemsLibrary")) {
    return emptyItemsLibrary();
  }

  if (typeof parsed !== "object") {
    logError(SCOPE, "itemsLibrary root must be object");
    return emptyItemsLibrary();
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.items)) {
    logError(SCOPE, "itemsLibrary root must include items array");
    return emptyItemsLibrary();
  }

  const items = obj.items
    .map(normalizeItemDefinition)
    .filter((item): item is ItemDefinition => item !== null);

  return { version: 1, items };
}

/**
 * 将物品库序列化为 JSON 字符串。
 *
 * @param lib - 物品库
 * @returns JSON 文本
 */
export function stringifyItemsLibrary(lib: ItemsLibraryFile): string {
  return JSON.stringify(lib);
}

/**
 * 解析配方库 JSON 并规范化；非法根或纯数组回退空库。
 *
 * @param raw - JSON 字符串
 * @returns 规范化后的 RecipesLibraryFile
 */
export function parseRecipesLibraryJson(raw: string): RecipesLibraryFile {
  const parsed = safeParseJson(raw, "recipesLibrary");

  if (parsed === null) {
    return emptyRecipesLibrary();
  }

  if (isBareArrayRoot(parsed, "recipesLibrary")) {
    return emptyRecipesLibrary();
  }

  if (typeof parsed !== "object") {
    logError(SCOPE, "recipesLibrary root must be object");
    return emptyRecipesLibrary();
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.recipes)) {
    logError(SCOPE, "recipesLibrary root must include recipes array");
    return emptyRecipesLibrary();
  }

  const recipes = obj.recipes
    .map(normalizeRecipeDefinition)
    .filter((recipe): recipe is RecipeDefinition => recipe !== null);

  return { version: 1, recipes };
}

/**
 * 将配方库序列化为 JSON 字符串。
 *
 * @param lib - 配方库
 * @returns JSON 文本（version 固定为 1）
 */
export function stringifyRecipesLibrary(lib: RecipesLibraryFile): string {
  return JSON.stringify({ version: 1, recipes: lib.recipes });
}

/**
 * 解析玩家库存 JSON 并规范化。
 *
 * @param raw - JSON 字符串
 * @returns 规范化后的 InventoryState
 */
export function parseInventoryJson(raw: string): InventoryState {
  const parsed = safeParseJson(raw, "inventory");

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyInventory();
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.entries)) {
    return emptyInventory();
  }

  const entries = obj.entries
    .map(normalizeInventoryEntry)
    .filter((entry): entry is InventoryEntry => entry !== null);

  return { entries };
}

/**
 * 将玩家库存序列化为 JSON 字符串。
 *
 * @param state - 库存状态
 * @returns JSON 文本
 */
export function stringifyInventory(state: InventoryState): string {
  return JSON.stringify(state);
}

/**
 * 解析场景进度 JSON 并规范化。
 *
 * @param raw - JSON 字符串
 * @returns 规范化后的 SceneProgress
 */
export function parseProgressJson(raw: string): SceneProgress {
  const parsed = safeParseJson(raw, "progress");

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return emptyProgress();
  }

  const obj = parsed as Record<string, unknown>;
  const consumed = normalizeBooleanRecord(obj.consumed);
  const visibilityRaw = normalizeBooleanRecord(obj.visibility);

  const progress: SceneProgress = { consumed };

  if (Object.keys(visibilityRaw).length > 0) {
    progress.visibility = visibilityRaw;
  }

  return progress;
}

/**
 * 将场景进度序列化为 JSON 字符串。
 *
 * @param progress - 场景进度
 * @returns JSON 文本
 */
export function stringifyProgress(progress: SceneProgress): string {
  return JSON.stringify(progress);
}

/**
 * 解析物品栏 HUD JSON 并规范化。
 *
 * @param raw - JSON 字符串；空串 / 仅空白为 settings 默认「未配置」，静默回退默认 HUD（不记 ERROR）
 * @returns 规范化后的 InventoryHudConfig
 *
 * @example
 * ```ts
 * parseInventoryHudJson(""); // → defaultInventoryHud()，无控制台报错
 * ```
 */
export function parseInventoryHudJson(raw: string): InventoryHudConfig {
  // settings.inventoryHudJson 默认 ""；视为未配置，勿 JSON.parse（避免 Unexpected end of JSON input）
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return defaultInventoryHud();
  }

  const parsed = safeParseJson(raw, "inventoryHud");

  if (parsed === null) {
    return defaultInventoryHud();
  }

  return normalizeInventoryHud(parsed);
}

/**
 * 将物品栏 HUD 配置序列化为 JSON 字符串。
 *
 * 始终写出 `version: 2`，避免旧调用方漏写版本号。
 *
 * @param config - HUD 配置
 * @returns JSON 文本
 */
export function stringifyInventoryHud(config: InventoryHudConfig): string {
  return JSON.stringify({ ...config, version: 2 as const });
}

/**
 * 解析全屏背包布局 JSON；空串静默回退默认。
 *
 * @param raw - JSON 字符串
 * @returns BackpackScreenConfig
 */
export function parseBackpackScreenJson(raw: string): BackpackScreenConfig {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return defaultBackpackScreen();
  }

  const parsed = safeParseJson(raw, "backpackScreen");

  if (parsed === null) {
    return defaultBackpackScreen();
  }

  return normalizeBackpackScreen(parsed);
}

/**
 * 序列化全屏背包布局（始终写出 version: 2）。
 *
 * @param config - 配置
 * @returns JSON 文本
 */
export function stringifyBackpackScreen(config: BackpackScreenConfig): string {
  return JSON.stringify({ ...config, version: 2 as const });
}
