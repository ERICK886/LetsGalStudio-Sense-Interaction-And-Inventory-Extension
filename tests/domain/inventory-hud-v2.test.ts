/**
 * inventory-hud-v2.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * InventoryHudConfig v2：v1 扁平迁移、损坏回退、stringify version。
 */
import { describe, it, expect } from "vitest";
import {
  defaultInventoryHud,
  normalizeInventoryHud,
  resetInventoryHudNode,
} from "../../src/domain/inventory-hud";
import {
  parseInventoryHudJson,
  stringifyInventoryHud,
} from "../../src/domain/serialize";

describe("normalizeInventoryHud v2", () => {
  it("v1 flat 迁移到 nodes", () => {
    const cfg = normalizeInventoryHud({
      left: 40,
      top: 80,
      slotSize: 56,
      gap: 6,
      openBagLabel: "背包",
      accent: "#abcdef",
      customCss: "",
    });
    expect(cfg.version).toBe(2);
    expect(cfg.nodes.quickbarRoot.rect).toEqual({ x: 40, y: 80 });
    expect(cfg.nodes.quickbarRoot.slotSize).toBe(56);
    expect(cfg.nodes.openBagButton.style.label).toBe("背包");
    expect(cfg.accent).toBe("#abcdef");
  });

  it("损坏输入回退默认且 version 2", () => {
    const cfg = normalizeInventoryHud(null);
    expect(cfg).toEqual(defaultInventoryHud());
    expect(cfg.version).toBe(2);
  });

  it("stringify 写出 version 2", () => {
    const json = stringifyInventoryHud(defaultInventoryHud());
    expect(JSON.parse(json).version).toBe(2);
    expect(parseInventoryHudJson(json).nodes.quickbarRoot).toBeTruthy();
  });

  it("resetInventoryHudNode 仅重置指定节点", () => {
    const defaults = defaultInventoryHud();
    const customized = normalizeInventoryHud({
      version: 2,
      nodes: {
        quickbarRoot: {
          ...defaults.nodes.quickbarRoot,
          rect: { x: 100, y: 200 },
          slotSize: 48,
        },
        openBagButton: {
          ...defaults.nodes.openBagButton,
          style: { ...defaults.nodes.openBagButton.style, label: "自定义" },
        },
      },
      accent: "#ff0000",
      customCss: "body{}",
    });

    const resetQuickbar = resetInventoryHudNode(customized, "quickbarRoot");
    expect(resetQuickbar.nodes.quickbarRoot).toEqual(defaults.nodes.quickbarRoot);
    expect(resetQuickbar.nodes.openBagButton.style.label).toBe("自定义");
    expect(resetQuickbar.accent).toBe("#ff0000");

    const resetButton = resetInventoryHudNode(customized, "openBagButton");
    expect(resetButton.nodes.openBagButton).toEqual(defaults.nodes.openBagButton);
    expect(resetButton.nodes.quickbarRoot.rect).toEqual({ x: 100, y: 200 });
  });
});
