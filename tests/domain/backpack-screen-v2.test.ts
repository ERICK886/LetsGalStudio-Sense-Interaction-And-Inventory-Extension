/**
 * backpack-screen-v2.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * BackpackScreenConfig v2：v1 扁平迁移、缺节点补默认、stringify version。
 */
import { describe, it, expect } from "vitest";
import {
  defaultBackpackScreen,
  normalizeBackpackScreen,
  resetBackpackScreenNode,
} from "../../src/domain/backpack-screen-config";
import {
  parseBackpackScreenJson,
  stringifyBackpackScreen,
} from "../../src/domain/serialize";

describe("normalizeBackpackScreen v2", () => {
  it("v1 flat 产生 panelChrome 与 itemGrid", () => {
    const cfg = normalizeBackpackScreen(
      {
        pagePaddingX: 48,
        pagePaddingY: 40,
        detailRatio: 0.36,
        gridCellMin: 104,
        heroHeight: 280,
        accent: "#64e0d0",
      },
      1920,
      1080,
    );
    expect(cfg.version).toBe(2);
    expect(cfg.nodes.panelChrome.rect.w).toBe(1920 - 96);
    expect(cfg.nodes.itemGrid.cellMin).toBe(104);
    expect(cfg.nodes.detailPanel.heroHeight).toBe(280);
  });

  it("缺节点补默认", () => {
    const cfg = normalizeBackpackScreen({ version: 2, accent: "#fff", nodes: {} });
    expect(cfg.nodes.backdrop).toBeTruthy();
    expect(cfg.nodes.craftButton).toBeTruthy();
  });

  it("stringify 写出 version 2", () => {
    const json = stringifyBackpackScreen(defaultBackpackScreen());
    expect(JSON.parse(json).version).toBe(2);
    expect(parseBackpackScreenJson(json).nodes.panelChrome).toBeTruthy();
  });

  it("resetBackpackScreenNode 仅重置指定节点", () => {
    const defaults = defaultBackpackScreen(1920, 1080);
    const customized = normalizeBackpackScreen(
      {
        version: 2,
        accent: "#ff0000",
        nodes: {
          panelChrome: {
            ...defaults.nodes.panelChrome,
            rect: { x: 10, y: 20, w: 800, h: 600 },
          },
          itemGrid: {
            ...defaults.nodes.itemGrid,
            cellMin: 72,
          },
        },
      },
      1920,
      1080,
    );

    const resetPanel = resetBackpackScreenNode(
      customized,
      "panelChrome",
      1920,
      1080,
    );
    expect(resetPanel.nodes.panelChrome).toEqual(defaults.nodes.panelChrome);
    expect(resetPanel.nodes.itemGrid.cellMin).toBe(72);
    expect(resetPanel.accent).toBe("#ff0000");

    const resetGrid = resetBackpackScreenNode(
      customized,
      "itemGrid",
      1920,
      1080,
    );
    expect(resetGrid.nodes.itemGrid).toEqual(defaults.nodes.itemGrid);
    expect(resetGrid.nodes.panelChrome.rect).toEqual({
      x: 10,
      y: 20,
      w: 800,
      h: 600,
    });
  });
});
