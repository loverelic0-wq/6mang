// 营销物料模板注册表（window.IMAGE_TEMPLATES）
// ——————————————————————————————————————————————————————————————
// 来源：obstian 知识库用 GPT Image 2 提示词框架做的 6 个独立出图 app，
//   本节点把它们收进「营销物料」节点 = 一个节点 + 可切换模板。
// 加新模板 = 往这个对象里加一条：{ label, size, fields[], build(d, ctx) }。
//   - fields[] 只声明业务字段（模型/尺寸行由 app.js 通用渲染，不在这里）
//     · type: text | select | textarea ；required ；optional（折进“更多选项”）
//     · select 的 options: [[value, label], ...] ；dimWhenReference: 接参考图时置灰
//   - build(d, ctx) 把表单值拼成最终 prompt；ctx.hasReference = 是否接了参考图
// 6 个模板 = MrLarus 系列通用 prompt 原文忠实搬运：
//   品牌包装 #8 / 餐饮立牌 #10 / 品牌展台 #7 / 展位双视角 #9 / 轻盈海报 #11 / 科普绘本
// wiki 卡：topics/midjourney/gpt-image-2-application-matrix-hub.md

(function () {
  // 列表型字段拆分（顿号 / 逗号 / 换行 / 分号 / 竖线）
  function splitList(s) {
    if (!s) return [];
    return String(s)
      .split(/[、,，\n;；|｜]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  // 接了参考图时的“参考图优先”前缀（role = 角色化补充说明）
  function refPrefix(ctx, role) {
    if (!ctx || !ctx.hasReference) return "";
    return `【参考图优先】画面中必须以参考图里的真实产品 / 实物为视觉锚点，保持其真实外观、颜色、材质与品牌调性${
      role ? "，" + role : ""
    }（以实物为准，不要凭空改色、不要替换成其它产品）。\n\n`;
  }

  // ============ 1. 品牌包装（MrLarus #8 / 4:5）============
  const PACKAGING_CATEGORIES = [
    ["food", "食品 / 烘焙 / 零食"],
    ["beverage", "茶饮 / 咖啡 / 饮料"],
    ["cosmetics", "美妆 / 护肤 / 彩妆 / 香水"],
    ["home", "香氛 / 家居 / 生活方式"],
    ["fashion", "服饰 / 饰品 / 潮玩 / 文创"],
    ["digital", "数码配件 / 工具 / 小型消费品"],
  ];
  const PACKAGING_PACKAGE_LOGIC = {
    food: "以纸袋、纸盒、包装袋、杯子、食品容器、贴纸、封签及真实产品本体为主",
    beverage: "以杯子、瓶子、罐装包装、提袋、杯套、封口贴、礼盒等为主",
    cosmetics: "以瓶、罐、管、盒、礼盒、手提袋、小样包装等为主",
    home: "以香薰瓶、蜡烛杯、包装盒、礼盒、提袋、吊卡、标签卡等为主",
    fashion: "以包装盒、抽屉盒、防尘袋、手提袋、贴纸、吊牌、配件包装等为主",
    digital: "以硬盒、外包装盒、收纳袋、说明卡、贴纸、封套、标签等为主",
  };
  const PACKAGING_COLORS = [
    ["auto", "自动（模型受控发散）"],
    ["奶油白与焦糖棕", "奶油白与焦糖棕"],
    ["雾灰蓝与暖白", "雾灰蓝与暖白"],
    ["橄榄绿与亚麻米", "橄榄绿与亚麻米"],
    ["酒红与奶霜白", "酒红与奶霜白"],
    ["可可棕与象牙白", "可可棕与象牙白"],
    ["炭灰与麦秆金", "炭灰与麦秆金"],
    ["雾粉灰与米白", "雾粉灰与米白"],
    ["海军蓝与暖灰", "海军蓝与暖灰"],
  ];
  function categoryLabelOf(key) {
    const found = PACKAGING_CATEGORIES.find((c) => c[0] === key);
    return found ? found[1] : PACKAGING_CATEGORIES[0][1];
  }
  function buildPackagingPrompt(d, ctx) {
    const brandName = String(d.brandName || "").trim() || "（未命名品牌）";
    const categoryKey = PACKAGING_PACKAGE_LOGIC[d.category] ? d.category : "food";
    const categoryLabel = categoryLabelOf(categoryKey);
    const packageLogic = PACKAGING_PACKAGE_LOGIC[categoryKey];

    let colorHint;
    if (ctx && ctx.hasReference) {
      colorHint =
        "画面中必须出现并以参考图里的真实产品为视觉锚点，整套包装系统的主色调、辅助色与材质质感都从该产品实物中提取并向外延展，保持与真实产品一致的品牌调性（以产品实物颜色为准，不要偏离成其它色系，不要荧光色、不要廉价高饱和）";
    } else if (d.colorDirection && d.colorDirection !== "auto") {
      colorHint = `本次配色方向建议：${d.colorDirection}（仅作参考，模型可在此基础上微调）`;
    } else {
      colorHint =
        "本次配色由模型自动选择高级、克制、有品牌感的方向（受控发散，不要荧光色，不要廉价高饱和）";
    }
    const extra = String(d.extra || "").trim();

    return `请为品牌【${brandName}】、类目为【${categoryLabel}】创作一张高审美、高完成度的「品牌包装系统展示图」。这不是普通电商白底图，也不是单一产品图，而是一张具有品牌提案感、视觉识别系统感和商业摄影质感的包装家族陈列效果图。画面需要体现"同一品牌在多个包装载体上的统一落地"，呈现一个成熟消费品牌的完整包装系统。

【画幅要求】整体必须为固定 4:5 的竖版海报构图，画面方向明确为纵向，禁止生成横版构图、宽幅桌面陈列或过于分散的横向展示。整体构图需符合海报阅读逻辑：上方保留呼吸感，中部为品牌包装系统的主要视觉焦点，下方安排辅助包装、标签和产品本体，整体重心集中，适合直接作为品牌展示海报发布。

【核心要求】根据【${categoryLabel}】自动匹配最合理、最自然的包装组合与产品形态，并围绕【${brandName}】建立统一的品牌视觉系统。画面中应选择少量但有代表性的包装形式，组成一组完整而精炼的品牌包装系统，不追求堆砌数量，而强调主次层级、品牌统一性与陈列美感。

【类目适配】当前类目【${categoryLabel}】，${packageLogic}。整体必须体现"类目合理、品牌统一、包装成体系"的效果。

【数量与密度控制】请控制画面中的物件数量，不要过多堆砌，也不要把所有可能包装形式全部展示出来。整体应呈现"少而精、完整但不拥挤"的品牌包装系统效果。建议：大件包装 1-2 个，中型包装 2-3 个，小型包装或辅助物件 2-4 个，真实产品本体 1-3 个，总可见元素建议控制在 6-10 个之间。包装种类应体现层次变化与系统感，但不宜重复过多同类物件。

【品牌视觉系统】所有包装必须属于同一个品牌系统，统一使用【${brandName}】作为核心品牌识别元素。整体应具备一致的 logo / 标志呈现、字体风格、图形语言、插画语言或纹样系统、排版逻辑、配色体系、材质与印刷质感。

【配色机制】${colorHint}。整体保持高级、统一、克制、有品牌感。

【画面构图】画面采用品牌包装家族陈列逻辑，而不是杂乱堆放。整体为商业摄影棚场景，使用 3/4 轻俯视角或略带透视的正面陈列角度。构图参考：后景摆放 1-2 个较大的包装作为视觉支撑；中景安排品牌核心包装或主力单品包装，作为主要视觉焦点；前景摆放较小包装、辅助包装、标签、贴纸及真实产品本体；至少有一个真实产品与包装产生自然互动。整体形成平衡而有设计感的三角式或错落式构图。画面干净、有留白、不拥挤。

【视觉风格】整体呈现高端商业摄影质感与品牌提案感，背景为干净的摄影棚环境，可为白色、暖白色、浅灰色，或根据品牌调性自动匹配的极简背景。画面应强调真实的包装材质表现、清晰的纸张折痕、盒型结构、瓶罐轮廓、标签细节、印刷质感、压纹 / 烫金 / 哑光 / 棉纸纹理 / 牛皮纸纹理等材质细节。

【光影】采用真实商业摄影级光影，可为柔和棚拍光，也可带有轻微方向性的自然侧光。需要有清晰但克制的阴影，以增强立体感、空间感与高级感。整体光线通透、明亮、干净，不要阴暗，不要廉价感，不要杂乱背景。

【最终效果】最终画面应像一个成熟品牌的包装系统展示海报、包装家族提案图或品牌视觉落地效果图，而不是零散商品拼图。重点突出：固定 4:5 竖版海报感、品牌统一性、包装家族完整性、商业摄影感、设计提案感、类目适配性，以及高级审美与视觉完成度。${
      extra ? `\n\n【额外补充】${extra}` : ""
    }`;
  }

  // ============ 2. 餐饮立牌（MrLarus #10 / 3:4）============
  const DINING_THEMES = [
    ["auto", "自动（按主推产品判断）"],
    ["爆辣夜市风", "爆辣夜市风"],
    ["金黄浓郁风", "金黄浓郁风"],
    ["清新轻食风", "清新轻食风"],
    ["山野自然风", "山野自然风"],
    ["甜品下午茶风", "甜品下午茶风"],
    ["快餐促销风", "快餐促销风"],
  ];
  function buildDiningStandeePrompt(d, ctx) {
    const theme =
      d.theme && d.theme !== "auto"
        ? d.theme
        : "由模型根据主推产品自动判断（爆辣夜市 / 金黄浓郁 / 清新轻食 / 山野自然 / 甜品下午茶 / 快餐促销 等之一）";
    const sides = splitList(d.sideProducts).slice(0, 4);
    const sideLine =
      sides.length > 0
        ? sides.map((p, i) => `辅助产品${i + 1}：${p}`).join("\n")
        : "辅助产品：由模型围绕主推产品自动搭配 2-5 个相关辅助产品 / 配菜 / 配角，形成丰富层次";
    const points = splitList(d.sellingPoints).slice(0, 6);
    const pointLine =
      points.length > 0
        ? points.map((p) => `· ${p}`).join("\n")
        : "· 由模型自动生成 3-6 个有食欲感、有促销力的卖点标签";
    const promos = splitList(d.promo).slice(0, 3);
    const promoLine =
      promos.length > 0
        ? promos.map((p) => `· ${p}`).join("\n")
        : "· 如适用可加价格 / 套餐 / 活动 / 新品尝鲜信息（无则可省略，默认不要二维码）";
    const aux = splitList(d.auxPhrases).slice(0, 3);
    const auxLine = aux.length > 0 ? aux.join(" ｜ ") : "（由模型按主题自动补充简短辅助短句）";
    const hasColor = (d.mainColor || "").trim() || (d.assistColor || "").trim() || (d.accentColor || "").trim();
    const colorLine = hasColor
      ? `主色调：${(d.mainColor || "").trim() || "由模型按主题匹配"}；辅助色：${(d.assistColor || "").trim() || "由模型按主题匹配"}；点缀色：${(d.accentColor || "").trim() || "由模型按主题匹配"}`
      : "主色调 / 辅助色 / 点缀色：由模型根据【主题方向】自动匹配一套统一、有食欲感、有商业促销力的配色";

    return `${refPrefix(ctx, "主推产品以参考图中的真实产品为准，保持其真实外观、颜色与质感")}请生成一张高完成度的「餐饮异形展架 / 立牌」设计图，用于展示餐饮门店的新品推荐、招牌产品、套餐促销或品牌活动信息。

【基础信息】
品牌名：${String(d.brandName || "").trim()}
主标题：${String(d.mainTitle || "").trim()}
副标题：${(d.subTitle || "").trim() || "（可省略 / 由模型按主标题与主题自动补一句）"}
辅助短句：${auxLine}
主题方向：${theme}
${colorLine}
画幅比例：3:4 竖版

【产品内容】
主推产品：${String(d.mainProduct || "").trim()}
${sideLine}

【卖点标签】
${pointLine}

【促销信息】
${promoLine}

【最重要要求】这不是门店场景效果图，也不是海报贴在墙上的展示图。请直接生成"一张完整的异形立牌成品展示图"：背景必须为纯白色；画面中只保留一个完整的异形餐饮立牌主体；不要餐厅环境、商场背景、玻璃门、桌椅、墙面、人物、地面透视场景；不要任何真实空间背景。立牌主体必须完整显示，异形轮廓必须完整清晰，底座必须完整露出，整体像一张已经抠好的门店物料成品图 / 设计提案展示图 / 电商展示图。

【画面形式】这是一张"门店异形展架 / 立牌"的完整设计，不是普通矩形海报。整体应采用明显的"不规则异形裁切轮廓"，有完整外边缘，边缘可带白色或浅色描边，具有真实门店物料感。立牌应有明确底座，整体像可落地摆放的 KT 板 / 泡沫板 / 亚克力 / 写真喷绘展架成品。

【构图结构】竖版、中心聚焦、信息分层清楚：①顶部放超大主标题，醒目、有冲击力、有餐饮 POP 招贴感，字体可厚重 / 手写感 / 招贴感 / 潮流感但要清晰易读，是第一视觉焦点；②中部核心区放最大的主推产品作为主视觉主体，最大、最饱满、最诱人，围绕它搭配 2-5 个辅助产品形成层次，主次分明；③周边信息区在产品四周加入少量标签、推荐标、贴纸框、手写箭头、卖点说明、小气泡标签，做到"热闹但不乱"；④底部促销区放价格 / 套餐 / 活动信息，价格数字相对突出、易读。

【视觉风格】"餐饮转化型视觉 + 门店 POP 异形立牌"：强调食欲感、信息可读性、商业落地感、门店物料感、异形轮廓感。不是极简杂志海报，不是电商详情页，也不是纯平面插画海报。

【食物表现】所有食物采用真实商业美食摄影质感：清晰真实、有食材颗粒感、有酱汁汤汁油光热气层次感、细节丰富（葱花 / 辣椒 / 芝士 / 香草 / 蔬菜 / 水果 / 虾仁 / 肉块等），主食饱满不扁平，看起来能激发食欲。禁止过度插画化、卡通化、低质拼贴化。

【版式与信息层级】阅读顺序：主标题 → 主推产品 → 辅助产品 → 卖点标签 → 价格 / 活动信息。主标题最大、主菜次大、辅助菜稍小、卖点标签较小、底部促销清晰醒目。信息量可较丰富但层级必须明确。

【输出要求】输出一张高清、清晰、商业完成度高的异形立牌设计图：纯白色背景 / 完整异形轮廓 / 完整底座 / 只展示立牌本体 / 不带真实场景环境 / 不带人物 / 不带门店背景 / 默认不带二维码 / 适合用于系列案例展示、设计提案、社交媒体发布、模板复用。`;
  }

  // ============ 3. 品牌展台（MrLarus #7 / 4:3）============
  function buildBoothPrompt(d, ctx) {
    const brandName = String(d.brandName || "").trim();
    const extraLine = (d.extra || "").trim() ? `\n额外补充：${(d.extra || "").trim()}` : "";
    return `${refPrefix(ctx, "请将参考图中的真实产品 / 品牌视觉自然融入产品展示区，保持其真实外观")}请根据【品牌名】与【行业】创作一张高完成度、适合提案展示的「3D展台 / 展位设计效果图（Exhibition Booth Design Rendering）」。 这不是普通海报，也不是平面宣传图，而是一张具有真实空间感、立体结构感、材质表现力与商业提案感的展会展位3D效果图。整体需要呈现出"专业展陈公司提案图 / 展台设计效果图 / 品牌展位空间模型"的视觉效果。

【输入信息】
品牌名：${brandName}
行业：${String(d.industry || "").trim()}${extraLine}

【自动理解规则】
请不要机械套用单一模板，而是根据【品牌名】与【行业】自动判断并补全最合理的展位设计方案，包括但不限于：
1. 自动判断该行业适合的空间气质，例如科技感、工业感、现代感、轻奢感、环保感、医疗感、消费品展示感等；
2. 自动判断适合的主色调与辅助色，并可适度参考品牌视觉逻辑；
3. 自动判断适合展示的产品类型、展示道具、陈列方式与空间分区；
4. 自动补全品牌墙、门头、接待台、产品展示区、洽谈区、灯光系统、地面与结构框架等展位常见组成；
5. 若行业适合，可自动加入屏幕、灯箱、展柜、样品架、互动演示区、储物区等展陈模块；
6. 整体保持商业展示逻辑清晰，空间布局合理，不能杂乱堆砌。

【图像类型与目标】
整体画面应是一张"品牌展位的立体3D模型效果图 / 展会展台设计渲染图"，重点呈现：
- 完整的展位空间结构
- 品牌识别系统
- 行业属性匹配的展示内容
- 专业、现代、真实、可落地的商业展示气质

【构图与视角】
画面采用展位最常见、最适合提案展示的 3/4 斜侧视角，让观者可以同时看清展位正面、侧面与部分内部空间结构。
整体构图应完整展示展位全貌，展台主体位于画面中央，边界清楚，层次明确，空间关系清晰。
可采用单个展位独立呈现的方式，背景简洁干净，避免复杂展馆环境干扰主体；也可轻微带出展会环境氛围，但主体必须突出。

【展位结构要求】
请自动构建完整、合理的展位空间，一般应包含以下核心区域：
1. 品牌门头 / Logo展示区
2. 主视觉背景墙
3. 产品展示区
4. 接待台 / 前台
5. 洽谈区 / 座谈区
6. 灯光系统 / 发光结构
7. 地台 / 地面设计
8. 行业相关的陈列设施、样品展示模块或互动展示模块

【视觉风格要求】
整体风格要高级、专业、现代、干净，具有明显的"商业展会设计提案"气质。
不是卡通，不是插画，不是概念艺术，不是舞台场景，而是高质量的空间设计效果图。
材质表现要明确，可体现木质、金属、玻璃、亚克力、灯箱、发光字、烤漆板、布艺、石材、工业材料等适合行业特征的材质。
灯光要自然、均匀、专业，体现展位空间层次与重点展示区域。

【品牌呈现要求】
品牌名"${brandName}"应合理地体现在门头、品牌墙或接待台等关键位置，形成清晰品牌识别。
如无额外说明，请不要生成过多复杂文案，重点突出品牌名与行业对应的视觉信息。

【画面质感要求】
整体应具有：
- 高完成度3D建模感
- 专业展陈效果图质感
- 清晰的材质与结构表现
- 真实灯光渲染效果
- 商务提案级视觉质量

【输出倾向】
请优先生成一种"具有普适商业价值、结构完整、品牌感明确、行业特征清晰、适合企业客户审美"的展位设计效果，而不是过度艺术化或过度夸张的舞美装置。

Make the aspect ratio 4:3`;
  }

  // ============ 4. 展位双视角（MrLarus #9 / 3:4 长图）============
  function buildBoothDualViewPrompt(d, ctx) {
    const brandName = String(d.brandName || "").trim();
    const productSeries = String(d.productSeries || "").trim();
    const brandPosition = (d.brandPosition || "").trim() || "由模型自动根据行业和品牌名推断";
    const brandKeywords = (d.brandKeywords || "").trim() || "由模型自动根据行业和产品系列推断（3-6 个关键词）";
    const mainColor = (d.mainColor || "").trim() || "由模型自动根据行业和品牌定位匹配";
    const assistColor = (d.assistColor || "").trim() || "由模型自动匹配（通常为白色 / 浅灰 / 米白等中性底色）";
    const accentColor = (d.accentColor || "").trim() || "由模型自动匹配（少量点缀强调色）";
    const spaceStyle = (d.spaceStyle || "").trim() || "由模型自动根据行业和品牌定位判断（科技极简 / 轻奢零售 / 东方现代 / 亲子友好 / 自然疗愈 / 潮流快闪 等之一）";
    const materials = (d.materials || "").trim() || "由模型自动根据空间风格方向匹配（烤漆板 / 亚克力 / 玻璃 / 金属 / 木质 / 灯箱 / 软膜 / 磨砂材质 等）";

    return `${refPrefix(ctx, "请将参考图中的真实产品 / 品牌视觉自然融入产品展示区，保持其真实外观")}请生成一张高完成度的「品牌展位空间提案图 / Brand Booth Concept Render」。

【项目设定】
主题行业：${String(d.industry || "").trim()}
品牌名：${brandName}
产品系列：${productSeries}
品牌定位：${brandPosition}
品牌关键词：${brandKeywords}
主色调：${mainColor}
辅助色：${assistColor}
点缀色：${accentColor}
空间风格方向：${spaceStyle}
主要材质：${materials}
画幅比例：3:4 竖版长图

【核心输出形式】
这是一张竖版长图，同一张图中展示"同一个展位方案"的两个视角，上下排布：
- 上半部分：偏正面的主视角，重点展示品牌门头、主入口、前台、主视觉背景墙
- 下半部分：偏斜角的透视视角，重点展示侧面结构、内部陈列、动线和空间纵深
注意：上下两部分必须是同一个展位，只是观察视角不同，不能生成成两个不同方案。

【图片类型定义】
这不是普通海报，也不是单一室内图，而是一张专业的品牌展位空间提案图 / 展会展位效果图。整体需要具有商业提案感、3D渲染感、品牌识别度和真实展陈空间质感，像专业展会设计公司输出的方案图。

【展位结构要求】
展位采用半开放式结构，空间完整、合理、可落地，具有明确的展陈逻辑。画面中应包含以下核心模块：
1. 顶部品牌门头：清晰展示${brandName}，并体现品牌识别
2. 主视觉背景墙：用于展示品牌主视觉、slogan或核心产品画面
3. 产品展示区：通过展示柜、层架、陈列墙、岛台或样品区展示${productSeries}
4. 接待台 / 咨询台：位于前部或入口附近，具备品牌识别
5. 局部体验区 / 洽谈区：可包含体验桌、试用台、互动屏、桌椅、演示区等
6. 灯光系统：含顶部照明、发光灯箱、灯带、局部背光等
7. 地面与背景：地面干净，可有轻微反射；背景可为简洁展馆环境或中性空间背景，但不要喧宾夺主

【视觉风格要求】
整体风格统一，偏现代、干净、专业、高级，有明显品牌感和商业可信度。根据${spaceStyle}来调整设计语言，但总体要保持展位提案图的完成度。可使用几何结构、圆角模块、弧形门头、发光边框、悬浮结构、展示层架等设计元素，使其具有真实商业空间的搭建逻辑。

【色彩逻辑】
以${mainColor}为品牌识别主色，贯穿门头、局部墙面、前台、展示结构、灯箱边框等核心位置；
以${assistColor}作为空间基底色，通常为白色、浅灰、米白、浅木色等，使画面干净、高级；
以${accentColor}用于局部强调，如产品标签、灯光细节、装饰边缘、小面积结构点缀等；
整体配色要统一，不杂乱，不花哨。

【材质与质感】
根据${materials}塑造展位质感，整体应呈现高质量 3D 渲染效果。材质表达清晰，边缘干净，空间透视准确，灯光柔和真实，局部有商业空间的光影层次，画面清晰细腻。

【构图与阅读逻辑】
- 展位主体必须完整入镜
- 上半图重点看"品牌门面识别"
- 下半图重点看"空间结构与内部陈列"
- 视觉阅读路径应清晰：品牌门头 → 整体展位结构 → 主视觉背景墙 → 产品展示区 → 接待台 → 局部细节
- 画面不要太空，也不要太挤，保持信息密度适中

【品牌与文字要求】
画面中只保留少量必要文字，尽量简洁、准确、清晰：
- 品牌名：${brandName}
- 产品系列名：${productSeries}
- 可搭配1句简短品牌短语或slogan${(d.slogan || "").trim() ? `：${(d.slogan || "").trim()}` : "（由模型自动根据品牌定位生成或省略）"}
不要生成大量无意义文字，不要出现明显乱码，不要堆砌说明文案。

【人物与辅助元素】
可加入少量人物作为比例参考，提升真实展会空间感，但人物必须弱化，不能喧宾夺主。可根据行业加入少量辅助元素，如包装样品、演示设备、植物、礼盒、互动屏、阅读物料、产品模型等，但都要服务于品牌和展位空间。

【避免事项】
不要做成普通海报拼贴
不要做成平面设计稿
不要做成商场专柜或杂乱摊位
不要让上下两张图变成两个不同展位
不要过度堆文字
不要过度拥挤
不要背景太复杂
不要直接复制任何真实品牌或参考图中的现有品牌内容

【最终效果】
最终输出应是一张完整、专业、统一、可落地的品牌展位空间提案图：同一张竖版长图中，上下展示同一个展位的两个不同视角，上图偏正面，下图偏斜角，整体具有强品牌识别、空间设计感和商业提案感。`;
  }

  // ============ 5. 轻盈手札海报（MrLarus #11 / 3:4）============
  const LIGHT_PRODUCT_TYPES = [
    ["auto", "自动（按产品判断）"],
    ["茶饮", "茶饮"],
    ["轻乳茶", "轻乳茶"],
    ["果茶", "果茶"],
    ["芭菲", "芭菲"],
    ["甜品杯", "甜品杯"],
    ["冰品", "冰品"],
    ["咖啡", "咖啡"],
    ["轻食", "轻食"],
  ];
  function buildLightPosterPrompt(d, ctx) {
    const productType =
      d.productType && d.productType !== "auto"
        ? d.productType
        : "由模型自动判断（茶饮 / 轻乳茶 / 果茶 / 芭菲 / 甜品杯 / 冰品 / 咖啡 / 轻食 之一）";
    const theme = (d.theme || "").trim() || "由模型自动（初夏清爽 / 盛夏果香 / 轻甜治愈 / 夏季限定 / 今日推荐 等之一）";
    const aux = splitList(d.auxPhrases).slice(0, 4);
    const auxLine =
      aux.length > 0
        ? aux.join(" / ")
        : "由模型自动补充 2-4 条（例：清爽果香 / 轻茶回甘 / 果香层层叠叠 / 入口很轻）";
    const hasColor = (d.mainColor || "").trim() || (d.assistColor || "").trim();
    const colorLine = hasColor
      ? `主色调：${(d.mainColor || "").trim() || "由模型自动"}；辅助色：${(d.assistColor || "").trim() || "由模型自动"}`
      : "主色调 / 辅助色：由模型根据产品类型与主题自动匹配，整体明亮、轻盈、低压迫感、清爽，不要厚重，不要脏灰，不要高饱和廉价感";

    return `${refPrefix(ctx, "产品主视觉以参考图中的真实产品为准，保持其真实外观、颜色与质感")}请生成一张竖版 3:4 的「轻盈手札产品海报」。

【品牌信息】
品牌名：${String(d.brandName || "").trim()}
品牌英文辅助名：${(d.brandEn || "").trim() || "由模型自动（可省略）"}
品牌气质：${(d.brandVibe || "").trim() || "由模型自动（例：城市轻茶 / 手作甜品 / 轻食生活方式 / 清爽低负担）"}
Logo方向：${(d.logoDir || "").trim() || "由模型自动（例：叶子 + 水波 + 小岛轮廓 / 果实 + 茶叶 / 极简手作符号）"}

【产品信息】
产品名：${String(d.productName || "").trim()}
产品类型：${productType}
主题方向：${theme}
主标题：${String(d.mainTitle || "").trim()}
副标题或产品副名：${(d.subTitle || "").trim() || "由模型自动（例：青柠茉莉冰茶 / 杨梅酸奶芭菲 / 芒果椰椰冰）"}
辅助短句：${auxLine}

【色彩系统】
${colorLine}
整体色彩要求：明亮、轻盈、低压迫感、清爽，不要厚重，不要脏灰，不要高饱和廉价感。

【系列定位】
这是一张适用于茶饮、甜品、咖啡、轻食、冰品等品类的夏日轻盈风产品海报。整体要兼具：
- 半写实产品主视觉
- 手写感中文标题
- 轻手绘注释元素
- 清爽留白背景
- 小标签 / 小圆章 / 小便签信息模块
画面要有品牌感、轻盈感、清爽感、年轻感、小资感，但不要像廉价促销单，也不要像儿童插画。

【产品表现要求】
产品主体必须半写实、真实、精致、立体，具有自然光感与柔和阴影，是画面绝对视觉重心。

【背景与氛围】
背景采用浅色柔和渐变或清透留白背景，可带轻微雾面纸感或柔光感。
可以根据主题加入轻微季节氛围，但背景不要复杂，不要做成真实大场景。
整体要有空气感、呼吸感和足够留白。

【手绘元素要求】
在产品周围加入少量轻手绘元素，用于注释与氛围辅助，这些元素要细、轻、松弛、有手帐感，但不能太杂乱，不能盖过产品主体，不能像幼儿园儿童画。

【文案排版结构】
顶部：品牌 Logo + 品牌名
中上区域：大号手写感中文主标题
标题下方：产品副名 / 副标题
中间主体：产品主视觉
产品周围：2-4 个手写注释气泡 / 小标签 / 小便签
下方局部：热量信息 / 轻卖点 / 功能信息 / 原料短句
底部：极简辅助说明、小图标、轻标签

【构图要求】
整体采用竖版 3:4，居中构图或中下重心构图。
画面主视觉要稳定，文字与注释围绕主体展开。
阅读路径清晰：品牌 → 主标题 → 产品 → 注释 → 底部信息
信息量中等偏丰富，但画面仍要干净，不要堆满。

【风格关键词】
清新、轻盈、半写实、手绘注释、产品海报、留白感、品牌感、夏日感、年轻化、轻商业、精致、治愈、小资、女性向友好。`;
  }

  // ============ 6. 科普绘本（MrLarus 导览式 / 4:3）============
  function buildSciencePicturebookPrompt(d, ctx) {
    const mainColor = (d.mainColor || "").trim() || "由模型自动匹配，整体保持明亮、清爽、儿童友好";
    const styleDir = (d.styleDir || "").trim() || "现代儿童科普绘本 / 场景导览式图解 / 高完成度数字插画";
    return `${refPrefix(ctx, "可参考参考图中的实物作为主场景的视觉参考")}请根据【主题】创作一张高完成度的「导览式科普绘本」风格插画。这是一张结合"大型场景主视觉 + 导览路线 + 可爱导览 IP + 知识站点 + 儿童科普绘本质感"的场景导览式科普图解页。画面需要让观者像被带着参观一个复杂系统一样，边看边理解主题背后的运行逻辑、空间结构、流程关系和关键知识点。

【基础设定】
主题：${String(d.topic || "").trim()}
画幅比例：【4:3 横版】
主色调：【${mainColor}】
风格方向：【${styleDir}】

【核心表达】
请围绕【主题】设计一个完整的大型场景或复杂系统。画面中必须有一个明确的主视觉场景，例如大型设施、交通系统、科技装备、自然探索场景、城市公共系统或生产流程。主体要足够清晰、有规模感、有细节，能够成为第一眼的视觉中心。

画面不是单纯展示这个场景，而是要通过"导览路线"的方式组织信息。请设计一条清晰的参观路线、流程路线、时间线或空间动线，让读者可以沿着路线一步步理解这个系统是如何运行的。

【导览 IP 设计】
请为本图设计一个原创、可爱、亲和的导览小 IP。导览 IP 可以是小动物、小朋友、拟人化工具或其他适合主题的原创形象，但必须具有独立原创性，不要照搬任何参考图中的角色、动物形象、服装、配色或搭档关系。

导览 IP 的作用是：
1. 开场介绍主题
2. 指向关键知识点
3. 引导读者顺着路线阅读
4. 增加儿童绘本的陪伴感和趣味性

导览 IP 可以在画面中出现 2–3 次，但不要过度抢主视觉。角色应圆润、可爱、有表情、有动作，适合儿童科普绘本。

【信息结构】
画面中请设置 3–6 个"知识站点"，每个站点用简短中文标签和短说明表达。站点命名可以采用：
- 第1站|xxx
- 第2站|xxx
- 重点观察|xxx
- 小知识|xxx
- 为什么|xxx
- 如何工作|xxx

每个知识点都要围绕主题的核心运行逻辑展开，不要写空泛说明。文字要短、清楚、自然，避免长段落，适合儿童阅读。

【画面模块】
整张图建议包含以下模块：
1. 顶部主标题区：清楚写出主题名称
2. 开场导览区：导览 IP 引出主题
3. 大型主场景区：展示主题系统的完整场景
4. 导览路线区：用箭头、虚线、路径、时间节点或流程线串联知识点
5. 知识站点区：用小信息框、导览牌、局部标注展示关键知识
6. 小百科 / 小贴士区：补充一个有趣知识
7. 收尾区：让导览 IP 做简短总结或引导

【构图要求】
画面采用 4:3 横版构图，整体像一本高质量儿童科普绘本的跨页，也像一张儿童科技馆导览图。画面需要有清晰的视觉重心：大型主场景占据主要空间，导览路线贯穿画面，知识模块自然分布在周围。信息丰富但不能杂乱，阅读路径要顺畅。

【视觉风格】
整体采用现代儿童科普绘本风格：
- 明亮、清爽、干净的色彩
- 清晰自然的手绘线条
- 高完成度数字插画质感
- 细节丰富但有秩序
- 可爱但不低幼
- 有科普图解感
- 有导览地图感
- 场景真实可信，但表达方式亲和

【文字与标注】
文字以中文为主，使用短标题、短标签、简短说明。不要生成大段复杂文字。信息框应像儿童科普书中的导览牌、知识卡片或小贴士。文字要尽量清晰、简洁、可读。

【最终目标】
让整张图像一页高质量的儿童科普绘本：孩子第一眼被可爱角色和大场景吸引，第二眼能顺着路线读懂系统如何运行，第三眼还能继续发现细节和知识点。画面要具有系列化潜力，方便后续替换不同主题继续创作同类型图片。`;
  }

  // ============ 7. 强迫透视编辑海报（2:3 竖版）============
  function buildForcedPerspectivePosterPrompt(d, ctx) {
    const theme = String(d.theme || "").trim();
    const brandEvent = String(d.brandEvent || "").trim();
    const keyword = String(d.keyword || "").trim();
    const character = String(d.character || "").trim();
    const prop = String(d.prop || "").trim();
    const action = String(d.action || "").trim();
    const typeColor = String(d.typeColor || "").trim();
    const environment = String(d.environment || "").trim();
    const supportInfo = String(d.supportInfo || "").trim();
    const lighting = String(d.lighting || "").trim();
    const extra = String(d.extra || "").trim();
    const referenceContract = ctx && ctx.hasReference
      ? `【参考图合同】已提供参考图。只把其中与本任务相符的人物身份、服装、品牌视觉或互动道具作为真实视觉锚点；保持可识别特征、颜色、材质和结构，不照搬无关背景，也不要额外复制参考图中的人物或物体。\n\n`
      : "";

    return `${referenceContract}请为【${brandEvent}】创作一张以【${theme}】为主题的干净、全出血编辑宣传海报。画面采用逼真的商业摄影、超大彩色无衬线字体，以及强烈但物理连贯的强迫透视。输出为 2:3 竖版海报，画面延伸到四边，不要边框、留白边或独立底栏。

【本次变量】
- 主题：${theme}
- 品牌 / 事件：${brandEvent}
- 主要词：${keyword}
- 成人角色：${character}
- 互动物品：${prop}
- 自然动作：${action}
- 字体颜色：${typeColor}
- 环境：${environment}
- 支持信息：${supportInfo || "仅保留品牌 / 事件名，不自动补写其它文字"}
- 光线补充：${lighting || "柔和而有方向性的商业摄影光"}

【镜头与强迫透视】
使用 20–28 毫米广角镜头，人物处于中近景或全身动作构图。把同一个【${prop}】放在最靠近相机的前景，由人物亲自、自然地【${action}】。它只能因为离镜头非常近而显得夸张巨大，不能通过变形、错误比例或拼贴制造“大”。前景物体、手部、手臂、肩部和身体必须处于同一条可信的空间与动作链中。

【物理连续性——最高优先级】
- 画面中必须清楚成立：身体 → 手臂 → 手 →【${prop}】。
- 手必须真正接触、握持、拉动、操作或使用该物体，握法与动作【${action}】一致。
- 手指数目、关节方向、手腕角度、肘部连接、肩部连接和受力关系真实。
- 保持【${prop}】自身结构完整、透视正确、材质真实；不要出现第二个相同物体、漂浮副本或断开的部件。
- 人物表情、视线、重心和身体姿态要响应正在发生的动作，而不是摆拍式地把物体举向镜头。

【字体与空间层级】
在人物身后放置唯一一个超大的粗体无衬线关键词“${keyword}”，颜色为【${typeColor}】。人物躯干、连续的手臂和近镜头的【${prop}】要自然遮挡部分字母，形成“字体在后、人物在中、前景物体在最前”的三层深度。关键词即使被局部遮挡仍应可辨认。除品牌 / 事件、关键词和已提供的支持信息外，不要生成任何无意义填充文字、伪字、随机数字或复杂界面。

【全出血场景】
环境明确为【${environment}】，并从画面上方、中景一直连续延伸到底部边缘。街道、地面、车辆内部、航站楼、健身房或建筑结构必须属于同一真实空间，不能在脚部附近突然截断或换成纯色条。不要单独添加脚带、底部护带或信息色块；如有底部支持信息，直接排在真实场景上方，并控制为少量、清楚、有意义的品牌、日期、地点、类别、简短规格或行动短语。

【人物与摄影质感】
角色明确为成年人：【${character}】。人物干净、锐利、真实，身份与服装前后一致；肤色均匀，毛孔细腻，皮肤为自然哑光到缎面质感。使用${lighting || "柔和而有方向性的商业摄影光"}，让面部、手部、握持关系和前景物体都足够清晰。保留真实皮肤纹理，不要油腻高光、斑驳肤色、蜡像脸、塑料感或 CGI 皮肤。

【禁止项】
不要重复或漂浮的物体；不要断开的肢体、额外手指、错误握持、扭曲解剖；不要让人物与前景物体分离；不要让近大远小变成物体自身畸变；不要过度装饰、密集贴纸、无意义文字、复杂 UI、边框、底栏或脚部护带；不要油腻、斑驳、过度磨皮或 CGI 化的人物皮肤。

【最终验收】
第一眼看到【${keyword}】的鲜明色彩和【${prop}】冲向镜头的戏剧张力；第二眼能沿着“身体 → 手臂 → 手 → 物体”确认动作完全连贯；第三眼能读到最少量的品牌 / 事件信息。最终效果大胆、全出血、色彩鲜明、摄影真实、动作可信，适合编辑宣传与社交媒体发布。${extra ? `\n\n【额外补充】${extra}` : ""}`;
  }

  window.IMAGE_TEMPLATES = {
    "brand-packaging": {
      label: "品牌包装",
      size: "1024x1536", // 4:5 竖版
      fields: [
        { name: "brandName", label: "品牌名", type: "text", required: true, placeholder: "朝绪屋 / 小茶叙" },
        { name: "category", label: "类目", type: "select", options: PACKAGING_CATEGORIES, default: "food" },
        { name: "colorDirection", label: "配色", type: "select", options: PACKAGING_COLORS, default: "auto", dimWhenReference: true },
        { name: "extra", label: "补充", type: "textarea", optional: true, placeholder: "可留空。例：走日系极简、加一个礼盒" },
      ],
      defaults: { brandName: "", category: "food", colorDirection: "auto", extra: "" },
      build: buildPackagingPrompt,
    },

    "dining-standee": {
      label: "餐饮立牌",
      size: "1024x1536", // 3:4 竖版
      fields: [
        { name: "brandName", label: "品牌名", type: "text", required: true, placeholder: "巷口小面 / 阿香烧烤" },
        { name: "mainTitle", label: "主标题", type: "text", required: true, placeholder: "招牌新品上市" },
        { name: "mainProduct", label: "主推产品", type: "text", required: true, placeholder: "麻辣牛肉拌面" },
        { name: "theme", label: "主题", type: "select", options: DINING_THEMES, default: "auto", optional: true },
        { name: "subTitle", label: "副标题", type: "text", optional: true, placeholder: "可留空" },
        { name: "sideProducts", label: "辅助产品", type: "text", optional: true, placeholder: "顿号分隔，最多 4 个" },
        { name: "sellingPoints", label: "卖点", type: "textarea", optional: true, placeholder: "每行一个或逗号分隔，最多 6 个" },
        { name: "promo", label: "促销", type: "text", optional: true, placeholder: "最多 3 条，可留空" },
        { name: "auxPhrases", label: "辅助短句", type: "text", optional: true, placeholder: "最多 3 条" },
        { name: "mainColor", label: "主色", type: "text", optional: true, placeholder: "留空自动" },
        { name: "assistColor", label: "辅助色", type: "text", optional: true, placeholder: "留空自动" },
        { name: "accentColor", label: "点缀色", type: "text", optional: true, placeholder: "留空自动" },
      ],
      defaults: { brandName: "", mainTitle: "", mainProduct: "", theme: "auto" },
      build: buildDiningStandeePrompt,
    },

    "booth-3d": {
      label: "品牌展台",
      size: "1536x1024", // 4:3 横版
      fields: [
        { name: "brandName", label: "品牌名", type: "text", required: true, placeholder: "香奈儿 / 问界AITO" },
        { name: "industry", label: "行业", type: "text", required: true, placeholder: "奢侈品 / 新能源汽车" },
        { name: "extra", label: "补充", type: "textarea", optional: true, placeholder: "可留空。例：偏科技蓝、加互动演示区" },
      ],
      defaults: { brandName: "", industry: "" },
      build: buildBoothPrompt,
    },

    "booth-dualview": {
      label: "展位双视角",
      size: "1024x1536", // 3:4 竖版长图
      fields: [
        { name: "brandName", label: "品牌名", type: "text", required: true, placeholder: "品牌名" },
        { name: "industry", label: "主题行业", type: "text", required: true, placeholder: "美妆 / 数码 / 母婴" },
        { name: "productSeries", label: "产品系列", type: "text", required: true, placeholder: "夏季限定系列" },
        { name: "brandPosition", label: "品牌定位", type: "text", optional: true, placeholder: "留空自动推断" },
        { name: "brandKeywords", label: "关键词", type: "text", optional: true, placeholder: "3-6 个，留空自动" },
        { name: "spaceStyle", label: "空间风格", type: "text", optional: true, placeholder: "科技极简 / 轻奢零售…" },
        { name: "materials", label: "主要材质", type: "text", optional: true, placeholder: "烤漆板 / 亚克力 / 玻璃…" },
        { name: "slogan", label: "Slogan", type: "text", optional: true, placeholder: "可留空" },
        { name: "mainColor", label: "主色", type: "text", optional: true, placeholder: "留空自动" },
        { name: "assistColor", label: "辅助色", type: "text", optional: true, placeholder: "留空自动" },
        { name: "accentColor", label: "点缀色", type: "text", optional: true, placeholder: "留空自动" },
      ],
      defaults: { brandName: "", industry: "", productSeries: "" },
      build: buildBoothDualViewPrompt,
    },

    "forced-perspective-poster": {
      label: "强迫透视海报",
      size: "1024x1536", // 2:3 竖版
      referenceHint: "参考图 ○（可接人物、服装、品牌视觉或道具图）",
      referenceActiveHint: "已接参考图 → 按任务匹配人物身份、服装、品牌视觉或道具结构",
      fields: [
        { name: "theme", label: "主题", type: "text", required: true, placeholder: "汽车 / 旅游 / 体育 / 城市 / 摄影" },
        { name: "brandEvent", label: "品牌 / 事件", type: "text", required: true, placeholder: "品牌名、赛事名或活动名" },
        { name: "keyword", label: "主要词", type: "text", required: true, placeholder: "一个短词，如 DRIVE / 出发" },
        { name: "character", label: "成人角色", type: "textarea", required: true, placeholder: "角色身份、服装、神态与氛围" },
        { name: "prop", label: "互动物品", type: "text", required: true, placeholder: "方向盘 / 行李箱 / 杠铃 / 手机 / 相机" },
        { name: "action", label: "自然动作", type: "text", required: true, placeholder: "握住并转动 / 拉着快走 / 双手举起" },
        { name: "typeColor", label: "字体颜色", type: "text", required: true, placeholder: "酸性青柠 / 橙色 / 朱砂红 / 紫罗兰 / 青色" },
        { name: "environment", label: "环境", type: "text", required: true, placeholder: "汽车内饰 / 健身房 / 地铁 / 城市街道" },
        { name: "supportInfo", label: "支持信息", type: "textarea", optional: true, placeholder: "日期、地点、类别、短规格或行动短语；不填则不自动补写" },
        { name: "lighting", label: "光线", type: "text", optional: true, placeholder: "可留空，默认柔和定向商业摄影光" },
        { name: "extra", label: "补充", type: "textarea", optional: true, placeholder: "可留空。例：低机位、雨后路面、品牌色只占 15%" },
      ],
      defaults: {
        theme: "",
        brandEvent: "",
        keyword: "",
        character: "",
        prop: "",
        action: "",
        typeColor: "酸性青柠",
        environment: "",
        supportInfo: "",
        lighting: "",
        extra: "",
      },
      build: buildForcedPerspectivePosterPrompt,
    },

    "light-poster": {
      label: "轻盈海报",
      size: "1024x1536", // 3:4 竖版
      fields: [
        { name: "brandName", label: "品牌名", type: "text", required: true, placeholder: "小满茶事" },
        { name: "productName", label: "产品名", type: "text", required: true, placeholder: "青柠茉莉冰茶" },
        { name: "mainTitle", label: "主标题", type: "text", required: true, placeholder: "夏日轻盈上新" },
        { name: "productType", label: "产品类型", type: "select", options: LIGHT_PRODUCT_TYPES, default: "auto", optional: true },
        { name: "theme", label: "主题", type: "text", optional: true, placeholder: "初夏清爽 / 夏季限定…" },
        { name: "subTitle", label: "副标题", type: "text", optional: true, placeholder: "可留空" },
        { name: "auxPhrases", label: "辅助短句", type: "textarea", optional: true, placeholder: "2-4 条，顿号/逗号/换行分隔" },
        { name: "mainColor", label: "主色", type: "text", optional: true, placeholder: "留空自动" },
        { name: "assistColor", label: "辅助色", type: "text", optional: true, placeholder: "留空自动" },
        { name: "brandEn", label: "品牌英文名", type: "text", optional: true, placeholder: "可留空" },
        { name: "logoDir", label: "Logo方向", type: "text", optional: true, placeholder: "可留空" },
        { name: "brandVibe", label: "品牌气质", type: "text", optional: true, placeholder: "可留空" },
      ],
      defaults: { brandName: "", productName: "", mainTitle: "", productType: "auto" },
      build: buildLightPosterPrompt,
    },

    "science-booklet": {
      label: "科普绘本",
      size: "1536x1024", // 4:3 横版
      fields: [
        { name: "topic", label: "主题", type: "text", required: true, placeholder: "发射场的一天 / 一个集装箱的旅行" },
        { name: "mainColor", label: "主色调", type: "text", optional: true, placeholder: "留空自动" },
        { name: "styleDir", label: "风格方向", type: "text", optional: true, placeholder: "留空走标准儿童科普风" },
      ],
      defaults: { topic: "", mainColor: "", styleDir: "" },
      build: buildSciencePicturebookPrompt,
    },
  };
})();
