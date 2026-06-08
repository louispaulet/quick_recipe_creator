# Repository Instructions

Always read this file before starting work in this repository.

## Project Goal

Build and maintain a static online recipe book, "The Essential Home-Cook Atlas", deployed on GitHub Pages. The first pass focuses on recipe image cards and recipe browsing only.

## Workflow

- Use the Makefile entry points:
  - `make up` starts local development.
  - `make test` runs the mocked test suite.
  - `make build` creates the static production build.
  - `make deploy` runs tests, builds, and publishes `dist` with the `gh-pages` package.
- Always commit and push completed work unless the user explicitly says not to.
- Never commit secrets, `.env.local`, `node_modules`, `dist`, logs, or temporary batch state.
- Do commit generated recipe PNGs, generated recipe WebPs, and Git-safe PNG zip parts once real generation output exists.

## OpenAI And Image Generation

- Keep `OPENAI_API_KEY` in `.env.local`; never print or commit it.
- Do not run live test batches. Unit tests must use mocks and fixtures only.
- Real image generation uses OpenAI Batch because it is asynchronous and discounted.
- Poll batch jobs regularly and retry incomplete, failed, expired, or missing recipe outputs.
- The requested recipe-card output size is `1024x1536`.

## Git

- Before committing, check `git status --short` and verify `node_modules`, `.env.local`, `dist`, `.batch`, and the monolithic `recipe-card-pngs.zip` are not staged.
- Prefer focused commit messages that describe the completed project change.
