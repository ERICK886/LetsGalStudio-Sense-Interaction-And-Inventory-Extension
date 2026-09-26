/** 工程资源的稳定相对路径；扩展素材和外部 URL 不进入工程引用库。 */
export function projectResourcePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let path = value.trim().replace(/\\/g, "/");
  if (/^asset:\/\//i.test(path)) path = path.slice("asset://".length);
  if (/^assets\//i.test(path)) path = path.slice("assets/".length);
  if (!path || path.startsWith("/") || /[\x00-\x1f:#?]/.test(path)) return null;
  if (path.split("/").some((part) => !part || part === "." || part === "..")) return null;
  if (!/^[a-f0-9]{32}$/i.test(path) &&
      !/\.(png|jpe?g|webp|gif|svg|avif|bmp|ico|cur|mp3|wav|ogg|flac|m4a|aac|opus|woff2?|ttf|otf)$/i.test(path)) return null;
  return path;
}
