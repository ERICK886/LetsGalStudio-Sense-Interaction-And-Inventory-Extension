/**
 * ui-style.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 */
import { describe, it, expect } from "vitest";
import {
  normalizeUiRect,
  applyUiBoxStyle,
  accentAlpha,
} from "../../src/domain/ui-style";

describe("normalizeUiRect", () => {
  it("非法 w 回退 fallback.w", () => {
    expect(
      normalizeUiRect({ x: 10, y: 20, w: -1 }, { x: 0, y: 0, w: 100, h: 50 }),
    ).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });
});

describe("applyUiBoxStyle", () => {
  it("shadow 0.5 产生非空 boxShadow", () => {
    const css = applyUiBoxStyle({ shadow: 0.5 });
    expect(String(css.boxShadow || "")).not.toEqual("none");
    expect(String(css.boxShadow || "").length).toBeGreaterThan(0);
  });
});

describe("accentAlpha", () => {
  it("拼接 8 位 hex", () => {
    expect(accentAlpha("#64e0d0", "22").toLowerCase()).toBe("#64e0d022");
  });
});
