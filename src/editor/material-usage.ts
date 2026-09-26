import type { ExtensionContext } from "@avg-studio/sdk";
import { materialReference } from "../shared/material-reference";

export interface MaterialUsageSource { label: string; value: unknown; }
export interface MaterialUsageReport { sources: MaterialUsageSource[]; error: string; }
export interface MaterialUsage { label: string; field: string; }

export const MATERIAL_USAGE_FIELDS = [
  ["editor", "scenesLibraryJson", "场景库"],
  ["editor", "itemsLibraryJson", "物品库"],
  ["editor", "recipesLibraryJson", "配方库"],
  ["editor", "sceneUiJson", "场景 UI"],
  ["backpack-hud", "inventoryHudJson", "快捷栏 UI"],
  ["backpack", "backpackScreenJson", "背包 UI"],
  ["backpack-hud", "backpackScreenJson", "旧版背包 UI"],
  ["backpack-hud", "itemToastJson", "旧版获得物品提示"],
] as const;

/** 扫描原始设置而非容错解析后的空库，损坏或读取失败时禁止删除。 */
export function readMaterialUsageReport(ctx: ExtensionContext): MaterialUsageReport {
  const sources: MaterialUsageSource[] = [];
  try {
    for (const [moduleId, key, label] of MATERIAL_USAGE_FIELDS) {
      let raw: unknown;
      try { raw = ctx.settings.cross.get(moduleId, key); }
      catch (failure) {
        if (moduleId !== "editor") throw new Error(`无法读取${label}`);
        raw = ctx.settings.get(key);
      }
      if ((raw == null || (typeof raw === "string" && !raw.trim())) && moduleId === "editor") raw = ctx.settings.get(key);
      if (raw == null || (typeof raw === "string" && !raw.trim())) continue;
      let value: unknown;
      try { value = typeof raw === "string" ? JSON.parse(raw) : raw; }
      catch { throw new Error(`${label}设置格式错误，请先修复后再删除素材`); }
      if (!value || typeof value !== "object") throw new Error(`${label}设置格式错误，请先修复后再删除素材`);
      sources.push({ label, value });
    }
    return { sources, error: "" };
  } catch (failure) {
    return { sources, error: failure instanceof Error ? failure.message : "引用检查失败" };
  }
}

/** 同时覆盖直接图片字段、UI 节点、动作参数和自定义 CSS 中的资源引用。 */
export function collectMaterialUsage(path: string, sources: readonly MaterialUsageSource[]): MaterialUsage[] {
  const reference = materialReference(path);
  const result: MaterialUsage[] = [];
  const visit = (value: unknown, label: string, field: string): void => {
    if (typeof value === "string") {
      if (value.includes(reference) || value.includes(path)) result.push({ label, field });
    } else if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, label, `${field}[${index}]`));
    } else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const namedLabel = typeof record.name === "string" && record.name.trim()
        ? `${label} / ${record.name}` : label;
      for (const [key, child] of Object.entries(record)) {
        visit(child, namedLabel, field ? `${field}.${key}` : key);
      }
    }
  };
  for (const source of sources) visit(source.value, source.label, "");
  return result;
}

export function assertMaterialUnused(path: string, report: MaterialUsageReport): void {
  if (report.error) throw new Error(`无法完成引用检查：${report.error}`);
  const usages = collectMaterialUsage(path, report.sources);
  if (usages.length) throw new Error(`素材仍有 ${usages.length} 处引用，请先修改对应场景、物品或 UI`);
}
