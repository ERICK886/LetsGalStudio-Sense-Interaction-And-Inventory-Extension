import type { ExtensionContext } from "@avg-studio/sdk";
import {
  detectImageType, EMPTY_MATERIAL_MANIFEST, MATERIAL_MANIFEST_PATH,
  MAX_MATERIAL_BYTES, parseMaterialManifest,
  type MaterialEntry, type MaterialKind, type MaterialManifest,
} from "./material-library";

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

  const { fs, path } = nodeApis(ctx);
  const confirmed = await connectMaterialRoot(ctx, root);
  const assetsDir = path.join(confirmed.root, "assets");
  const materialsDir = path.join(assetsDir, "materials");
  await fs.mkdir(assetsDir, { recursive: true });
  await requirePlainDirectory(fs, assetsDir);
  await fs.mkdir(materialsDir, { recursive: true });
  await requirePlainDirectory(fs, materialsDir);

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
  const imagePath = path.join(materialsDir, filename);
  const manifestPath = path.join(materialsDir, "manifest.json");
  const temporaryPath = path.join(materialsDir, `.manifest-${id}.tmp`);
  await fs.writeFile(imagePath, bytes, { flag: "wx" });
  try {
    const current = await readMaterialManifest(fs, path, confirmed.root);
    const next: MaterialManifest = { version: 1, materials: [...current.materials, entry] };
    await fs.writeFile(temporaryPath, JSON.stringify(next, null, 2), { flag: "wx" });
    try {
      await fs.rename(temporaryPath, manifestPath);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => {});
      throw error;
    }
    return next;
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {});
    await fs.unlink(imagePath).catch(() => {});
    throw error;
  }
}
