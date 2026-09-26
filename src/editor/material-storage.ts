import type { ExtensionContext } from "@avg-studio/sdk";
import {
  detectImageType, EMPTY_MATERIAL_MANIFEST, MATERIAL_MANIFEST_PATH,
  MAX_MATERIAL_BYTES, parseMaterialManifest,
  updateMaterialMetadata,
  type MaterialEntry, type MaterialKind, type MaterialManifest,
} from "./material-library";
import { assertMaterialUnused, readMaterialUsageReport } from "./material-usage";

const EXTENSION_ID = "ink.zenly.ext-27b96b";

interface FileStat {
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}
interface FileSystem {
  realpath(path: string): Promise<string>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string | Uint8Array, options?: { flag: string }): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  lstat(path: string): Promise<FileStat>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}
interface PathApi {
  join(...parts: string[]): string;
  isAbsolute(path: string): boolean;
}
interface CryptoApi { randomUUID(): string; }

function nodeApis(ctx: ExtensionContext): { fs: FileSystem; path: PathApi } {
  return {
    fs: ctx.native.node.require<FileSystem>("node:fs/promises"),
    path: ctx.native.node.require<PathApi>("node:path"),
  };
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "ENOENT";
}

async function requirePlainDirectory(fs: FileSystem, path: string): Promise<void> {
  const stat = await fs.lstat(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`素材目录必须是普通文件夹：${path}`);
  }
}

