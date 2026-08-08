/**
 * id.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 生成带前缀的短随机 ID，用于热点、物品实例等。
 */

/**
 * 创建随机 ID 字符串。
 *
 * @param prefix - ID 前缀，默认 `"id"`
 * @returns 形如 `{prefix}_{random}` 的字符串
 *
 * @example
 * createId();        // "id_k3j9x2ab"
 * createId("hotspot"); // "hotspot_m8p1q4rt"
 */
export function createId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
