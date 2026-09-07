const test = require("node:test");
const assert = require("node:assert/strict");

global.window = {};
require("../public/image-templates.js");

const template = global.window.IMAGE_TEMPLATES["forced-perspective-poster"];

test("forced perspective poster is registered as a 2:3 template with explicit inputs", () => {
  assert.ok(template);
  assert.equal(template.label, "强迫透视海报");
  assert.equal(template.size, "1024x1536");
  assert.match(template.referenceHint, /人物、服装、品牌视觉或道具图/);
  assert.deepEqual(
    template.fields.filter((field) => field.required).map((field) => field.name),
    ["theme", "brandEvent", "keyword", "character", "prop", "action", "typeColor", "environment"],
  );
});

test("forced perspective poster prompt preserves the interaction and layout contract", () => {
  const prompt = template.build({
    theme: "汽车",
    brandEvent: "远途公路节",
    keyword: "DRIVE",
    character: "一位穿橙色赛车夹克、神情专注的成年女车手",
    prop: "方向盘",
    action: "双手握住并转动",
    typeColor: "酸性青柠",
    environment: "真实赛车座舱",
    supportInfo: "9月18日 · 上海 · 即刻出发",
    lighting: "从左侧照入的清晨阳光",
    extra: "保留轻微运动模糊，但手和方向盘必须清晰",
  }, { hasReference: true });

  assert.match(prompt, /20–28 毫米广角镜头/);
  assert.match(prompt, /身体 → 手臂 → 手 →【方向盘】/);
  assert.match(prompt, /同一个【方向盘】/);
  assert.match(prompt, /字体在后、人物在中、前景物体在最前/);
  assert.match(prompt, /不要单独添加脚带、底部护带或信息色块/);
  assert.match(prompt, /超大的粗体无衬线关键词“DRIVE”/);
  assert.match(prompt, /9月18日 · 上海 · 即刻出发/);
  assert.match(prompt, /参考图合同/);
  assert.doesNotMatch(prompt, /\{(?:name|主题|主要词)\}/);
});
