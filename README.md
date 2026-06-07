# The Essential Home-Cook Atlas

A static, image-first online recipe book for essential dishes across major world cuisines, with extra coverage for mainland France and French overseas foodways.

The first pass indexes recipe-card images for all 262 cuisine recipes in the project brief. Foundations and menu pages are intentionally left for a later pass.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4 through `@tailwindcss/vite`
- `HashRouter` for GitHub Pages-friendly routes
- OpenAI Batch-powered image generation scripts
- `gh-pages` for publishing `dist`

## Local Commands

```bash
make up
make test
make build
make deploy
```

`make deploy` runs tests, builds the app, and publishes the `dist` folder to the `gh-pages` branch.

## OpenAI Setup

Keep the API key in `.env.local`:

```bash
OPENAI_API_KEY=...
```

Never commit `.env.local`.

The versioned template image lives at:

```text
public/images/template/recipe-card-template.png
```

The selected output size is `1024x1536`.

## Image Pipeline

The shared recipe list lives in `src/data/recipes.json`. Both the website and batch scripts read from it.

Useful commands:

```bash
make images-upload-template
make images-build-jsonl
make images-submit
make images-poll
make images-poll-retry
make images-status
make images-rebuild-assets
```

Outputs:

- Full PNGs: `assets/generated/png/*.png`
- Website WebPs: `public/images/recipes/*.webp`
- Versioned PNG archive: `assets/generated/recipe-card-pngs.zip`

Tests mock the batch flow and must not submit live batches. Real generation is asynchronous, so poll regularly after submission. `make images-poll-retry` materializes completed output and submits another batch for missing or failed assets until every recipe has PNG and WebP output or the attempt limit is reached.

OpenAI's current Batch API supports `/v1/responses`; the real batch path uses that endpoint with the hosted image generation tool and the template image as an input. The script also includes an `/v1/images/edits` JSONL builder using `gpt-image-2` so the repo is ready if that endpoint is enabled for Batch.

## GitHub Pages And CNAME

The current Vite base path is:

```ts
base: "/quick_recipe_creator/"
```

When the custom domain is ready, switch the base path to `/`, add `public/CNAME`, then run `make deploy`.

## Versioning Rules

Commit:

- Source files
- `package-lock.json`
- Template image
- Generated PNGs, WebPs, and the PNG zip once real generation completes

Do not commit:

- `node_modules`
- `dist`
- `.env.local`
- `.batch`
- Logs or temporary JSONL files
