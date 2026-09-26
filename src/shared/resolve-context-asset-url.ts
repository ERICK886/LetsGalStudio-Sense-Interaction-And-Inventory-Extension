import type { ExtensionContext } from "@avg-studio/sdk";
import { resolveAssetUrl, type AssetResolveFn } from "./resolve-asset-url";

/** 作者素材库和旧工程资源共用的 URL 解析入口。 */
export function resolveContextAssetUrl(ctx: ExtensionContext, uri: string): string {
  return resolveAssetUrl(
    uri,
    ctx.asset?.resolve?.bind(ctx.asset),
    ctx.extensionResource?.url?.bind(ctx.extensionResource),
  );
}

/** 兼容现有接收 asset.resolve 形状的画布和背包组件。 */
export function createContextAssetResolver(ctx: ExtensionContext): AssetResolveFn {
  return (uri) => ({ url: resolveContextAssetUrl(ctx, uri) });
}
