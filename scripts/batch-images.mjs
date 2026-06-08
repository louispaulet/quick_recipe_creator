#!/usr/bin/env node

import archiver from "archiver";
import fs from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

export const DEFAULTS = {
  size: "1024x1536",
  quality: "medium",
  outputFormat: "png",
  imageModel: "gpt-image-2",
  responseModel: "gpt-5",
  endpoint: "/v1/responses",
  maxAttempts: 3,
  completionWindow: "24h",
};

export const PATHS = {
  recipesJson: path.join(rootDir, "src/data/recipes.json"),
  templatePng: path.join(rootDir, "public/images/template/recipe-card-template.png"),
  pngDir: path.join(rootDir, "assets/generated/png"),
  webpDir: path.join(rootDir, "public/images/recipes"),
  zipPath: path.join(rootDir, "assets/generated/recipe-card-pngs.zip"),
  zipPartsDir: path.join(rootDir, "assets/generated/recipe-card-pngs.zip.parts"),
  zipManifestPath: path.join(rootDir, "assets/generated/recipe-card-pngs.zip.parts/manifest.json"),
  stateDir: path.join(rootDir, ".batch"),
  statePath: path.join(rootDir, ".batch/recipe-image-state.json"),
  inputPath: path.join(rootDir, ".batch/recipe-image-input.jsonl"),
  outputPath: path.join(rootDir, ".batch/recipe-image-output.jsonl"),
  errorPath: path.join(rootDir, ".batch/recipe-image-errors.jsonl"),
};

export function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function titleCase(value) {
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
    .replace(/\bBbq\b/g, "BBQ");
}

export function flattenRecipes(recipeBook) {
  const seenSlugs = new Set();
  return recipeBook.cuisines.flatMap((cuisine) =>
    cuisine.groups.flatMap((group) =>
      group.recipes.map((recipeName) => {
        const baseSlug = slugify(recipeName);
        const recipeSlug = seenSlugs.has(baseSlug) ? `${baseSlug}-${cuisine.id}` : baseSlug;
        seenSlugs.add(recipeSlug);
        return {
          slug: recipeSlug,
          title: titleCase(recipeName),
          rawName: recipeName,
          cuisineId: cuisine.id,
          cuisineName: cuisine.name,
          groupId: group.id,
          groupName: group.name,
          focus: cuisine.focus,
        };
      }),
    ),
  );
}

export async function loadRecipeBook(filePath = PATHS.recipesJson) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function loadRecipes(filePath = PATHS.recipesJson) {
  return flattenRecipes(await loadRecipeBook(filePath));
}

export function promptForRecipe(recipe) {
  return `Please use this template to generate the image of a ${recipe.rawName} recipe!`;
}

export function buildImageEditsLine(recipe, templateFileId, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  return {
    custom_id: recipe.slug,
    method: "POST",
    url: "/v1/images/edits",
    body: {
      model: settings.imageModel,
      prompt: promptForRecipe(recipe),
      images: [{ file_id: templateFileId }],
      n: 1,
      size: settings.size,
      quality: settings.quality,
      output_format: settings.outputFormat,
    },
  };
}

export function buildResponsesLine(recipe, templateFileId, options = {}) {
  const settings = { ...DEFAULTS, ...options };
  return {
    custom_id: recipe.slug,
    method: "POST",
    url: "/v1/responses",
    body: {
      model: settings.responseModel,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: promptForRecipe(recipe) },
            { type: "input_image", file_id: templateFileId, detail: "high" },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          action: "edit",
          size: settings.size,
          quality: settings.quality,
          output_format: settings.outputFormat,
        },
      ],
      tool_choice: { type: "image_generation" },
      metadata: {
        recipe_slug: recipe.slug,
        requested_image_model: settings.imageModel,
      },
    },
  };
}

