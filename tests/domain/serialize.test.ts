/**
 * serialize.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 */
import { describe, it, expect } from "vitest";
import {
  emptyScenesLibrary,
  parseScenesLibraryJson,
  stringifyScenesLibrary,
  parseItemsLibraryJson,
  parseInventoryJson,
  parseProgressJson,
} from "../../src/domain/serialize";

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
});
