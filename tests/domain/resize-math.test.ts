/**
 * resize-math.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 边框缩放纯函数单测。
 */
import { describe, expect, it } from "vitest";
import { applyResizeDrag } from "../../src/editor/canvas/resize-math";

describe("applyResizeDrag", () => {
  it("se 角拖拽增大宽高", () => {
    const next = applyResizeDrag({
      handle: "se",
      start: {
        width: 100,
        height: 50,
        centerLeft: 100,
        centerTop: 100,
      },
      dx: 20,
      dy: 10,
      lockAspect: false,
      minWidth: 8,
      minHeight: 8,
    });

    expect(next.width).toBe(120);
    expect(next.height).toBe(60);
  });

  it("角手柄 lockAspect 时保持比例", () => {
    const next = applyResizeDrag({
      handle: "se",
      start: {
        width: 100,
        height: 50,
        centerLeft: 100,
        centerTop: 100,
      },
      dx: 50,
      dy: 0,
      lockAspect: true,
      minWidth: 8,
      minHeight: 8,
    });

    expect(next.width / next.height).toBeCloseTo(2, 5);
  });

  it("尺寸不低于 min", () => {
    const next = applyResizeDrag({
      handle: "se",
      start: {
        width: 20,
        height: 20,
        centerLeft: 50,
        centerTop: 50,
      },
      dx: -100,
      dy: -100,
      lockAspect: false,
      minWidth: 8,
      minHeight: 8,
    });

    expect(next.width).toBeGreaterThanOrEqual(8);
    expect(next.height).toBeGreaterThanOrEqual(8);
  });
});
