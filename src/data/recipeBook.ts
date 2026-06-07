import rawRecipeBook from "./recipes.json";
import { slugify } from "../lib/slug";

export type RecipeGroup = {
  id: string;
  name: string;
  recipes: string[];
};

export type Cuisine = {
  id: string;
  name: string;
  focus: string;
  coreSkills: string[];
  groups: RecipeGroup[];
};

export type RecipeBook = {
  title: string;
  concept: string;
  cuisines: Cuisine[];
};

export type Recipe = {
  slug: string;
  title: string;
  cuisineId: string;
  cuisineName: string;
  groupId: string;
  groupName: string;
  focus: string;
  coreSkills: string[];
};

export const recipeBook = rawRecipeBook as RecipeBook;

export function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word) => {
      if (!word) return word;
      const lower = word.toLowerCase();
      const preserved = new Set(["and", "or", "with", "de", "du", "des", "au", "aux", "alla", "con", "al"]);
      if (preserved.has(lower)) return lower;
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ")
    .replace(/\bBbq\b/g, "BBQ")
    .replace(/\bAioli\b/g, "Aioli")
    .replace(/\bTteokbokki\b/g, "Tteokbokki");
}

export function flattenRecipes(book: RecipeBook = recipeBook): Recipe[] {
  const seenSlugs = new Set<string>();
  return book.cuisines.flatMap((cuisine) =>
    cuisine.groups.flatMap((group) =>
      group.recipes.map((recipeName) => {
        const baseSlug = slugify(recipeName);
        const slug = seenSlugs.has(baseSlug) ? `${baseSlug}-${cuisine.id}` : baseSlug;
        seenSlugs.add(slug);
        return {
          slug,
          title: titleCase(recipeName),
          cuisineId: cuisine.id,
          cuisineName: cuisine.name,
          groupId: group.id,
          groupName: group.name,
          focus: cuisine.focus,
          coreSkills: cuisine.coreSkills,
        };
      }),
    ),
  );
}

export const recipes = flattenRecipes();

export function getRecipeBySlug(slug: string): Recipe | undefined {
  return recipes.find((recipe) => recipe.slug === slug);
}

export function getImagePath(slug: string): string {
  return `${import.meta.env.BASE_URL}images/recipes/${slug}.webp`;
}

export function getTemplatePath(): string {
  return `${import.meta.env.BASE_URL}images/template/recipe-card-template.png`;
}
