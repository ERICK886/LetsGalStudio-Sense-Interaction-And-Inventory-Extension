/**
 * alpha-hit.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 对齐大地图剪影命中 / contain 映射单测。
 */

import { describe, expect, it } from "vitest";
import {
  buildSilhouetteHitMask,
  contentRectContain,
  isOpaqueAt,
  mapContainLocalToImagePixel,
  readAlpha,
} from "../../src/shared/alpha-hit";

describe("contentRectContain", () => {
  it("横向图上下留白", () => {
    expect(contentRectContain(100, 100, 200, 100)).toEqual({
      left: 0,
      top: 25,
      width: 100,
      height: 50,
    });
  });

  it("非法尺寸返回 null", () => {
    expect(contentRectContain(0, 100, 200, 100)).toBeNull();
  });
});

describe("mapContainLocalToImagePixel", () => {
  it("命中内容区中心", () => {
    const p = mapContainLocalToImagePixel(50, 50, 100, 100, 200, 100);

    expect(p).toEqual({ x: 100, y: 50 });
  });

  it("letterbox 区域返回 null", () => {
    expect(mapContainLocalToImagePixel(50, 10, 100, 100, 200, 100)).toBeNull();
  });
});

describe("readAlpha", () => {
  it("读取 alpha 通道", () => {
    const data = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray(8),
    } as ImageData;
    data.data[3] = 200;
    data.data[7] = 10;

    expect(readAlpha(data, 0, 0)).toBe(200);
    expect(readAlpha(data, 1, 0)).toBe(10);
    expect(readAlpha(data, 9, 0)).toBe(0);
  });
});

describe("isOpaqueAt", () => {
  it("按阈值判定 ImageData 像素", () => {
    const data = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray(8),
    } as ImageData;
    data.data[3] = 200;
    data.data[7] = 10;

    expect(isOpaqueAt(data, 0, 0, 16)).toBe(true);
    expect(isOpaqueAt(data, 1, 0, 16)).toBe(false);
  });
});

describe("buildSilhouetteHitMask", () => {
  it("空心方框：外部不命中，边框与内部命中", () => {
    // 5x5：边缘透明，内圈一圈不透明，中心透明（镂空）
    const w = 5;
    const h = 5;
    const raw = new Uint8ClampedArray(w * h * 4);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const onRing =
          x >= 1 && x <= 3 && y >= 1 && y <= 3 && !(x === 2 && y === 2);
        const i = (y * w + x) * 4;

        raw[i + 3] = onRing ? 255 : 0;
      }
    }

    const data = { width: w, height: h, data: raw } as ImageData;
    const mask = buildSilhouetteHitMask(data, 16);

    // 四角外部
    expect(mask[0]).toBe(0);
    expect(mask[4]).toBe(0);
    // 边框
    expect(mask[1 * 5 + 1]).toBe(1);
    // 镂空内部（被围住）
    expect(mask[2 * 5 + 2]).toBe(1);
  });
});
