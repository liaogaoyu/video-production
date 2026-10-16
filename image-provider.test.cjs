const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  endpointFor,
  sizeForRatio,
  generateImage,
} = require("./image-provider.cjs");

test("image endpoint and ratio mapping are deterministic", () => {
  assert.equal(
    endpointFor("https://api.example.com/v1"),
    "https://api.example.com/v1/images/generations",
  );
  assert.equal(sizeForRatio("9:16"), "1024x1536");
  assert.throws(() => endpointFor("http://example.com/v1"), /HTTPS/);
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
