/**
 * play-se.ts
 * 作者: 池水三两升
 * 日期: 2026-08-14
 * 版本: 0.1.0
 *
 * 播放作者配置的短音效（SE）；空 URI 不播放，失败静默忽略。
 */

import { resolveAssetUrl, type AssetResolveFn } from "./resolve-asset-url";

/**
 * 解析并播放一次 SE。
 *
 * @param uri - 资源路径；空 / 未配置则直接返回
 * @param resolve - 可选 `ctx.asset.resolve`
 */
export function playResolvedSe(
  uri: string | undefined | null,
  resolve: AssetResolveFn | undefined,
): void {
  if (typeof uri !== "string") {
    return;
  }

  const trimmed = uri.trim();

  if (trimmed.length === 0) {
    return;
  }

  const url = resolveAssetUrl(trimmed, resolve);

  if (url.length === 0) {
    return;
  }

  try {
    const audio = new Audio(url);
    void audio.play().catch(() => {
      // 自动播放策略或资源缺失时忽略
    });
  } catch {
    // 宿主无 Audio 时忽略
  }
}
