/**
 * free-layout-selection.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 自由布局选中/拖拽/resize 纯逻辑单测：吸附、Shift 锁轴、最小尺寸。
 */

import { describe, it, expect } from "vitest";
import {
  snapEdges,
  applyDrag,
  applyResize,
} from "../../src/editor/ui/free-layout-selection";

describe("snapEdges", () => {
  it("阈值内吸附到最近目标（默认 threshold=4）", () => {
    expect(snapEdges(102, [100])).toBe(100);
    expect(snapEdges(98, [100])).toBe(100);
  });

  it("超出阈值时不吸附", () => {
    expect(snapEdges(106, [100])).toBe(106);
    expect(snapEdges(94, [100])).toBe(94);
  });

  it("多个目标时选距离最近者", () => {
    expect(snapEdges(103, [100, 108])).toBe(100);
    expect(snapEdges(106, [100, 108])).toBe(108);
  });

  it("支持自定义 threshold", () => {
    expect(snapEdges(107, [100], 8)).toBe(100);
    expect(snapEdges(109, [100], 8)).toBe(109);
  });
});

describe("applyDrag", () => {
  it("无 Shift 时按 dx/dy 平移", () => {
    expect(
      applyDrag({ x: 10, y: 20 }, 5, 7, { shiftKey: false }),
    ).toEqual({ x: 15, y: 27 });
  });

  it("Shift 按下时锁定位移更大的一轴", () => {
    expect(
      applyDrag({ x: 0, y: 0 }, 10, 3, { shiftKey: true }),
    ).toEqual({ x: 10, y: 0 });

    expect(
      applyDrag({ x: 0, y: 0 }, 3, 10, { shiftKey: true }),
    ).toEqual({ x: 0, y: 10 });
  });

  it("Shift 且两轴位移相等时优先水平", () => {
    expect(
      applyDrag({ x: 5, y: 5 }, 8, 8, { shiftKey: true }),
    ).toEqual({ x: 13, y: 5 });
  });

  it("对 snapX / snapY 分别吸附", () => {
    expect(
      applyDrag({ x: 102, y: 48 }, 0, 0, {
        shiftKey: false,
        snapX: [100],
        snapY: [50],
      }),
    ).toEqual({ x: 100, y: 50 });
  });
});

describe("applyResize", () => {
  const origin = { x: 100, y: 100, w: 100, h: 80 };

  it("se 手柄按 dx/dy 增宽增高", () => {
    expect(applyResize(origin, "se", 20, 10)).toEqual({
      x: 100,
      y: 100,
      w: 120,
      h: 90,
    });
  });

  it("w 手柄拖拽时保持右缘固定", () => {
    expect(applyResize(origin, "w", 30, 0)).toEqual({
      x: 130,
      y: 100,
      w: 70,
      h: 80,
    });
  });

  it("默认最小尺寸 24×24：从东侧缩小时钳制宽度", () => {
    expect(applyResize(origin, "e", -90, 0)).toEqual({
      x: 100,
      y: 100,
      w: 24,
      h: 80,
    });
  });

  it("默认最小尺寸 24×24：从北侧缩小时钳制高度并保持底边", () => {
    expect(applyResize(origin, "n", 0, 70)).toEqual({
      x: 100,
      y: 156,
      w: 100,
      h: 24,
    });
  });

  it("支持自定义 minSize", () => {
    expect(
      applyResize(origin, "e", -50, 0, { w: 60, h: 40 }),
    ).toEqual({
      x: 100,
      y: 100,
      w: 60,
      h: 80,
    });
  });
});
