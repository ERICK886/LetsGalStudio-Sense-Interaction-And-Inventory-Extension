/**
 * coords.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 坐标与比例相关的数值工具。
 */

/**
 * 将数值钳制到闭区间 [0, 1]。
 *
 * @param n - 输入数值
 * @returns 钳制后的 0~1 浮点数
 *
 * @example
 * clamp01(-0.2); // 0
 * clamp01(1.5);  // 1
 */
export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
