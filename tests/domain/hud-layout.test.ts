/**
 * hud-layout.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * resolveHudLayout：8 槽几何、belowRoot / absolute 打开按钮定位。
 */
import { describe, it, expect } from "vitest";
import { resolveHudLayout } from "../../src/domain/hud-layout";
import {
  defaultInventoryHud,
  normalizeInventoryHud,
} from "../../src/domain/inventory-hud";

describe("resolveHudLayout", () => {
  it("belowRoot 按钮在竖排槽位下方", () => {
    const cfg = defaultInventoryHud();
    const layout = resolveHudLayout(cfg);

    expect(layout.slots).toHaveLength(8);

    const last = layout.slots[7]!;

    expect(layout.openBagButton.y).toBeGreaterThanOrEqual(last.y + last.h);
    expect(layout.openBagButton.x).toBe(layout.root.x);
  });

  it("belowRoot 竖排几何公式与默认样式透传", () => {
    const cfg = defaultInventoryHud();
    const layout = resolveHudLayout(cfg);
    const { slotSize, gap, x, y } = {
      slotSize: cfg.nodes.quickbarRoot.slotSize,
      gap: cfg.nodes.quickbarRoot.gap,
      x: cfg.nodes.quickbarRoot.rect.x,
      y: cfg.nodes.quickbarRoot.rect.y,
    };
    const fontSize = cfg.nodes.openBagButton.style.fontSize ?? 12;

    expect(layout.root).toEqual({
      x,
      y,
      direction: "column",
      slotSize,
      gap,
    });
    expect(layout.slots[0]).toEqual({ x, y, w: slotSize, h: slotSize });
    expect(layout.slots[7]).toEqual({
      x,
      y: y + 7 * (slotSize + gap),
      w: slotSize,
      h: slotSize,
    });
    expect(layout.openBagButton).toEqual({
      x,
      y: y + 8 * (slotSize + gap) + 4,
      w: slotSize,
      h: Math.max(32, fontSize + 16),
    });
    expect(layout.accent).toBe(cfg.accent);
    expect(layout.slotStyle).toEqual(cfg.nodes.quickbarRoot.slotStyle);
    expect(layout.badgeStyle).toEqual(cfg.nodes.quickbarRoot.badgeStyle);
    expect(layout.openBagStyle).toEqual(cfg.nodes.openBagButton.style);
    expect(layout.customCss).toBe(cfg.customCss);
  });

  it("absolute 使用 openBagButton.rect，缺省 w/h 回退", () => {
    const cfg = normalizeInventoryHud({
      version: 2,
      accent: "#64e0d0",
      customCss: "",
      nodes: {
        quickbarRoot: defaultInventoryHud().nodes.quickbarRoot,
        openBagButton: {
          layout: "absolute",
          rect: { x: 100, y: 200 },
          style: { ...defaultInventoryHud().nodes.openBagButton.style, fontSize: 14 },
        },
      },
    });
    const layout = resolveHudLayout(cfg);
    const slotSize = cfg.nodes.quickbarRoot.slotSize;

    expect(layout.openBagButton).toEqual({
      x: 100,
      y: 200,
      w: slotSize,
      h: Math.max(32, 14 + 16),
    });
  });

  it("row 方向槽位横向排布，belowRoot 按钮在末槽右侧", () => {
    const base = defaultInventoryHud();
    const cfg = {
      ...base,
      nodes: {
        ...base.nodes,
        quickbarRoot: {
          ...base.nodes.quickbarRoot,
          direction: "row" as const,
        },
      },
    };
    const layout = resolveHudLayout(cfg);
    const { slotSize, gap, x, y } = {
      slotSize: cfg.nodes.quickbarRoot.slotSize,
      gap: cfg.nodes.quickbarRoot.gap,
      x: cfg.nodes.quickbarRoot.rect.x,
      y: cfg.nodes.quickbarRoot.rect.y,
    };
    const last = layout.slots[7]!;
    const fontSize = cfg.nodes.openBagButton.style.fontSize ?? 12;

    expect(layout.slots[1]).toEqual({
      x: x + slotSize + gap,
      y,
      w: slotSize,
      h: slotSize,
    });
    expect(layout.openBagButton.x).toBeGreaterThanOrEqual(last.x + last.w);
    expect(layout.openBagButton).toEqual({
      x: x + 8 * (slotSize + gap) + 4,
      y,
      w: Math.max(32, fontSize + 16),
      h: slotSize,
    });
  });
});