export function buildBatchLine(recipe, templateFileId, options = {}) {
  const endpoint = options.endpoint ?? DEFAULTS.endpoint;
  if (endpoint === "/v1/images/edits") {
    return buildImageEditsLine(recipe, templateFileId, options);
  }
  return buildResponsesLine(recipe, templateFileId, options);
}

export function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function stringifyJsonl(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

export function slugFromCustomId(customId) {
  return String(customId).replace(/--attempt-\d+$/, "");
}

export function assetPathsForRecipe(recipe, paths = PATHS) {
  return {
    png: path.join(paths.pngDir, `${recipe.slug}.png`),
    webp: path.join(paths.webpDir, `${recipe.slug}.webp`),
  };
}

export function extractImageBase64(body) {
  const imageApiData = body?.data?.find?.((item) => item?.b64_json);
  if (imageApiData?.b64_json) return imageApiData.b64_json;

  const responseOutput = body?.output ?? [];
  for (const output of responseOutput) {
    if (output?.type === "image_generation_call") {
      if (output.result) return output.result;
      if (output.b64_json) return output.b64_json;
    }
  }
  return undefined;
}

export function summarizeBatchOutput(outputRows, errorRows = []) {
  const completed = new Set();
  const failed = new Set();

  for (const row of outputRows) {
    const slug = slugFromCustomId(row.custom_id);
    const status = row.response?.status_code ?? 0;
    const body = row.response?.body;
    if (status >= 200 && status < 300 && extractImageBase64(body)) {
      completed.add(slug);
    } else {
      failed.add(slug);
    }
  }

  for (const row of errorRows) {
    if (row.custom_id) failed.add(slugFromCustomId(row.custom_id));
  }

  for (const slug of completed) {
    failed.delete(slug);
  }

  return { completed, failed };
}

export async function selectRetryRecipes(recipes, state, paths = PATHS) {
  const retry = [];
  for (const recipe of recipes) {
    const assets = assetPathsForRecipe(recipe, paths);
    const hasPng = fs.existsSync(assets.png);
    const hasWebp = fs.existsSync(assets.webp);
    const attempts = state.attempts?.[recipe.slug] ?? 0;
    if ((!hasPng || !hasWebp) && attempts < (state.maxAttempts ?? DEFAULTS.maxAttempts)) {
      retry.push(recipe);
    }
  }
  return retry;
}

export async function ensureDirs(paths = PATHS) {
  await mkdir(paths.stateDir, { recursive: true });
  await mkdir(paths.pngDir, { recursive: true });
  await mkdir(paths.webpDir, { recursive: true });
  await mkdir(path.dirname(paths.zipPath), { recursive: true });
  await mkdir(paths.zipPartsDir, { recursive: true });
}

export async function loadState(paths = PATHS) {
  if (!fs.existsSync(paths.statePath)) {
    return {
      templateFileId: null,
      batches: [],
      attempts: {},
      maxAttempts: DEFAULTS.maxAttempts,
      endpoint: DEFAULTS.endpoint,
      size: DEFAULTS.size,
      imageModel: DEFAULTS.imageModel,
      responseModel: DEFAULTS.responseModel,
      updatedAt: new Date().toISOString(),
    };
  }
  return JSON.parse(await readFile(paths.statePath, "utf8"));
}

export async function saveState(state, paths = PATHS) {
  await ensureDirs(paths);
  await writeFile(paths.statePath, `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

export function loadEnvFile(filePath = path.join(rootDir, ".env.local")) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=");
  }
}

function apiKey() {
  loadEnvFile();
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing. Save it in .env.local before using live image commands.");
  }
  return process.env.OPENAI_API_KEY;
}

async function openAIRequest(pathname, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`https://api.openai.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}) for ${pathname}: ${errorText}`);
  }
  return response.json();
}

async function uploadFile(filePath, purpose) {
  const formData = new FormData();
  const fileBuffer = await readFile(filePath);
  formData.append("purpose", purpose);
  formData.append("file", new Blob([fileBuffer]), path.basename(filePath));

  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI file upload failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

async function downloadFileContent(fileId, targetPath) {
  const response = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
    headers: {
      Authorization: `Bearer ${apiKey()}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI file download failed (${response.status}): ${errorText}`);
  }

  await writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
}

export async function buildJsonl({
  recipes,
  templateFileId,
  paths = PATHS,
  endpoint = process.env.OPENAI_BATCH_ENDPOINT ?? DEFAULTS.endpoint,
  imageModel = process.env.OPENAI_IMAGE_MODEL ?? DEFAULTS.imageModel,
  responseModel = process.env.OPENAI_RESPONSE_MODEL ?? DEFAULTS.responseModel,
} = {}) {
  if (!templateFileId) throw new Error("templateFileId is required to build batch JSONL.");
  const recipeList = recipes ?? (await loadRecipes(paths.recipesJson));
  const lines = recipeList.map((recipe) =>
    buildBatchLine(recipe, templateFileId, {
      endpoint,
      imageModel,
      responseModel,
    }),
  );
  await ensureDirs(paths);
  await writeFile(paths.inputPath, stringifyJsonl(lines));
  return { path: paths.inputPath, count: lines.length, endpoint };
}

export async function uploadTemplate(paths = PATHS) {
  await ensureDirs(paths);
  if (!fs.existsSync(paths.templatePng)) {
    throw new Error(`Template image not found: ${paths.templatePng}`);
  }
  const state = await loadState(paths);
  if (state.templateFileId) return state.templateFileId;

  const file = await uploadFile(paths.templatePng, "vision");
  state.templateFileId = file.id;
  await saveState(state, paths);
  return file.id;
}

export async function submitBatch(paths = PATHS) {
  await ensureDirs(paths);
  const state = await loadState(paths);
  const templateFileId = state.templateFileId ?? (await uploadTemplate(paths));
  const recipes = await selectRetryRecipes(await loadRecipes(paths.recipesJson), state, paths);
  if (recipes.length === 0) return { skipped: true, reason: "All recipe assets already exist." };

  const endpoint = process.env.OPENAI_BATCH_ENDPOINT ?? state.endpoint ?? DEFAULTS.endpoint;
  const jsonl = await buildJsonl({
    recipes,
    templateFileId,
    paths,
    endpoint,
    imageModel: process.env.OPENAI_IMAGE_MODEL ?? state.imageModel ?? DEFAULTS.imageModel,
    responseModel: process.env.OPENAI_RESPONSE_MODEL ?? state.responseModel ?? DEFAULTS.responseModel,
  });
  const inputFile = await uploadFile(jsonl.path, "batch");
  const batch = await openAIRequest("/v1/batches", {
    method: "POST",
    body: {
      input_file_id: inputFile.id,
      endpoint,
      completion_window: DEFAULTS.completionWindow,
      metadata: {
        project: "quick_recipe_creator",
        kind: "recipe-image-cards",
        recipe_count: String(recipes.length),
      },
    },
  });

  for (const recipe of recipes) {
    state.attempts[recipe.slug] = (state.attempts[recipe.slug] ?? 0) + 1;
  }
  state.endpoint = endpoint;
  state.batches.push({
    id: batch.id,
    endpoint,
    inputFileId: inputFile.id,
    recipeCount: recipes.length,
    status: batch.status,
    createdAt: new Date().toISOString(),
  });
  await saveState(state, paths);
  return batch;
}

export async function saveGeneratedImagesFromRows(outputRows, paths = PATHS) {
  await ensureDirs(paths);
  const saved = [];
  for (const row of outputRows) {
    const slug = slugFromCustomId(row.custom_id);
    const base64 = extractImageBase64(row.response?.body);
    if (!base64) continue;
    const recipe = { slug };
    const assets = assetPathsForRecipe(recipe, paths);
    const png = Buffer.from(base64, "base64");
    await writeFile(assets.png, png);
    await sharp(png).webp({ quality: 86 }).toFile(assets.webp);
    saved.push(slug);
  }
  return saved;
}

export async function saveGeneratedImagesFromJsonlFile(filePath, paths = PATHS) {
  await ensureDirs(paths);
  const saved = [];
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed);
    const slug = slugFromCustomId(row.custom_id);
    const base64 = extractImageBase64(row.response?.body);
    if (!base64) continue;
    const assets = assetPathsForRecipe({ slug }, paths);
    const png = Buffer.from(base64, "base64");
    await writeFile(assets.png, png);
    await sharp(png).webp({ quality: 86 }).toFile(assets.webp);
    saved.push(slug);
  }

  return saved;
}

