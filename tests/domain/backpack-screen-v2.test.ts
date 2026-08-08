/**
 * backpack-screen-v2.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * BackpackScreenConfig v2：v1 扁平迁移、缺节点补默认、stringify version、
 * 默认几何对齐设计稿（顶栏内标题 + 下方左右分栏）。
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

  it("默认几何：标题/关闭在面板顶栏内，网格与详情在标题下方分栏", () => {
    const cfg = defaultBackpackScreen(1920, 1080);
    const panel = cfg.nodes.panelChrome.rect;
    const title = cfg.nodes.titleBlock.rect;
    const close = cfg.nodes.closeButton.rect;
    const grid = cfg.nodes.itemGrid.rect;
    const detail = cfg.nodes.detailPanel.rect;

    expect(panel.w).toBe(1920 - 96);
    expect(panel.h).toBe(1080 - 80);

    // 标题与关闭钮落在面板内（不再 y 为负或与网格同顶）
    expect(title.y).toBeGreaterThanOrEqual(panel.y!);
    expect(title.x).toBeGreaterThanOrEqual(panel.x!);
    expect(close.y).toBeGreaterThanOrEqual(panel.y!);
    expect(close.x! + close.w!).toBeLessThanOrEqual(panel.x! + panel.w!);

    // 网格 / 详情在顶栏下方，左右分栏且不重叠
    expect(grid.y).toBeGreaterThan(title.y! + 40);
    expect(detail.y).toBe(grid.y);
    expect(detail.x).toBeGreaterThan(grid.x! + grid.w!);
    expect(grid.h).toBeLessThan(panel.h!);
    expect(detail.h).toBe(grid.h);
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
