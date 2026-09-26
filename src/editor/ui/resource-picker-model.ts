import type { ProjectImageResource } from "../project-image-resources";

/** 与 Studio 资产管理的一级虚拟分类一致，不暴露素材包内部的子目录。 */
const CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ["backgrounds", "场景"], ["characters", "立绘"], ["dynamic", "动态图像"],
  ["ui", "界面"], ["particles", "粒子贴图"], ["transitions", "过渡图"],
  ["bgm", "音乐"], ["se", "音效"], ["voice", "语音"], ["fonts", "字体"], ["video", "视频"],
];
export interface ResourceCategory { id: string; label: string; count: number }
export function resourceCategory(path: string): string {
  const top = path.replace(/\\/g, "/").split("/")[0];
  return CATEGORIES.some(([id]) => id === top) ? top : "uncategorized";
}
export function buildResourceCategories(resources: readonly ProjectImageResource[]): ResourceCategory[] {
  const counts = new Map<string, number>();
  for (const resource of resources) {
    const id = resourceCategory(resource.path);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...CATEGORIES, ["uncategorized", "未分类"] as const]
    .filter(([id]) => counts.has(id))
    .map(([id, label]) => ({ id, label, count: counts.get(id)! }));
}
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("zh-Hans-CN");

/** 全局搜索支持空格组合关键词；文件名命中优先于路径命中。 */
export function filterResources(
  resources: readonly ProjectImageResource[], category: string | null, query: string,
): ProjectImageResource[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return resources.filter((resource) => !category || resourceCategory(resource.path) === category);
  const fullQuery = terms.join(" ");
  return resources.map((resource, index) => {
    const path = normalize(resource.path);
    const name = normalize(resource.name);
    const stem = name.replace(/\.[^.]+$/, "");
    const score = !terms.every((term) => path.includes(term)) ? Infinity :
      stem === fullQuery ? 0 : name === fullQuery ? 1 : stem.startsWith(fullQuery) ? 2 :
        name.startsWith(fullQuery) ? 3 : name.includes(fullQuery) ? 4 :
          10 + terms.reduce((sum, term) => sum + (stem.startsWith(term) ? 1 : name.includes(term) ? 3 : 8), 0);
    return { resource, index, score };
  }).filter((result) => Number.isFinite(result.score))
    .sort((a, b) => a.score - b.score || a.index - b.index).map(({ resource }) => resource);
}
export const RESOURCE_ROW_HEIGHT = 166;
export function resourceGridWindow(count: number, width: number, height: number, scrollTop: number) {
  const columns = Math.max(1, Math.floor((width - 32 + 12) / (132 + 12)));
  const rows = Math.ceil(count / columns);
  const firstRow = Math.max(0, Math.min(rows, Math.floor(Math.max(0, scrollTop) / RESOURCE_ROW_HEIGHT) - 2));
  const lastRow = Math.min(rows, Math.ceil((Math.max(0, scrollTop) + height) / RESOURCE_ROW_HEIGHT) + 2);
  return { columns, start: firstRow * columns, end: Math.min(count, lastRow * columns),
    top: firstRow * RESOURCE_ROW_HEIGHT, height: rows * RESOURCE_ROW_HEIGHT + 32 };
}