/** 只接受作者明确指定、且 extension.json ID 匹配的扩展源目录。 */
export async function connectMaterialRoot(
  ctx: ExtensionContext,
  input: string,
): Promise<{ root: string; manifest: MaterialManifest }> {
  const { fs, path } = nodeApis(ctx);
  const requested = input.trim();
  if (!requested || !path.isAbsolute(requested)) {
    throw new Error("请填写扩展源目录的绝对路径");
  }
  const root = await fs.realpath(requested);
  await requirePlainDirectory(fs, root);
  let id: unknown;
  try {
    id = (JSON.parse(await fs.readFile(path.join(root, "extension.json"), "utf8")) as { id?: unknown }).id;
  } catch {
    throw new Error("所选目录缺少有效的 extension.json");
  }
  if (id !== EXTENSION_ID) {
    throw new Error(`扩展 ID 不匹配，需要 ${EXTENSION_ID}`);
  }
  const assetsDir = path.join(root, "assets");
  try {
    await requirePlainDirectory(fs, assetsDir);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const materialsDir = path.join(assetsDir, "materials");
  try {
    await requirePlainDirectory(fs, materialsDir);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  return { root, manifest: await readMaterialManifest(fs, path, root) };
}

async function readMaterialManifest(
  fs: FileSystem, path: PathApi, root: string,
): Promise<MaterialManifest> {
  const manifestPath = path.join(root, ...MATERIAL_MANIFEST_PATH.split("/"));
  try {
    const stat = await fs.lstat(manifestPath);
    if (stat.isSymbolicLink()) throw new Error("素材清单不能是符号链接");
    return parseMaterialManifest(JSON.parse(await fs.readFile(manifestPath, "utf8")));
  } catch (error) {
    if (isMissing(error)) return EMPTY_MATERIAL_MANIFEST;
    throw error;
  }
}

interface MaterialMutation {
  manifest: MaterialManifest;
  rollback?: () => Promise<void>;
}

/** 原子清单更新与跨编辑器写锁，失败时回滚本次新增资源。 */
async function mutateMaterialManifest(
  ctx: ExtensionContext,
  root: string,
  edit: (manifest: MaterialManifest, fs: FileSystem, path: PathApi, directory: string) => Promise<MaterialMutation>,
): Promise<MaterialManifest> {
  const { fs, path } = nodeApis(ctx);
  const confirmed = await connectMaterialRoot(ctx, root);
  const assetsDir = path.join(confirmed.root, "assets");
  const materialsDir = path.join(assetsDir, "materials");
  await fs.mkdir(assetsDir, { recursive: true });
  await requirePlainDirectory(fs, assetsDir);
  await fs.mkdir(materialsDir, { recursive: true });
  await requirePlainDirectory(fs, materialsDir);
  const id = ctx.native.node.require<CryptoApi>("node:crypto").randomUUID();
  const lockPath = path.join(materialsDir, ".manifest.lock");
  try { await fs.writeFile(lockPath, new Date().toISOString(), { flag: "wx" }); }
  catch (failure) {
    if (failure && typeof failure === "object" && "code" in failure && failure.code === "EEXIST") {
      throw new Error("另一个编辑器正在修改素材库，请稍后刷新重试");
    }
    throw failure;
  }
  const temporaryPath = path.join(materialsDir, `.manifest-${id}.tmp`);
  let mutation: MaterialMutation | undefined;
  try {
    mutation = await edit(await readMaterialManifest(fs, path, confirmed.root), fs, path, materialsDir);
    const next = parseMaterialManifest(mutation.manifest);
    await fs.writeFile(temporaryPath, JSON.stringify(next, null, 2), { flag: "wx" });
    await fs.rename(temporaryPath, path.join(materialsDir, "manifest.json"));
    return next;
  } catch (failure) {
    await fs.unlink(temporaryPath).catch(() => {});
    await mutation?.rollback?.().catch(() => {});
    throw failure;
  } finally {
    await fs.unlink(lockPath);
  }
}

/** 先写唯一图片文件，再原子替换清单；失败时清理本次新增文件。 */
export async function importMaterialFile(
  ctx: ExtensionContext,
  root: string,
  file: File,
  kind: MaterialKind,
): Promise<MaterialManifest> {
  if (file.size <= 0 || file.size > MAX_MATERIAL_BYTES) {
    throw new Error(`图片大小须为 1 字节至 ${MAX_MATERIAL_BYTES / 1024 / 1024} MB`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const imageType = detectImageType(bytes);
  if (!imageType) throw new Error("仅支持 PNG、JPEG、WebP、GIF、AVIF 图片");

  const id = ctx.native.node.require<CryptoApi>("node:crypto").randomUUID();
  const filename = `${id}.${imageType.extension}`;
  const entry: MaterialEntry = {
    id,
    name: file.name.slice(0, 120) || filename,
    kind,
    path: `assets/materials/${filename}`,
    mime: imageType.mime,
    size: bytes.byteLength,
    createdAt: new Date().toISOString(),
  };
  return mutateMaterialManifest(ctx, root, async (current, fs, path, directory) => {
    const imagePath = path.join(directory, filename);
    await fs.writeFile(imagePath, bytes, { flag: "wx" });
    return {
      manifest: { version: 1, materials: [...current.materials, entry] },
      rollback: () => fs.unlink(imagePath),
    };
  });
}

export async function editMaterialMetadata(
  ctx: ExtensionContext, root: string, id: string, name: string, kind: MaterialKind,
): Promise<MaterialManifest> {
  return mutateMaterialManifest(ctx, root, async (manifest) => ({
    manifest: updateMaterialMetadata(manifest, id, name, kind),
  }));
}

/** 软删除保留图片路径，恢复时旧引用仍然有效。删除前重新检查最新设置。 */
export async function setMaterialTrashed(
  ctx: ExtensionContext, root: string, id: string, trashed: boolean,
): Promise<MaterialManifest> {
  return mutateMaterialManifest(ctx, root, async (manifest) => {
    const entry = manifest.materials.find((material) => material.id === id);
    if (!entry) throw new Error("素材不存在，请刷新素材库");
    if (trashed) assertMaterialUnused(entry.path, readMaterialUsageReport(ctx));
    const next = { ...entry };
    if (trashed) next.trashedAt = entry.trashedAt ?? new Date().toISOString();
    else delete next.trashedAt;
    return { manifest: { version: 1, materials: manifest.materials.map((material) => material.id === id ? next : material) } };
  });
}
