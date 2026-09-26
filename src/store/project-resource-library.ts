import type { SettingsAPI } from "@avg-studio/sdk";
import { projectResourcePath } from "../shared/project-resource-reference";
import { logError } from "../shared/logger";

/** 数组对象供 Studio 的扩展设置扫描器直接递归，不能 stringify。 */
export const PROJECT_RESOURCE_LIBRARY_KEY = "projectResourceLibrary";

export interface ProjectResourceEntry {
  path: string;
  usedBy: string;
}

interface ResourceSource {
  label: string;
  value: unknown;
}

const RESOURCE_FIELDS = new Set([
  "baseImage", "src", "icon", "detailImage", "asset",
  "imageSrc", "hoverImageSrc", "pressedImageSrc", "seSrc",
  "onAsset", "offAsset", "trackAsset", "fillAsset", "handleAsset",
  "checkedAsset", "uncheckedAsset", "tabAsset", "activeTabAsset",
]);

/** 仅采集已有资源字段，名称、描述、变量值和 CSS 不会被猜成素材。 */
export function buildProjectResourceLibrary(sources: readonly ResourceSource[]): ProjectResourceEntry[] {
  const usage = new Map<string, Set<string>>();
  for (const source of sources) {
    let data = source.value;
    if (data === undefined || data === null || data === "") continue;
    if (typeof data === "string") {
      if (!data.trim()) continue;
      try { data = JSON.parse(data); }
      catch { throw new Error(source.label + " JSON 无法解析，保留原引用素材库。"); }
    }
    if (!data || typeof data !== "object") {
      throw new Error(source.label + "配置格式不支持，保留原引用素材库。");
    }
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== "object") return;
      for (const [key, item] of Object.entries(value)) {
        if (RESOURCE_FIELDS.has(key)) {
          const path = projectResourcePath(item);
          if (path) {
            if (!usage.has(path)) usage.set(path, new Set());
            usage.get(path)!.add(source.label);
          }
        }
        if (item && typeof item === "object") visit(item);
      }
    };
    visit(data);
  }
  return [...usage].sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .map(([path, labels]) => ({ path, usedBy: [...labels].sort().join("、") }));
}

const SOURCE_SETTINGS = [
  ["editor", "scenesLibraryJson"],
  ["editor", "itemsLibraryJson"],
  ["editor", "sceneUiJson"],
  ["backpack-hud", "inventoryHudJson"],
  ["backpack", "backpackScreenJson"],
  ["backpack-hud", "backpackScreenJson"],
  ["backpack-hud", "itemToastJson"],
] as const;

function blank(value: unknown): boolean {
  return value == null || (typeof value === "string" && !value.trim());
}

/** 首次打开补齐旧项目，后续同步保存；读写失败时保留上次有效清单。 */
export function syncProjectResourceLibrary(settings: SettingsAPI): boolean {
  const get = (moduleId: string, key: string) => settings.cross.get(moduleId, key);
  const sceneUi = get("editor", "sceneUiJson");
  const backpack = get("backpack", "backpackScreenJson");
  const next = buildProjectResourceLibrary([
    { label: "场景库", value: get("editor", "scenesLibraryJson") },
    { label: "物品库", value: get("editor", "itemsLibraryJson") },
    { label: "场景界面", value: blank(sceneUi) ? get("backpack-hud", "itemToastJson") : sceneUi },
    { label: "快捷栏 HUD", value: get("backpack-hud", "inventoryHudJson") },
    { label: "全屏背包", value: blank(backpack) ? get("backpack-hud", "backpackScreenJson") : backpack },
  ]);
  const previous = get("editor", PROJECT_RESOURCE_LIBRARY_KEY);
  if (JSON.stringify(previous) === JSON.stringify(next)) return false;
  settings.cross.set("editor", PROJECT_RESOURCE_LIBRARY_KEY, next);
  return true;
}

/** 使用 SDK 设置订阅，不写扩展目录；清理后不再访问当前工程。 */
export function startProjectResourceLibrarySync(
  settings: SettingsAPI,
  onError: (error: unknown) => void = (error) =>
    logError("project-resource-library", "同步引用素材库失败", error),
): () => void {
  let active = true;
  let syncing = false;
  const subscriptions: Array<() => void> = [];
  const sync = () => {
    if (!active || syncing) return;
    syncing = true;
    try { syncProjectResourceLibrary(settings); }
    catch (error) { onError(error); }
    finally { syncing = false; }
  };
  const stop = () => {
    active = false;
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
  };
  try {
    for (const [moduleId, key] of SOURCE_SETTINGS) {
      subscriptions.push(settings.cross.subscribe(moduleId, key, sync));
    }
    subscriptions.push(settings.cross.subscribe("editor", PROJECT_RESOURCE_LIBRARY_KEY, sync));
    sync();
  } catch (error) {
    stop();
    onError(error);
  }
  return stop;
}
