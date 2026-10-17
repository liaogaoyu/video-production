const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  endpointFor,
  sizeForRatio,
  resolutionForApiMart,
  taskEndpoint,
  generateImage,
} = require("./image-provider.cjs");

test("image endpoint and ratio mapping are deterministic", () => {
  assert.equal(
    endpointFor("https://api.example.com/v1"),
    "https://api.example.com/v1/images/generations",
  );
  assert.equal(sizeForRatio("9:16"), "1024x1536");
  assert.throws(() => endpointFor("http://example.com/v1"), /HTTPS/);
  assert.equal(resolutionForApiMart("2K"), "2k");
  assert.throws(() => resolutionForApiMart("720p"), /只支持/);
  assert.equal(
    taskEndpoint("https://api.apimart.ai/v1", "task 1"),
    "https://api.apimart.ai/v1/tasks/task%201?language=zh",
  );
});

test("base64 image response is written atomically inside the project", async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "storydock-image-"));
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({
        data: [{ b64_json: Buffer.from("fake-png").toString("base64") }],
      }),
    };
  };
  const result = await generateImage({
    config: {
      baseUrl: "https://api.example.com/v1",
      model: "gpt-image-2",
      ratio: "9:16",
    },
    prompt: "角色设定图",
    apiKey: "test-key",
    projectId: "project-1",
    assetId: "asset-1",
    outputRoot,
    fetchImpl,
  });
  assert.equal(JSON.parse(request.options.body).size, "1024x1536");
  assert.equal(request.options.headers.authorization, "Bearer test-key");
  assert.equal(fs.readFileSync(result.path, "utf8"), "fake-png");
  assert.equal(
    fs
      .readdirSync(path.dirname(result.path))
      .some((name) => name.endsWith(".partial")),
    false,
  );
});

test("APIMart uses ratio and resolution then polls its asynchronous task", async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "storydock-apimart-"));
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1)
      return {
        ok: true,
        json: async () => ({ task_id: "task-123", status: "submitted" }),
      };
    if (calls.length === 2)
      return {
        ok: true,
        json: async () => ({ status: "processing" }),
      };
    if (calls.length === 3)
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          result: { images: ["https://cdn.example.com/generated.webp"] },
        }),
      };
    return {
      ok: true,
      headers: { get: () => "image/webp" },
      arrayBuffer: async () => Buffer.from("fake-webp"),
    };
  };
  const result = await generateImage({
    config: {
      baseUrl: "https://api.apimart.ai/v1",
      model: "gpt-image-2",
      ratio: "16:9",
      resolution: "2k",
    },
    prompt: "角色设定图",
    apiKey: "test-key",
    references: ["data:image/png;base64,cmVm"],
    projectId: "project-1",
    assetId: "asset-1",
    outputRoot,
    fetchImpl,
    pollIntervalMs: 0,
  });
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    model: "gpt-image-2",
    prompt: "角色设定图",
    size: "16:9",
    resolution: "2k",
    n: 1,
    image_urls: ["data:image/png;base64,cmVm"],
  });
  assert.equal(calls[1].url, "https://api.apimart.ai/v1/tasks/task-123?language=zh");
  assert.equal(fs.readFileSync(result.path, "utf8"), "fake-webp");
});

test("APIMart envelope returns a task id then an image URL array", async () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "storydock-apimart-envelope-"));
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1)
      return {
        ok: true,
        json: async () => ({
          code: 200,
          data: [{ status: "submitted", task_id: "task_01ABC" }],
        }),
      };
    if (calls.length === 2)
      return {
        ok: true,
        json: async () => ({
          code: 200,
          data: { id: "task_01ABC", status: "processing", progress: 10 },
        }),
      };
    if (calls.length === 3)
      return {
        ok: true,
        json: async () => ({
          code: 200,
          data: {
            id: "task_01ABC",
            status: "completed",
            progress: 100,
            result: {
              images: [{ url: ["https://cdn.example.com/generated.png"] }],
            },
          },
        }),
      };
    return {
      ok: true,
      headers: { get: () => "application/octet-stream" },
      arrayBuffer: async () => Buffer.from("fake-png"),
    };
  };
  const result = await generateImage({
    config: {
      baseUrl: "https://api.apimart.ai/v1",
      model: "gpt-image-2",
      ratio: "16:9",
      resolution: "1k",
    },
    prompt: "一只橘猫",
    apiKey: "test-key",
    projectId: "project-1",
    assetId: "asset-1",
    outputRoot,
    fetchImpl,
    pollIntervalMs: 0,
  });
  assert.equal(calls[1], "https://api.apimart.ai/v1/tasks/task_01ABC?language=zh");
  assert.equal(calls[3], "https://cdn.example.com/generated.png");
  assert.equal(fs.readFileSync(result.path, "utf8"), "fake-png");
});

test("successful HTTP error payload keeps the provider message", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      error: {
        code: "invalid_resolution",
        message: "This model only supports 1k, 2k or 4k resolution (got: 720p).",
      },
    }),
  });
  await assert.rejects(
    () =>
      generateImage({
        config: {
          baseUrl: "https://api.apimart.ai/v1",
          model: "gpt-image-2",
          ratio: "16:9",
          resolution: "1k",
        },
        prompt: "p",
        apiKey: "k",
        projectId: "project-1",
        assetId: "asset-1",
        outputRoot: os.tmpdir(),
        fetchImpl,
      }),
    /only supports 1k/,
  );
});

test("missing image payload and unsafe IDs are rejected", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ data: [] }),
  });
  const base = {
    config: { baseUrl: "https://api.example.com/v1", model: "model" },
    prompt: "p",
    apiKey: "k",
    projectId: "project-1",
    assetId: "asset-1",
    outputRoot: os.tmpdir(),
    fetchImpl,
  };
  await assert.rejects(() => generateImage(base), /没有返回/);
  await assert.rejects(
    () => generateImage({ ...base, projectId: "../escape" }),
    /ID/,
  );
});
