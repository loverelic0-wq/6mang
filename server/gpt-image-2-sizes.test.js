const test = require("node:test");
const assert = require("node:assert/strict");

const sizes = require("../public/gpt-image-2-sizes");
const { selectImageUpstreamRequest } = require("./image-routing");

test("GPT Image 2 accepts exact sizes at the documented boundaries", () => {
  assert.equal(sizes.validateSize("1024x1024").valid, true);
  assert.equal(sizes.validateSize("3072x1024").valid, true);
  assert.equal(sizes.validateSize("3840x2160").valid, true);
  assert.equal(sizes.validateSize("2880x2880").valid, true);
});

test("GPT Image 2 exposes every requested ratio at 1K, 2K and 4K", () => {
  const ratios = ["16:9", "9:16", "2:3", "3:2", "3:4", "4:3", "1:1"];
  const tiers = ["1K", "2K", "4K"];
  assert.equal(sizes.allPresets().length, ratios.length * tiers.length);
  for (const ratio of ratios) {
    for (const tier of tiers) {
      const preset = sizes.getPreset(ratio, tier);
      assert.equal(preset.valid, true, `${ratio} ${tier} should be valid`);
      assert.equal(preset.width % 16, 0);
      assert.equal(preset.height % 16, 0);
    }
  }
  assert.equal(sizes.getPreset("16:9", "4K").size, "3840x2160");
  assert.equal(sizes.getPreset("1:1", "4K").size, "2880x2880");
  assert.equal(sizes.getPreset("2:3", "1K").size, "672x1008");
});

test("legacy custom sizes migrate to the nearest ratio and resolution preset", () => {
  assert.deepEqual(
    (({ ratio, tier, size }) => ({ ratio, tier, size }))(sizes.inferPreset("3840x2160")),
    { ratio: "16:9", tier: "4K", size: "3840x2160" },
  );
  assert.deepEqual(
    (({ ratio, tier, size }) => ({ ratio, tier, size }))(sizes.presetForAspect(3 / 4, "2048x2048")),
    { ratio: "3:4", tier: "2K", size: "1536x2048" },
  );
});

test("GPT Image 2 rejects each invalid size constraint", () => {
  assert.match(sizes.validateSize("3856x2048").error, /3840/);
  assert.match(sizes.validateSize("1025x1024").error, /16px/);
  assert.match(sizes.validateSize("3840x1264").error, /3:1/);
  assert.match(sizes.validateSize("1024x512").error, /655,360/);
  assert.match(sizes.validateSize("3840x3840").error, /8,294,400/);
});

test("canvas fitting produces valid 16px-grid sizes without exceeding the limits", () => {
  const fourK = sizes.fitDimensions(7680, 4320);
  assert.deepEqual([fourK.width, fourK.height], [3840, 2160]);

  const square = sizes.fitDimensions(8000, 8000);
  assert.deepEqual([square.width, square.height], [2880, 2880]);

  const small = sizes.fitDimensions(512, 512);
  assert.equal(small.valid, true);
  assert.equal(small.width % 16, 0);
  assert.equal(small.height % 16, 0);
  assert.ok(small.pixels >= sizes.MIN_PIXELS);

  assert.match(sizes.fitDimensions(4000, 1000).error, /3:1/);
});

test("image routing validates GPT Image 2 before forwarding but leaves other models unchanged", () => {
  const provider = { baseUrl: "https://147ai.com/v1", defaultModel: "gpt-image-2" };
  const request = selectImageUpstreamRequest(provider, {
    model: "gpt-image-2",
    prompt: "test",
    size: "3840x2160",
  });
  assert.equal(request.payload.size, "3840x2160");

  assert.throws(
    () => selectImageUpstreamRequest(provider, { model: "gpt-image-2", size: "4000x2000" }),
    /最大边不能超过 3840px/,
  );

  assert.doesNotThrow(() => selectImageUpstreamRequest(provider, { model: "gpt-image-2" }));
  assert.doesNotThrow(() => selectImageUpstreamRequest(provider, { model: "other-image-model", size: "4000x2000" }));
});
