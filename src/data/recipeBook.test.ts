import { describe, expect, it } from "vitest";
import { recipes } from "./recipeBook";

describe("recipe book data", () => {
  it("contains all 262 first-pass recipes", () => {
    expect(recipes).toHaveLength(262);
  });

  it("has unique slugs for every recipe", () => {
    const slugs = recipes.map((recipe) => recipe.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps cuisine and group metadata on flattened recipes", () => {
    const mapoTofu = recipes.find((recipe) => recipe.slug === "mapo-tofu");
    expect(mapoTofu).toMatchObject({
      title: "Mapo Tofu",
      cuisineName: "China",
      groupName: "Chinese Recipes",
    });
  });
});
