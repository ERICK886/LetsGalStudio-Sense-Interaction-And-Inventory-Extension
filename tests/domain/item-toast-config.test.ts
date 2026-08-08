/**
 * item-toast-config.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 获得物品 Toast 配置（placement / style / 锚点几何）的领域单测。
 */
import { describe, expect, it } from "vitest";
import {
  computeToastAnchorStyle,
  defaultItemToastConfig,
  normalizeItemToastConfig,
  resolveItemToastAppearance,
} from "../../src/domain/item-toast-config";

describe("defaultItemToastConfig", () => {
  it("默认 above / gap 48 / 对齐旧观感的 style", () => {
    const d = defaultItemToastConfig();
    expect(d.version).toBe(1);
    expect(d.placement).toBe("above");
    expect(d.gap).toBe(48);
    expect(d.offsetX).toBe(0);
    expect(d.offsetY).toBe(0);
    expect(d.style.background).toBe("rgba(10, 14, 12, 0.88)");
    expect(d.style.color).toBe("#F5F7F6");
    expect(d.style.fontSize).toBe(13);
    expect(d.style.fontWeight).toBe(600);
    expect(d.style.borderRadius).toBe(8);
    expect(d.style.shadow).toBe(1);
  });
});

describe("normalizeItemToastConfig", () => {
  it("非法输入回退默认", () => {
    expect(normalizeItemToastConfig(null).placement).toBe("above");
    expect(normalizeItemToastConfig({ placement: "nope" }).placement).toBe(
      "above",
    );
  });
});

describe("resolveItemToastAppearance", () => {
  it("动作未覆盖时等于全局", () => {
    const g = defaultItemToastConfig();
    expect(resolveItemToastAppearance(g, null)).toEqual({
      placement: g.placement,
      offsetX: g.offsetX,
      offsetY: g.offsetY,
      gap: g.gap,
      style: g.style,
    });
  });

  it("仅覆盖 placement 时 style 仍全局", () => {
    const g = defaultItemToastConfig();
    const r = resolveItemToastAppearance(g, { placement: "below" });
    expect(r.placement).toBe("below");
    expect(r.style).toEqual(g.style);
  });

  it("partial style 覆盖合并", () => {
    const g = defaultItemToastConfig();
    const r = resolveItemToastAppearance(g, {
      style: { color: "#ff0000", fontSize: 20 },
    });
    expect(r.style.color).toBe("#ff0000");
    expect(r.style.fontSize).toBe(20);
    expect(r.style.background).toBe(g.style.background);
  });
});

describe("computeToastAnchorStyle", () => {
  const anchor = { x: 100, y: 200 };

  it("above: 锚点上移 gap，translate(-50%, -100%)", () => {
    const s = computeToastAnchorStyle(anchor, {
      placement: "above",
      gap: 48,
      offsetX: 0,
      offsetY: 0,
    });
    expect(s.left).toBe(100);
    expect(s.top).toBe(200 - 48);
    expect(s.transform).toBe("translate(-50%, -100%)");
  });

  it("below / left / right / center", () => {
    expect(
      computeToastAnchorStyle(anchor, {
        placement: "below",
        gap: 48,
        offsetX: 0,
        offsetY: 0,
      }),
    ).toEqual({
      left: 100,
      top: 248,
      transform: "translate(-50%, 0)",
    });
    expect(
      computeToastAnchorStyle(anchor, {
        placement: "left",
        gap: 48,
        offsetX: 0,
        offsetY: 0,
      }),
    ).toEqual({
      left: 52,
      top: 200,
      transform: "translate(-100%, -50%)",
    });
    expect(
      computeToastAnchorStyle(anchor, {
        placement: "right",
        gap: 48,
        offsetX: 0,
        offsetY: 0,
      }),
    ).toEqual({
      left: 148,
      top: 200,
      transform: "translate(0, -50%)",
    });
    expect(
      computeToastAnchorStyle(anchor, {
        placement: "center",
        gap: 48,
        offsetX: 10,
        offsetY: -5,
      }),
    ).toEqual({
      left: 110,
      top: 195,
      transform: "translate(-50%, -50%)",
    });
  });
});
