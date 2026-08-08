/**
 * backpack-layout.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * resolveBackpackLayout：节点 rect 补齐为 Required，样式与度量透传。
 */
import { describe, it, expect } from "vitest";
import { resolveBackpackLayout } from "../../src/domain/backpack-layout";
import { defaultBackpackScreen } from "../../src/domain/backpack-screen-config";

describe("resolveBackpackLayout", () => {
  it("默认配置解析出完整 Required rect 与度量", () => {
    const cfg = defaultBackpackScreen();
    const layout = resolveBackpackLayout(cfg);

    expect(layout.accent).toBe(cfg.accent);
    expect(layout.backdrop.style).toEqual(cfg.nodes.backdrop.style);
    expect(layout.panelChrome.rect).toEqual({
      x: cfg.nodes.panelChrome.rect.x,
      y: cfg.nodes.panelChrome.rect.y,
      w: cfg.nodes.panelChrome.rect.w,
      h: cfg.nodes.panelChrome.rect.h,
    });
    expect(layout.panelChrome.style).toEqual(cfg.nodes.panelChrome.style);
    expect(layout.titleBlock.rect.w).toBeGreaterThan(0);
    expect(layout.titleBlock.rect.h).toBeGreaterThan(0);
    expect(layout.titleBlock.eyebrow).toEqual(cfg.nodes.titleBlock.eyebrow);
    expect(layout.titleBlock.title).toEqual(cfg.nodes.titleBlock.title);
    expect(layout.titleBlock.modeLink).toEqual(cfg.nodes.titleBlock.modeLink);
    expect(layout.closeButton.rect).toMatchObject({
      x: cfg.nodes.closeButton.rect.x,
      y: cfg.nodes.closeButton.rect.y,
      w: expect.any(Number),
      h: expect.any(Number),
    });
    expect(layout.itemGrid.cellMin).toBe(cfg.nodes.itemGrid.cellMin);
    expect(layout.itemGrid.selectedStyle).toEqual(
      cfg.nodes.itemGrid.selectedStyle,
    );
    expect(layout.detailPanel.heroHeight).toBe(cfg.nodes.detailPanel.heroHeight);
    expect(layout.detailPanel.padding).toBe(cfg.nodes.detailPanel.padding);
    expect(layout.craftButton.offsetY).toBe(cfg.nodes.craftButton.offsetY ?? 0);
    expect(layout.craftButton.style).toEqual(cfg.nodes.craftButton.style);
  });

  it("缺省 w/h 时回退正数默认尺寸", () => {
    const base = defaultBackpackScreen();
    const cfg = {
      ...base,
      nodes: {
        ...base.nodes,
        panelChrome: {
          ...base.nodes.panelChrome,
          rect: { x: 10, y: 20 },
        },
        closeButton: {
          ...base.nodes.closeButton,
          rect: { x: 50, y: 60 },
        },
      },
    };
    const layout = resolveBackpackLayout(cfg);

    expect(layout.panelChrome.rect.w).toBeGreaterThan(0);
    expect(layout.panelChrome.rect.h).toBeGreaterThan(0);
    expect(layout.closeButton.rect.w).toBeGreaterThan(0);
    expect(layout.closeButton.rect.h).toBeGreaterThan(0);
  });
});