export async function rebuildAssets(paths = PATHS) {
  await ensureDirs(paths);
  const recipes = await loadRecipes(paths.recipesJson);
  let converted = 0;
  for (const recipe of recipes) {
    const assets = assetPathsForRecipe(recipe, paths);
    if (fs.existsSync(assets.png)) {
      await sharp(assets.png).webp({ quality: 86 }).toFile(assets.webp);
      converted += 1;
    }
  }
  await zipPngs(paths);
  return { converted };
}

export async function zipPngs(paths = PATHS) {
  await ensureDirs(paths);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(paths.zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(paths.pngDir, false);
    archive.finalize();
  });
  await splitLargeZip(paths);
  return paths.zipPath;
}

export async function splitLargeZip(paths = PATHS, partSizeBytes = 95 * 1024 * 1024) {
  await ensureDirs(paths);
  await rm(paths.zipPartsDir, { recursive: true, force: true });
  await mkdir(paths.zipPartsDir, { recursive: true });

  const zipStats = await stat(paths.zipPath);
  const readStream = fs.createReadStream(paths.zipPath, { highWaterMark: 1024 * 1024 });
  const parts = [];
  let partNumber = 1;
  let currentSize = 0;
  let currentPath = path.join(paths.zipPartsDir, `recipe-card-pngs.zip.part-${String(partNumber).padStart(3, "0")}`);
  let currentStream = fs.createWriteStream(currentPath);

  const openNextPart = async () => {
    await new Promise((resolve, reject) => {
      currentStream.end(resolve);
      currentStream.on("error", reject);
    });
    parts.push({ file: path.basename(currentPath), size: currentSize });
    partNumber += 1;
    currentSize = 0;
    currentPath = path.join(paths.zipPartsDir, `recipe-card-pngs.zip.part-${String(partNumber).padStart(3, "0")}`);
    currentStream = fs.createWriteStream(currentPath);
  };

  for await (const chunk of readStream) {
    let offset = 0;
    while (offset < chunk.length) {
      const capacity = partSizeBytes - currentSize;
      const slice = chunk.subarray(offset, offset + capacity);
      currentStream.write(slice);
      currentSize += slice.length;
      offset += slice.length;
      if (currentSize === partSizeBytes) {
        await openNextPart();
      }
    }
  }

  await new Promise((resolve, reject) => {
    currentStream.end(resolve);
    currentStream.on("error", reject);
  });
  if (currentSize > 0 || parts.length === 0) {
    parts.push({ file: path.basename(currentPath), size: currentSize });
  } else {
    await rm(currentPath, { force: true });
  }

  const manifest = {
    archive: path.basename(paths.zipPath),
    sourceDirectory: "assets/generated/png",
    size: zipStats.size,
    partSize: partSizeBytes,
    parts,
    restoreCommand:
      "cat assets/generated/recipe-card-pngs.zip.parts/recipe-card-pngs.zip.part-* > assets/generated/recipe-card-pngs.zip",
  };
  await writeFile(paths.zipManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function pollLatestBatch(paths = PATHS) {
  const state = await loadState(paths);
  const latest = [...state.batches].reverse().find((batch) => !["completed", "failed", "expired", "cancelled"].includes(batch.status));
  if (!latest) return { skipped: true, reason: "No active batch found." };

  const batch = await openAIRequest(`/v1/batches/${latest.id}`);
  latest.status = batch.status;
  latest.requestCounts = batch.request_counts;
  latest.outputFileId = batch.output_file_id;
  latest.errorFileId = batch.error_file_id;

  if (batch.output_file_id) {
    await downloadFileContent(batch.output_file_id, paths.outputPath);
    const saved = await saveGeneratedImagesFromJsonlFile(paths.outputPath, paths);
    latest.savedCount = saved.length;
  }

  if (batch.error_file_id) {
    await downloadFileContent(batch.error_file_id, paths.errorPath);
  }

  if (["completed", "failed", "expired", "cancelled"].includes(batch.status)) {
    await rebuildAssets(paths);
  }

  await saveState(state, paths);
  return batch;
}

export async function pollAndRetry(paths = PATHS) {
  const pollResult = await pollLatestBatch(paths);
  const currentStatus = await status(paths);
  const latestStatus = currentStatus.latestBatch?.status;
  const hasActiveBatch = latestStatus && !["completed", "failed", "expired", "cancelled"].includes(latestStatus);

  if (hasActiveBatch || currentStatus.missing === 0) {
    return { pollResult, status: currentStatus, retryBatch: null };
  }

  const retryBatch = await submitBatch(paths);
  return { pollResult, status: await status(paths), retryBatch };
}

export async function status(paths = PATHS) {
  const recipes = await loadRecipes(paths.recipesJson);
  const state = await loadState(paths);
  const missing = [];
  let png = 0;
  let webp = 0;
  for (const recipe of recipes) {
    const assets = assetPathsForRecipe(recipe, paths);
    const hasPng = fs.existsSync(assets.png);
    const hasWebp = fs.existsSync(assets.webp);
    if (hasPng) png += 1;
    if (hasWebp) webp += 1;
    if (!hasPng || !hasWebp) missing.push(recipe.slug);
  }

  return {
    total: recipes.length,
    png,
    webp,
    missing: missing.length,
    latestBatch: state.batches.at(-1) ?? null,
  };
}

async function main() {
  const command = process.argv[2] ?? "status";
  await ensureDirs();

  if (command === "upload-template") {
    const fileId = await uploadTemplate();
    console.log(`Template uploaded: ${fileId}`);
    return;
  }

  if (command === "build-jsonl") {
    const state = await loadState();
    const templateFileId = state.templateFileId ?? "file-template-placeholder";
    const result = await buildJsonl({ templateFileId });
    console.log(`Built ${result.count} ${result.endpoint} requests at ${path.relative(rootDir, result.path)}`);
    return;
  }

  if (command === "submit") {
    const batch = await submitBatch();
    if (batch.skipped) {
      console.log(batch.reason);
    } else {
      console.log(`Batch submitted: ${batch.id} (${batch.status})`);
    }
    return;
  }

  if (command === "poll") {
    const result = await pollLatestBatch();
    if (result.skipped) {
      console.log(result.reason);
    } else {
      console.log(`Batch ${result.id}: ${result.status}`);
    }
    return;
  }

  if (command === "poll-retry") {
    const result = await pollAndRetry();
    const latest = result.status.latestBatch;
    const retry = result.retryBatch?.id ? ` Retry submitted: ${result.retryBatch.id}.` : "";
    console.log(`Assets: ${result.status.webp}/${result.status.total} WebP, ${result.status.png}/${result.status.total} PNG. Latest batch: ${latest?.id ?? "none"} (${latest?.status ?? "none"}).${retry}`);
    return;
  }

  if (command === "rebuild-assets") {
    const result = await rebuildAssets();
    console.log(`Converted ${result.converted} PNG assets and rebuilt PNG zip.`);
    return;
  }

  if (command === "status") {
    const result = await status();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
