/**
 * serialize.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 场景/物品/库存/进度/HUD JSON 编解码聚焦单测。
 * 补充 giveItem Toast 覆盖字段往返测试。
 */
import { describe, it, expect, vi } from "vitest";
import { defaultElementMotion } from "../../src/domain/motion";
import {
  defaultInventoryHud,
  emptyItemsLibrary,
  emptyScenesLibrary,
  parseInventoryHudJson,
  parseItemsLibraryJson,
  parseInventoryJson,
  parseProgressJson,
  parseScenesLibraryJson,
  stringifyInventoryHud,
  stringifyScenesLibrary,
} from "../../src/domain/serialize";

/** 捕获 logError → console.error 的 spy，便于断言是否记录错误 */
function spyConsoleError(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("parseScenesLibraryJson", () => {
  it("非法 JSON 回退空库", () => {
    const lib = parseScenesLibraryJson("{");
    expect(lib).toEqual(emptyScenesLibrary());
  });

  it("往返保留 version 与场景 id", () => {
    const lib = emptyScenesLibrary();
    lib.scenes.push({
      id: "s1",
      name: "庭院",
      baseImage: "asset://a.png",
      hotspots: [],
    });
    const again = parseScenesLibraryJson(stringifyScenesLibrary(lib));
    expect(again.version).toBe(1);
    expect(again.scenes[0]?.id).toBe("s1");
  });

  it("缺 hotspots 填 []", () => {
    const again = parseScenesLibraryJson(
      JSON.stringify({ version: 1, scenes: [{ id: "x", name: "n" }] }),
    );
    expect(again.scenes[0]?.hotspots).toEqual([]);
  });

  it("纯数组根回退空库并 logError", () => {
    const spy = spyConsoleError();

    const lib = parseScenesLibraryJson(JSON.stringify([{ id: "orphan" }]));

    expect(lib).toEqual(emptyScenesLibrary());
    expect(spy).toHaveBeenCalledWith(
      "[scene-interaction]",
      "serialize",
      "bare array root rejected for scenesLibrary",
    );

    spy.mockRestore();
  });

  it("缺 id 的场景条目被丢弃并 logError", () => {
    const spy = spyConsoleError();

    const lib = parseScenesLibraryJson(
      JSON.stringify({
        version: 1,
        scenes: [{ name: "无名" }, { id: "ok", name: "有效" }],
      }),
    );

    expect(lib.scenes).toHaveLength(1);
    expect(lib.scenes[0]?.id).toBe("ok");
    expect(spy).toHaveBeenCalledWith(
      "[scene-interaction]",
      "serialize",
      "scene entry dropped: missing id",
    );

    spy.mockRestore();
  });

  it("hotspot 缺省字段使用默认值", () => {
    const lib = parseScenesLibraryJson(
      JSON.stringify({
        version: 1,
        scenes: [
          {
            id: "s1",
            name: "",
            baseImage: "",
            hotspots: [{ id: "h1", x: 2, y: -0.5 }],
          },
        ],
      }),
    );

    const hotspot = lib.scenes[0]?.hotspots[0];

    expect(hotspot?.hoverShadow.enabled).toBe(true);
    expect(hotspot?.actions).toEqual([]);
    expect(hotspot?.once).toBe(false);
    expect(hotspot?.visibleByDefault).toBe(true);
    expect(hotspot?.motion).toEqual(defaultElementMotion());
    expect(hotspot?.x).toBe(1);
    expect(hotspot?.y).toBe(0);
  });

  it("缺 id 的 hotspot 被丢弃并 logError", () => {
    const spy = spyConsoleError();

    const lib = parseScenesLibraryJson(
      JSON.stringify({
        version: 1,
        scenes: [
          {
            id: "s1",
            name: "",
            baseImage: "",
            hotspots: [{ name: "无 id" }, { id: "h1" }],
          },
        ],
      }),
    );

    expect(lib.scenes[0]?.hotspots).toHaveLength(1);
    expect(lib.scenes[0]?.hotspots[0]?.id).toBe("h1");
    expect(spy).toHaveBeenCalledWith(
      "[scene-interaction]",
      "serialize",
      "hotspot entry dropped: missing id",
    );

    spy.mockRestore();
  });

  it("giveItem amount 最小 1；缺 toastMotion 时 slideUp / slideDown", () => {
    const lib = parseScenesLibraryJson(
      JSON.stringify({
        version: 1,
        scenes: [
          {
            id: "s1",
            name: "",
            baseImage: "",
            hotspots: [
              {
                id: "h1",
                actions: [
                  {
                    type: "giveItem",
                    itemId: "key",
                    amount: 0,
                    toastText: "获得钥匙",
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const action = lib.scenes[0]?.hotspots[0]?.actions[0];

    expect(action?.type).toBe("giveItem");
    if (action?.type === "giveItem") {
      expect(action.amount).toBeGreaterThanOrEqual(1);
      expect(action.toastMotion.enter.preset).toBe("slideUp");
      expect(action.toastMotion.exit.preset).toBe("slideDown");
    }
  });

  it("giveItem Toast 覆盖字段 JSON 往返保留", () => {
    const lib = parseScenesLibraryJson(
      JSON.stringify({
        version: 1,
        scenes: [
          {
            id: "s1",
            name: "",
            baseImage: "",
            hotspots: [
              {
                id: "h1",
                actions: [
                  {
                    type: "giveItem",
                    itemId: "key",
                    amount: 1,
                    toastText: "获得钥匙",
                    toastPlacement: "right",
                    toastOffsetX: 12,
                    toastOffsetY: -4,
                    toastGap: 20,
                    toastStyle: {
                      color: "#ffffff",
                      background: "#1a1a2e",
                      fontSize: 16,
                      borderRadius: 8,
                      shadow: 0.4,
                    },
                    toastMotion: {
                      enter: { preset: "scale", delayMs: 100, durationMs: 400, customCss: "" },
                      exit: { preset: "fade", delayMs: 0, durationMs: 300, customCss: "" },
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const action = lib.scenes[0]?.hotspots[0]?.actions[0];

    expect(action?.type).toBe("giveItem");
    if (action?.type === "giveItem") {
      expect(action.toastPlacement).toBe("right");
      expect(action.toastOffsetX).toBe(12);
      expect(action.toastOffsetY).toBe(-4);
      expect(action.toastGap).toBe(20);
      expect(action.toastStyle).toEqual({
        color: "#ffffff",
        background: "#1a1a2e",
        fontSize: 16,
        borderRadius: 8,
        shadow: 0.4,
      });
      expect(action.toastMotion.enter.preset).toBe("scale");
      expect(action.toastMotion.exit.preset).toBe("fade");
    }

    const again = parseScenesLibraryJson(stringifyScenesLibrary(lib));
    const againAction = again.scenes[0]?.hotspots[0]?.actions[0];

    expect(againAction?.type).toBe("giveItem");
    if (againAction?.type === "giveItem") {
      expect(againAction.toastPlacement).toBe("right");
      expect(againAction.toastOffsetX).toBe(12);
      expect(againAction.toastOffsetY).toBe(-4);
      expect(againAction.toastGap).toBe(20);
      expect(againAction.toastStyle).toEqual({
        color: "#ffffff",
        background: "#1a1a2e",
        fontSize: 16,
        borderRadius: 8,
        shadow: 0.4,
      });
    }
  });
});

describe("parseInventoryJson", () => {
  it("损坏回退空库存", () => {
    expect(parseInventoryJson("null").entries).toEqual([]);
  });
});

describe("parseProgressJson", () => {
  it("缺省 consumed 为空对象", () => {
    expect(parseProgressJson("{}").consumed).toEqual({});
  });
});

describe("parseItemsLibraryJson", () => {
  it("根必须带 items 数组", () => {
    const lib = parseItemsLibraryJson(JSON.stringify({ version: 1, items: [] }));
    expect(lib.items).toEqual([]);
  });

  it("纯数组根回退空库并 logError", () => {
    const spy = spyConsoleError();

    const lib = parseItemsLibraryJson(JSON.stringify([{ id: "orphan" }]));

    expect(lib).toEqual(emptyItemsLibrary());
    expect(spy).toHaveBeenCalledWith(
      "[scene-interaction]",
      "serialize",
      "bare array root rejected for itemsLibrary",
    );

    spy.mockRestore();
  });

  it("缺 id 的物品条目被丢弃并 logError", () => {
    const spy = spyConsoleError();

    const lib = parseItemsLibraryJson(
      JSON.stringify({
        version: 1,
        items: [{ name: "无名" }, { id: "i1", name: "有效" }],
      }),
    );

    expect(lib.items).toHaveLength(1);
    expect(lib.items[0]?.id).toBe("i1");
    expect(spy).toHaveBeenCalledWith(
      "[scene-interaction]",
      "serialize",
      "item entry dropped: missing id",
    );

    spy.mockRestore();
  });
});

describe("parseInventoryHudJson", () => {
  it("defaultInventoryHud 默认值", () => {
    const hud = defaultInventoryHud();

    expect(hud.version).toBe(2);
    expect(hud.nodes.quickbarRoot.rect).toEqual({ x: 24, y: 120 });
    expect(hud.nodes.quickbarRoot.slotSize).toBe(64);
    expect(hud.nodes.quickbarRoot.gap).toBe(8);
    expect(hud.nodes.openBagButton.style.label).toBe("打开背包");
    expect(hud.customCss).toBe("");
    expect(hud.accent).toBe("#64e0d0");
  });

  it("空字符串回退默认配置", () => {
    expect(parseInventoryHudJson("")).toEqual(defaultInventoryHud());
  });

  it("JSON 往返保留 HUD 字段", () => {
    const base = defaultInventoryHud();
    const custom: typeof base = {
      ...base,
      nodes: {
        ...base.nodes,
        quickbarRoot: {
          ...base.nodes.quickbarRoot,
          rect: { x: 48, y: base.nodes.quickbarRoot.rect.y },
        },
        openBagButton: {
          ...base.nodes.openBagButton,
          style: {
            ...base.nodes.openBagButton.style,
            label: "背包",
          },
        },
      },
    };
    const again = parseInventoryHudJson(stringifyInventoryHud(custom));

    expect(again).toEqual(custom);
  });
});
