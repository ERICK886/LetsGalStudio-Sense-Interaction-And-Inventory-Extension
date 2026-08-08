/**
 * import-export.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景库 / 物品库 JSON 导入导出单元测试（Task 15）。
 * tryImport*：非法 JSON / 非 v1 / 错误根 → ok:false；合法 → ok:true + value。
 */

import { describe, it, expect } from "vitest";
import type {
  ItemsLibraryFile,
  ScenesLibraryFile,
} from "../../src/domain/types";
import {
  emptyItemsLibrary,
  emptyScenesLibrary,
} from "../../src/domain/serialize";
import {
  exportItemsLibrary,
  exportScenesLibrary,
  importItemsLibrary,
  importScenesLibrary,
  tryImportItemsLibrary,
  tryImportScenesLibrary,
} from "../../src/editor/io/import-export";

/**
 * 构造最小场景库夹具。
 *
 * @param id - 场景 id
 * @param name - 场景名
 * @returns ScenesLibraryFile（version 1）
 */
function makeScenesLib(id: string, name: string): ScenesLibraryFile {
  return {
    version: 1,
    scenes: [
      {
        id,
        name,
        baseImage: "",
        hotspots: [],
      },
    ],
  };
}

/**
 * 构造最小物品库夹具。
 *
 * @param id - 物品 id
 * @param name - 物品名
 * @returns ItemsLibraryFile（version 1）
 */
function makeItemsLib(id: string, name: string): ItemsLibraryFile {
  return {
    version: 1,
    items: [
      {
        id,
        name,
        description: "",
        icon: "",
        detailImage: "",
        stackable: true,
      },
    ],
  };
}

describe("exportScenesLibrary / importScenesLibrary", () => {
  it("export 输出带 version 与 scenes 的 JSON 字符串", () => {
    const lib = makeScenesLib("s1", "庭院");
    const raw = exportScenesLibrary(lib);
    const parsed = JSON.parse(raw) as ScenesLibraryFile;

    expect(parsed.version).toBe(1);
    expect(parsed.scenes[0]?.id).toBe("s1");
  });

  it("往返 export → import 保留场景 id", () => {
    const lib = makeScenesLib("round", "往返");
    const again = importScenesLibrary(exportScenesLibrary(lib));

    expect(again.version).toBe(1);
    expect(again.scenes[0]?.id).toBe("round");
  });
});

describe("tryImportScenesLibrary", () => {
  it("合法 v1 库返回 ok:true 与 value", () => {
    const lib = makeScenesLib("ok", "合法");
    const result = tryImportScenesLibrary(exportScenesLibrary(lib));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.scenes[0]?.id).toBe("ok");
      expect(result.value.version).toBe(1);
    }
  });

  it("非法 JSON 返回 ok:false 且带 error", () => {
    const result = tryImportScenesLibrary("{not-json");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toContain("非法 JSON");
    }
  });

  it("纯数组根返回 ok:false", () => {
    const result = tryImportScenesLibrary(JSON.stringify([{ id: "x" }]));

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("缺少 scenes 数组返回 ok:false", () => {
    const result = tryImportScenesLibrary(
      JSON.stringify({ version: 1, foo: [] }),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toMatch(/scenes/i);
    }
  });

  it("非 version 1 返回 ok:false", () => {
    const result = tryImportScenesLibrary(
      JSON.stringify({ version: 2, scenes: [] }),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toMatch(/version\s*1/i);
    }
  });

  it("合法空库 {version:1,scenes:[]} 返回 ok:true", () => {
    const result = tryImportScenesLibrary(
      JSON.stringify(emptyScenesLibrary()),
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value).toEqual(emptyScenesLibrary());
    }
  });

  it("importScenesLibrary 在非法输入时回退空库（与 parse 一致）", () => {
    expect(importScenesLibrary("{")).toEqual(emptyScenesLibrary());
  });
});

describe("exportItemsLibrary / importItemsLibrary", () => {
  it("export 输出带 version 与 items 的 JSON 字符串", () => {
    const lib = makeItemsLib("potion", "药水");
    const raw = exportItemsLibrary(lib);
    const parsed = JSON.parse(raw) as ItemsLibraryFile;

    expect(parsed.version).toBe(1);
    expect(parsed.items[0]?.id).toBe("potion");
  });

  it("往返 export → import 保留物品 id", () => {
    const lib = makeItemsLib("key", "钥匙");
    const again = importItemsLibrary(exportItemsLibrary(lib));

    expect(again.version).toBe(1);
    expect(again.items[0]?.id).toBe("key");
  });
});

describe("tryImportItemsLibrary", () => {
  it("合法 v1 库返回 ok:true 与 value", () => {
    const lib = makeItemsLib("sword", "剑");
    const result = tryImportItemsLibrary(exportItemsLibrary(lib));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.items[0]?.id).toBe("sword");
    }
  });

  it("非法 JSON 返回 ok:false", () => {
    const result = tryImportItemsLibrary("not-json");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toContain("非法 JSON");
    }
  });

  it("纯数组根返回 ok:false", () => {
    const result = tryImportItemsLibrary(JSON.stringify([{ id: "x" }]));

    expect(result.ok).toBe(false);
  });

  it("非 version 1 返回 ok:false", () => {
    const result = tryImportItemsLibrary(
      JSON.stringify({ version: 99, items: [] }),
    );

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toMatch(/version\s*1/i);
    }
  });

  it("合法空库返回 ok:true", () => {
    const result = tryImportItemsLibrary(JSON.stringify(emptyItemsLibrary()));

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value).toEqual(emptyItemsLibrary());
    }
  });

  it("importItemsLibrary 在非法输入时回退空库", () => {
    expect(importItemsLibrary("{")).toEqual(emptyItemsLibrary());
  });
});
