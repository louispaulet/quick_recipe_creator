import { useMemo, useState } from "react";
import { Link, Route, Routes, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, ChefHat, Search, Sparkles, Utensils } from "lucide-react";
import { getImagePath, getRecipeBySlug, getTemplatePath, recipeBook, recipes } from "./data/recipeBook";

type RecipeImageProps = {
  slug: string;
  title: string;
  className?: string;
};

function RecipeImage({ slug, title, className }: RecipeImageProps) {
  const [src, setSrc] = useState(getImagePath(slug));

  return (
    <img
      className={className}
      src={src}
      alt={`${title} recipe card`}
      loading="lazy"
      onError={() => setSrc(getTemplatePath())}
    />
  );
}

function HomePage() {
  const [query, setQuery] = useState("");
  const [cuisineId, setCuisineId] = useState("all");

  const filteredRecipes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return recipes.filter((recipe) => {
      const matchesCuisine = cuisineId === "all" || recipe.cuisineId === cuisineId;
      const searchable = `${recipe.title} ${recipe.cuisineName} ${recipe.groupName} ${recipe.focus}`.toLowerCase();
      return matchesCuisine && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [query, cuisineId]);

  const groupedRecipes = useMemo(
    () =>
      recipeBook.cuisines
        .map((cuisine) => ({
          cuisine,
          recipes: filteredRecipes.filter((recipe) => recipe.cuisineId === cuisine.id),
        }))
        .filter((group) => group.recipes.length > 0),
    [filteredRecipes],
  );

  return (
    <main>
      <section className="atlas-hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <ChefHat size={18} aria-hidden="true" />
            Static GitHub Pages recipe atlas
          </p>
          <h1>{recipeBook.title}</h1>
          <p className="hero-text">{recipeBook.concept}</p>
          <div className="hero-stats" aria-label="Recipe book statistics">
            <span>
              <strong>{recipes.length}</strong>
              recipes
            </span>
            <span>
              <strong>{recipeBook.cuisines.length}</strong>
              cuisines
            </span>
            <span>
              <strong>1024x1536</strong>
              image cards
            </span>
          </div>
        </div>
        <div className="hero-image-wrap" aria-hidden="true">
          <img src={getTemplatePath()} alt="" className="hero-image" />
        </div>
      </section>

      <section className="toolbar" aria-label="Recipe filters">
        <label className="search-box">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">Search recipes</span>
          <input
            type="search"
            placeholder="Search recipe, cuisine, region, or technique"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="select-box">
          <Utensils size={18} aria-hidden="true" />
          <span className="sr-only">Filter by cuisine</span>
          <select value={cuisineId} onChange={(event) => setCuisineId(event.target.value)}>
            <option value="all">All cuisines</option>
            {recipeBook.cuisines.map((cuisine) => (
              <option key={cuisine.id} value={cuisine.id}>
                {cuisine.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="results-summary" aria-live="polite">
        <Sparkles size={18} aria-hidden="true" />
        Showing {filteredRecipes.length} recipe cards
      </section>

      <div className="cuisine-list">
        {groupedRecipes.map(({ cuisine, recipes: cuisineRecipes }) => (
          <section className="cuisine-section" key={cuisine.id}>
            <div className="section-heading">
              <div>
                <p className="section-kicker">{cuisineRecipes.length} recipes</p>
                <h2>{cuisine.name}</h2>
              </div>
              <p>{cuisine.focus}</p>
            </div>
            <div className="recipe-grid">
              {cuisineRecipes.map((recipe) => (
                <Link className="recipe-card" key={recipe.slug} to={`/recipe/${recipe.slug}`}>
                  <RecipeImage slug={recipe.slug} title={recipe.title} className="recipe-thumb" />
                  <span className="recipe-card-text">
                    <strong>{recipe.title}</strong>
                    <small>{recipe.groupName}</small>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function RecipePage() {
  const { slug = "" } = useParams();
  const recipe = getRecipeBySlug(slug);

  if (!recipe) {
    return (
      <main className="detail-shell">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" />
          Back to atlas
        </Link>
        <section className="not-found">
          <BookOpen size={34} aria-hidden="true" />
          <h1>Recipe not found</h1>
          <p>This card is not in the current recipe atlas.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="detail-shell">
      <Link to="/" className="back-link">
        <ArrowLeft size={18} aria-hidden="true" />
        Back to atlas
      </Link>
      <article className="recipe-detail">
        <div className="detail-media">
          <RecipeImage slug={recipe.slug} title={recipe.title} className="detail-image" />
        </div>
        <div className="detail-copy">
          <p className="eyebrow">
            <ChefHat size={18} aria-hidden="true" />
            {recipe.cuisineName}
          </p>
          <h1>{recipe.title}</h1>
          <p>{recipe.focus}</p>
          <dl className="metadata">
            <div>
              <dt>Collection</dt>
              <dd>{recipe.groupName}</dd>
            </div>
            <div>
              <dt>Image asset</dt>
              <dd>{recipe.slug}.webp</dd>
            </div>
          </dl>
          {recipe.coreSkills.length > 0 && (
            <div className="skill-cloud" aria-label="Core skills">
              {recipe.coreSkills.map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
          )}
        </div>
      </article>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/recipe/:slug" element={<RecipePage />} />
    </Routes>
  );
}
