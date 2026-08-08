/**
 * resolve-asset-url.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 将领域资源路径（如 `ui/item1.png`）经 SDK `ctx.asset.resolve` 转为可加载 URL。
 * 场景底图 / 交互点 / 物品图标须共用此逻辑，禁止把相对路径直接塞给 `<img src>`。
 */

/**
 * SDK asset.resolve 的最小形状（避免强耦合完整 AssetAPI）。
 */
export type AssetResolveFn = (uri: string) => { url: string };

/**
 * 解析资源 URI 为浏览器可加载的 URL。
 *
 * @param uri - 领域路径、asset://、或已是绝对 URL
 * @param resolve - 可选；`ctx.asset.resolve.bind(ctx.asset)`
 * @returns 可加载 URL；空输入返回 `""`
 *
 * @example
 * ```ts
 * const url = resolveAssetUrl(
 *   "ui/item1.png",
 *   ctx.asset?.resolve?.bind(ctx.asset),
 * );
 * // → blob:… 或宿主可访问的绝对地址
 * ```
 *
 * @remarks
 * - `http(s):` / `blob:` / `data:` 原样返回
 * - 无 resolve 时回退原始 uri（便于测试；Studio 内应始终有 resolve）
 */
export function resolveAssetUrl(
  uri: string,
  resolve: AssetResolveFn | undefined,
): string {
  if (!uri) {
    return "";
  }

  const trimmed = uri.trim();

  if (trimmed.length === 0) {
    return "";
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:")
  ) {
    return trimmed;
  }

  if (resolve === undefined) {
    return trimmed;
  }

  try {
    return resolve(trimmed).url || trimmed;
  } catch {
    return trimmed;
  }
}
