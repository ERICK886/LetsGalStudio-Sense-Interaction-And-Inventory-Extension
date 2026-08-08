import { describe, expect, it } from "vitest";
import {
  emptyRecipesLibrary,
  parseRecipesLibraryJson,
  stringifyRecipesLibrary,
} from "../../src/domain/serialize";

describe("parseRecipesLibraryJson", () => {
  it("非法 JSON 回退空库", () => {
    const lib = parseRecipesLibraryJson("{");
    expect(lib).toEqual({ version: 1, recipes: [] });
  });

  it("round-trip 保留原料与产物", () => {
    const src = {
      version: 1 as const,
      recipes: [
        {
          id: "r1",
          name: "药水",
          ingredients: [{ itemId: "herb", count: 2 }],
          products: [{ itemId: "potion", count: 1 }],
          description: "合成药水",
        },
      ],
    };
    const again = parseRecipesLibraryJson(stringifyRecipesLibrary(src));
    expect(again).toEqual(src);
  });

  it("count < 1 规范化为 1；空 itemId 行丢弃", () => {
    const lib = parseRecipesLibraryJson(
      JSON.stringify({
        version: 1,
        recipes: [
          {
            id: "r1",
            name: "x",
            ingredients: [
              { itemId: "a", count: 0 },
              { itemId: "", count: 3 },
            ],
            products: [{ itemId: "b", count: 2 }],
          },
        ],
      }),
    );
    expect(lib.recipes[0]!.ingredients).toEqual([{ itemId: "a", count: 1 }]);
    expect(lib.recipes[0]!.products).toEqual([{ itemId: "b", count: 2 }]);
  });
});

describe("emptyRecipesLibrary", () => {
  it("返回 version 1 空数组", () => {
    expect(emptyRecipesLibrary()).toEqual({ version: 1, recipes: [] });
  });
});
