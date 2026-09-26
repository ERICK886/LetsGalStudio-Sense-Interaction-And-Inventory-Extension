import { materialPath, materialReference } from "../shared/material-reference";

export type MaterialKind = "scene" | "hotspot" | "item" | "other";

export interface MaterialEntry {
  id: string;
  name: string;
  kind: MaterialKind;
  path: string;
  mime: string;
  size: number;
  createdAt: string;
}

export interface MaterialManifest {
  version: 1;
  materials: MaterialEntry[];
}

export const MATERIAL_MANIFEST_PATH = "assets/materials/manifest.json";
export const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;
export const EMPTY_MATERIAL_MANIFEST: MaterialManifest = { version: 1, materials: [] };

export function parseMaterialManifest(raw: unknown): MaterialManifest {
  if (!raw || typeof raw !== "object") throw new Error("素材清单格式错误");
  const value = raw as Partial<MaterialManifest>;
  if (value.version !== 1 || !Array.isArray(value.materials)) {
    throw new Error("素材清单版本或列表格式错误");
  }
  const materials = value.materials.map((entry) => {
    if (!entry || typeof entry !== "object" ||
      typeof entry.id !== "string" || !/^[a-z0-9-]+$/.test(entry.id) ||
      typeof entry.name !== "string" ||
      !["scene", "hotspot", "item", "other"].includes(entry.kind) ||
      typeof entry.path !== "string" || !materialPath(materialReference(entry.path)) ||
      typeof entry.mime !== "string" ||
      typeof entry.size !== "number" || !Number.isFinite(entry.size) || entry.size < 0 ||
      typeof entry.createdAt !== "string") {
      throw new Error("素材清单中存在无效条目");
    }
    return entry as MaterialEntry;
  });
  if (new Set(materials.map((entry) => entry.id)).size !== materials.length) {
    throw new Error("素材清单包含重复 ID");
  }
  return { version: 1, materials };
}

/** 依据文件内容识别图片，不信任扩展名或浏览器提供的 MIME。 */
export function detectImageType(bytes: Uint8Array): { extension: string; mime: string } | null {
  const ascii = (start: number, end: number): string =>
    String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG" &&
    bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) {
    return { extension: "png", mime: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", mime: "image/jpeg" };
  }
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { extension: "webp", mime: "image/webp" };
  }
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) {
    return { extension: "gif", mime: "image/gif" };
  }
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" &&
    ["avif", "avis"].includes(ascii(8, 12))) {
    return { extension: "avif", mime: "image/avif" };
  }
  return null;
}
