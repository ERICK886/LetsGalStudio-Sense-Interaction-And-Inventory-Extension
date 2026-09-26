/** Studio 工程图片清单，只通过 SDK URL 读取，不写入工程或扩展目录。 */
export interface ProjectImageResource {
  id: string;
  path: string;
  name: string;
}

export interface ProjectAssetResolver {
  resolve(uri: string): { url: string };
}

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|svg|avif|ico|cur)$/i;
const MANIFEST_PATH = ".manifest.json";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 清单路径相对于工程 assets，拒绝绝对路径、URL 和越界路径。 */
function imagePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.replace(/\\/g, "/");
  if (/[\x00-\x1f:#?]/.test(path) || path.startsWith("/")) return null;
  if (path.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return IMAGE_EXTENSION.test(path) ? path : null;
}

export function parseProjectImageManifest(value: unknown): ProjectImageResource[] {
  if (!isObject(value) || value.version !== 1 || !isObject(value.entries)) {
    throw new Error("工程素材清单格式不支持，请在 Studio 资产页重新扫描后刷新。");
  }
  const images: ProjectImageResource[] = [];
  const paths = new Set<string>();
  for (const [id, entry] of Object.entries(value.entries)) {
    if (!/^[a-f0-9]{32}$/i.test(id) || !isObject(entry)) continue;
    const path = imagePath(entry.path);
    if (!path || paths.has(path)) continue;
    paths.add(path);
    images.push({ id, path, name: path.split("/").pop()! });
  }
  return images.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
}

export async function readProjectImageResources(
  asset: ProjectAssetResolver | undefined,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ProjectImageResource[]> {
  const url = asset?.resolve(MANIFEST_PATH)?.url;
  if (!url || !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    throw new Error("未连接 Studio 工程资源，请在已打开的工程中使用场景编辑器。");
  }
  const response = await fetcher(url, { cache: "no-store", signal });
  if (response.status === 404) {
    throw new Error("工程素材清单尚未生成，请在 Studio 资产页导入图片或重新扫描后刷新。");
  }
  if (!response.ok) throw new Error(
    "无法读取工程素材清单（" + response.status + "），请确认工程仍然打开后重试。",
  );
  let manifest: unknown;
  try {
    manifest = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("工程素材清单无法解析，请在 Studio 资产页重新扫描后刷新。");
  }
  return parseProjectImageManifest(manifest);
}
