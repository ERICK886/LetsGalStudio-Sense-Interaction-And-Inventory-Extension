/**
 * import-export.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景库 / 物品库 JSON 导入导出（Task 15）。
 * 仅支持自有格式 version 1；非法输入由 tryImport* 返回 ok:false，
 * import* 走 domain/serialize parse 并回退空库。
 */

import {
  parseItemsLibraryJson,
  parseScenesLibraryJson,
} from "../../domain/serialize";
import type {
  ItemsLibraryFile,
  ScenesLibraryFile,
} from "../../domain/types";

/**
 * tryImportScenesLibrary 成功/失败联合结果。
 */
export type TryImportScenesResult =
  | { ok: true; value: ScenesLibraryFile }
  | { ok: false; error: string };

/**
 * tryImportItemsLibrary 成功/失败联合结果。
 */
export type TryImportItemsResult =
  | { ok: true; value: ItemsLibraryFile }
  | { ok: false; error: string };

/**
 * 导出场景库为格式化 JSON 字符串（version 1）。
 *
 * @param lib - 当前场景库
 * @returns 带缩进的 JSON 文本
 *
 * @example
 * ```ts
 * downloadJsonFile(exportScenesLibrary(lib), "scenes-library.json");
 * ```
 */
export function exportScenesLibrary(lib: ScenesLibraryFile): string {
  return JSON.stringify(lib, null, 2);
}

/**
 * 导出物品库为格式化 JSON 字符串（version 1）。
 *
 * @param lib - 当前物品库
 * @returns 带缩进的 JSON 文本
 *
 * @example
 * ```ts
 * downloadJsonFile(exportItemsLibrary(lib), "items-library.json");
 * ```
 */
export function exportItemsLibrary(lib: ItemsLibraryFile): string {
  return JSON.stringify(lib, null, 2);
}

/**
 * 解析场景库 JSON（与 parseScenesLibraryJson 一致；非法回退空库）。
 *
 * @param raw - 文件或设置中的 JSON 文本
 * @returns 规范化后的 ScenesLibraryFile；失败时 emptyScenesLibrary()
 *
 * @example
 * ```ts
 * const lib = importScenesLibrary(fileText);
 * ```
 */
export function importScenesLibrary(raw: string): ScenesLibraryFile {
  return parseScenesLibraryJson(raw);
}

/**
 * 解析物品库 JSON（与 parseItemsLibraryJson 一致；非法回退空库）。
 *
 * @param raw - 文件或设置中的 JSON 文本
 * @returns 规范化后的 ItemsLibraryFile；失败时 emptyItemsLibrary()
 */
export function importItemsLibrary(raw: string): ItemsLibraryFile {
  return parseItemsLibraryJson(raw);
}

/**
 * 校验导入根对象是否为本扩展 version 1 场景库形状。
 *
 * @param parsed - JSON.parse 后的根节点
 * @returns 通过则 null；失败则 error 文案
 */
function validateScenesRoot(parsed: unknown): string | null {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "根节点必须是 { version: 1, scenes: [...] } 对象（不接受纯数组）";
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.version !== undefined && obj.version !== 1) {
    return "仅支持 version 1 场景库 JSON";
  }

  if (!Array.isArray(obj.scenes)) {
    return "缺少 scenes 数组";
  }

  return null;
}

/**
 * 校验导入根对象是否为本扩展 version 1 物品库形状。
 *
 * @param parsed - JSON.parse 后的根节点
 * @returns 通过则 null；失败则 error 文案
 */
function validateItemsRoot(parsed: unknown): string | null {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "根节点必须是 { version: 1, items: [...] } 对象（不接受纯数组）";
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.version !== undefined && obj.version !== 1) {
    return "仅支持 version 1 物品库 JSON";
  }

  if (!Array.isArray(obj.items)) {
    return "缺少 items 数组";
  }

  return null;
}

/**
 * 尝试导入场景库：严格校验后经 parse 规范化。
 *
 * 失败时返回 `{ ok: false, error }`（不写存档）；成功返回 `{ ok: true, value }`。
 * 非法 JSON / 非对象根 / 非 version 1 / 缺 scenes → ok:false。
 *
 * @param raw - 文件原始文本
 * @returns 成功含规范化库；失败含 error（parse 侧对应 empty）
 *
 * @example
 * ```ts
 * const result = tryImportScenesLibrary(text);
 * if (result.ok) commitLibrary(result.value);
 * else window.alert(result.error);
 * ```
 */
export function tryImportScenesLibrary(raw: string): TryImportScenesResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "非法 JSON：无法解析文件内容" };
  }

  const validationError = validateScenesRoot(parsed);

  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const value = parseScenesLibraryJson(raw);

  return { ok: true, value };
}

/**
 * 尝试导入物品库：严格校验后经 parse 规范化。
 *
 * @param raw - 文件原始文本
 * @returns 成功含规范化库；失败含 error
 *
 * @example
 * ```ts
 * const result = tryImportItemsLibrary(text);
 * if (result.ok) commitItemsLibrary(result.value);
 * else window.alert(result.error);
 * ```
 */
export function tryImportItemsLibrary(raw: string): TryImportItemsResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "非法 JSON：无法解析文件内容" };
  }

  const validationError = validateItemsRoot(parsed);

  if (validationError !== null) {
    return { ok: false, error: validationError };
  }

  const value = parseItemsLibraryJson(raw);

  return { ok: true, value };
}

/**
 * 触发浏览器下载 JSON 文件（Blob + 临时 `<a download>`）。
 *
 * @param content - JSON 文本
 * @param filename - 下载文件名（应含 `.json` 后缀）
 *
 * @remarks 仅在浏览器环境可用；Node 测试环境调用为 no-op。
 *
 * @example
 * ```ts
 * downloadJsonFile(exportScenesLibrary(lib), "scenes-library.json");
 * ```
 */
export function downloadJsonFile(content: string, filename: string): void {
  if (typeof document === "undefined") {
    return;
  }

  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}
