/** 素材库引用格式：资源路径相对扩展发行根目录。 */
export const MATERIAL_REFERENCE_PREFIX = "extension-resource://";

export function materialReference(path: string): string {
  return `${MATERIAL_REFERENCE_PREFIX}${path}`;
}

export function materialPath(reference: string): string | null {
  if (!reference.startsWith(MATERIAL_REFERENCE_PREFIX)) return null;
  const path = reference.slice(MATERIAL_REFERENCE_PREFIX.length);
  return /^assets\/materials\/[a-z0-9-]+\.(png|jpg|webp|gif|avif)$/.test(path)
    ? path : null;
}
