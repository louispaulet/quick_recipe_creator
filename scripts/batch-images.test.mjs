import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildImageEditsLine,
  buildResponsesLine,
  extractImageBase64,
  loadRecipes,
  parseJsonl,
  promptForRecipe,
  saveState,
  selectRetryRecipes,
  stringifyJsonl,
  summarizeBatchOutput,
} from "./batch-images.mjs";

describe("batch image pipeline", () => {
  it("builds the requested recipe prompt", async () => {
    const recipe = (await loadRecipes()).find((item) => item.slug === "beef-noodle-soup");
    expect(promptForRecipe(recipe)).toBe("Please use this template to generate the image of a beef noodle soup recipe!");
  });

  it("builds batch-compatible Responses JSONL lines", async () => {
    const recipe = (await loadRecipes())[0];
    const line = buildResponsesLine(recipe, "file-template", {
      responseModel: "gpt-5",
      imageModel: "gpt-image-2",
    });

    expect(line).toMatchObject({
      method: "POST",
      url: "/v1/responses",
      body: {
        model: "gpt-5",
        tool_choice: { type: "image_generation" },
      },
    });
    expect(line.body.tools[0]).toMatchObject({
      type: "image_generation",
      action: "edit",
      size: "1024x1536",
      output_format: "png",
    });
    expect(line.body.metadata.requested_image_model).toBe("gpt-image-2");
  });

  it("can also build image-edits JSONL lines for future endpoint support", async () => {
    const recipe = (await loadRecipes())[0];
    const line = buildImageEditsLine(recipe, "file-template");

    expect(line).toMatchObject({
      method: "POST",
      url: "/v1/images/edits",
      body: {
        model: "gpt-image-2",
        images: [{ file_id: "file-template" }],
        size: "1024x1536",
        output_format: "png",
      },
    });
  });

  it("round-trips JSONL rows", () => {
    const rows = [
      { custom_id: "a", method: "POST" },
      { custom_id: "b", method: "POST" },
    ];
    expect(parseJsonl(stringifyJsonl(rows))).toEqual(rows);
  });

  it("extracts image data from Responses and Image API shapes", () => {
    expect(
      extractImageBase64({
        output: [{ type: "image_generation_call", result: "response-image" }],
      }),
    ).toBe("response-image");
    expect(
      extractImageBase64({
        data: [{ b64_json: "image-api-data" }],
      }),
    ).toBe("image-api-data");
  });

  it("summarizes failed and completed batch rows", () => {
    const summary = summarizeBatchOutput(
      [
        {
          custom_id: "mapo-tofu",
          response: { status_code: 200, body: { output: [{ type: "image_generation_call", result: "ok" }] } },
        },
        {
          custom_id: "ramen",
          response: { status_code: 500, body: { error: { message: "failed" } } },
        },
      ],
      [{ custom_id: "pho", error: { message: "timeout" } }],
    );

    expect(summary.completed).toEqual(new Set(["mapo-tofu"]));
    expect(summary.failed).toEqual(new Set(["ramen", "pho"]));
  });

  it("selects retry recipes when assets are missing and attempts remain", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "recipe-batch-test-"));
    const paths = {
      pngDir: path.join(tempRoot, "png"),
      webpDir: path.join(tempRoot, "webp"),
      stateDir: path.join(tempRoot, "state"),
      zipPath: path.join(tempRoot, "zip/recipes.zip"),
      statePath: path.join(tempRoot, "state/state.json"),
    };
    await mkdir(paths.pngDir, { recursive: true });
    await mkdir(paths.webpDir, { recursive: true });
    await mkdir(paths.stateDir, { recursive: true });

    const recipes = [
      { slug: "done" },
      { slug: "missing" },
      { slug: "exhausted" },
    ];
    await writeFile(path.join(paths.pngDir, "done.png"), "png");
    await writeFile(path.join(paths.webpDir, "done.webp"), "webp");
    const state = { attempts: { exhausted: 3 }, maxAttempts: 3, batches: [] };
    await saveState(state, paths);

    await expect(selectRetryRecipes(recipes, state, paths)).resolves.toEqual([{ slug: "missing" }]);
  });
});
