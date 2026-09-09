// model-preview.js —— three.js 的 ESM 封装。
//
// 这是整个前端【唯一】碰 three.js 的文件。app.js 是普通 <script>（非 ESM），
// 无法直接 import，所以这里把 three 关进一个 module，再把控制器接口挂到
// window.Model3D 上给 app.js 调用。three 与 addon 经 index.html 的 importmap
// 指向本地 public/vendor/three/（离线可用，不依赖 CDN）。
//
// 能力：
// - 载入 glb/gltf/obj/fbx/stl 模型，OrbitControls 取景。
// - 双相机：shotCamera（取景，决定截图）+ freeCamera（自由观察，不影响取景）。
// - 场景搭建：基础几何体 + 可增删灯光（平行/点/聚光），统一 TransformControls gizmo
//   做 DCC 式选中/移动/旋转/缩放，世界/本地坐标。模型本身也可选中变换。
// - IBL 环境光（RoomEnvironment）+ 模型材质通道调节（金属度/粗糙度/反射/自发光/基础色）。
// - 5 种渲染风格（原始材质/素模/法线/深度/线框）——逐网格换材质实现，不污染 gizmo/灯标/取景框。
// - 取景比例黑边遮罩 + 按比例裁剪截图（遮罩在 app 侧 DOM，截图裁剪在 capture）。
//
// 约束：app.js 的 render() 每次 world.innerHTML="" 全量重建节点 DOM，所以 live
// canvas 绝不能挂在节点里。3D 编辑器是 world 之外的独立浮层。

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const DEFAULT_HDR_URL = "vendor/hdr/studio_1k.hdr";

const loaderCache = new Map();
async function getLoader(format) {
  if (loaderCache.has(format)) return loaderCache.get(format);
  let ctor;
  if (format === "glb" || format === "gltf") {
    ({ GLTFLoader: ctor } = await import("three/addons/loaders/GLTFLoader.js"));
  } else if (format === "obj") {
    ({ OBJLoader: ctor } = await import("three/addons/loaders/OBJLoader.js"));
  } else if (format === "fbx") {
    ({ FBXLoader: ctor } = await import("three/addons/loaders/FBXLoader.js"));
  } else if (format === "stl") {
    ({ STLLoader: ctor } = await import("three/addons/loaders/STLLoader.js"));
  } else {
    throw new Error(`不支持的模型格式：${format}`);
  }
  loaderCache.set(format, ctor);
  return ctor;
}

async function parseModel(format, arrayBuffer) {
  const Ctor = await getLoader(format);
  const loader = new Ctor();
  if (format === "glb" || format === "gltf") {
    return await new Promise((resolve, reject) => {
      try {
        loader.parse(arrayBuffer, "", (gltf) => resolve(gltf.scene || gltf.scenes?.[0]), reject);
      } catch (err) {
        reject(err);
      }
    });
  }
  if (format === "obj") {
    return loader.parse(new TextDecoder().decode(arrayBuffer));
  }
  if (format === "fbx") {
    return loader.parse(arrayBuffer, "");
  }
  if (format === "stl") {
    const geometry = loader.parse(arrayBuffer);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.85, metalness: 0.05 }));
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  }
  throw new Error(`不支持的模型格式：${format}`);
}

function makeModeMaterial(mode) {
  if (mode === "clay") return new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.95, metalness: 0.0 });
  if (mode === "normal") return new THREE.MeshNormalMaterial();
  if (mode === "depth") return new THREE.MeshDepthMaterial();
  if (mode === "wireframe") return new THREE.MeshBasicMaterial({ color: 0x1b1b1b, wireframe: true });
  return null;
}

function makePrimitiveGeometry(kind, u) {
  if (kind === "actor" || kind === "seatedActor") {
    // 单一几何体保留原有零件的选中、复制、颜色与持久化协议；脚底为原点。
    const seated = kind === "seatedActor";
    const pieces = [];
    const part = (geo, x, y, z, rz = 0, rx = 0) => {
      geo.rotateZ(rz); geo.rotateX(rx); geo.translate(x, y, z);
      pieces.push(geo.toNonIndexed()); geo.dispose();
    };
    const hip = seated ? 0.52 : 0.92;
    part(new THREE.SphereGeometry(0.15, 20, 12), 0, hip + 0.69, 0);
    part(new THREE.CylinderGeometry(0.17, 0.13, 0.48, 16), 0, hip + 0.3, 0);
    part(new THREE.SphereGeometry(0.15, 16, 10), 0, hip, 0);
    for (const side of [-1, 1]) {
      part(new THREE.CylinderGeometry(0.055, 0.045, 0.53, 12), side * 0.23, hip + 0.24, 0, side * 0.12);
      if (seated) {
        part(new THREE.CylinderGeometry(0.08, 0.065, 0.42, 12), side * 0.1, hip, 0.21, 0, Math.PI / 2);
        part(new THREE.CylinderGeometry(0.065, 0.045, 0.43, 12), side * 0.1, 0.28, 0.42);
      } else {
        part(new THREE.CylinderGeometry(0.08, 0.045, 0.8, 12), side * 0.11, 0.47, 0);
      }
      part(new THREE.BoxGeometry(0.12, 0.09, 0.25), side * 0.11, 0.045, seated ? 0.47 : 0.06);
    }
    const geometry = mergeGeometries(pieces);
    pieces.forEach((geo) => geo.dispose());
    geometry.scale(u, u, u);
    return geometry;
  }
  if (kind === "box") return new THREE.BoxGeometry(u, u, u);
  if (kind === "sphere") return new THREE.SphereGeometry(u * 0.6, 32, 16);
  if (kind === "cone") return new THREE.ConeGeometry(u * 0.5, u, 32);
  if (kind === "cylinder") return new THREE.CylinderGeometry(u * 0.4, u * 0.4, u, 32);
  if (kind === "plane") return new THREE.PlaneGeometry(u * 3, u * 3);
  if (kind === "torus") return new THREE.TorusGeometry(u * 0.5, u * 0.16, 16, 48);
  return new THREE.BoxGeometry(u, u, u);
}

const PRIMITIVE_KINDS = ["box", "sphere", "cone", "cylinder", "plane", "torus", "actor", "seatedActor"];
const LIGHT_KINDS = ["directional", "point", "spot"];
const MATERIAL_CHANNELS = ["metalness", "roughness", "envMapIntensity", "emissiveIntensity", "color"];

function mount(container, opts = {}) {
  const width = container.clientWidth || 640;
  const height = container.clientHeight || 480;
  const onSelectionChange = typeof opts.onSelectionChange === "function" ? opts.onSelectionChange : null;

  const scene = new THREE.Scene();
  let bgColor = opts.background === undefined ? 0xf0f1f5 : opts.background;
  scene.background = bgColor === null ? null : new THREE.Color(bgColor);

  const aspect = width / height;
  const shotCamera = new THREE.PerspectiveCamera(35, aspect, 0.01, 5000);
  shotCamera.position.set(2.4, 1.8, 3.2);
  const freeCamera = new THREE.PerspectiveCamera(50, aspect, 0.01, 5000);
  freeCamera.position.set(3.2, 2.4, 4.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";

  // IBL：先用 RoomEnvironment 兜底（HDR 加载前不发黑），随后异步换成默认 HDR。
  const pmrem = new THREE.PMREMGenerator(renderer);
  let roomRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  let hdrTex = null;
  let hdrEnvRT = null;
  let envIntensity = 1.0;
  let envBackground = false;
  scene.environment = roomRT.texture;
  if ("environmentIntensity" in scene) scene.environmentIntensity = envIntensity;
  new RGBELoader().load(
    opts.hdrUrl || DEFAULT_HDR_URL,
    (tex) => {
      if (disposed) { tex.dispose(); return; }
      tex.mapping = THREE.EquirectangularReflectionMapping;
      hdrTex = tex;
      hdrEnvRT = pmrem.fromEquirectangular(tex);
      scene.environment = hdrEnvRT.texture;
      if (envBackground) scene.background = hdrTex;
      if (roomRT) { roomRT.dispose(); roomRT = null; }
    },
    undefined,
    () => { /* HDR 加载失败：保留 RoomEnvironment 兜底 */ },
  );

  // 基础灯光（不可选/不可删，作底；用户可在其上加可控灯）。
  // 基础灯压低，让 IBL + 用户灯主导（用户灯效果才明显）。
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 0.35);
  scene.add(hemi);
  const baseDir = new THREE.DirectionalLight(0xffffff, 0.7);
  baseDir.position.set(3, 5, 4);
  baseDir.castShadow = true;
  scene.add(baseDir);
  const baseDir2 = new THREE.DirectionalLight(0xffffff, 0.2);
  baseDir2.position.set(-4, 2, -3);
  scene.add(baseDir2);

  // 视角
  let viewMode = "shot";
  const shotTarget = new THREE.Vector3(0, 0, 0);
  const freeTarget = new THREE.Vector3(0, 0, 0);

  const controls = new OrbitControls(shotCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.keyPanSpeed = 14;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.style.outline = "none";
  controls.listenToKeyEvents(renderer.domElement);

  // 取景框（自由视角下显示），独立 overlayScene 渲染。
  const overlayScene = new THREE.Scene();
  const camHelper = new THREE.CameraHelper(shotCamera);
  overlayScene.add(camHelper);
  // C4D 式取景相机裁剪：以对焦点为中心，前景范围(near)/背景范围(far) 可调，
  // 取景框视锥被 far 限制（解决无限长）。对焦平面在自由视角显示一个矩形标记。
  let clipEnabled = false; // 对焦/前后景裁剪开关，默认关
  let focusDist = 5;
  let frontRange = 2;
  let backRange = 6;
  const focusPlane = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
    new THREE.LineBasicMaterial({ color: 0xff9933 }),
  );
  overlayScene.add(focusPlane);

  const primitivesGroup = new THREE.Group();
  scene.add(primitivesGroup);
  const lightsGroup = new THREE.Group();
  scene.add(lightsGroup);

  // gizmo
  const gizmo = new TransformControls(shotCamera, renderer.domElement);
  gizmo.setSize(0.9);
  const gizmoHelper = gizmo.getHelper();
  scene.add(gizmoHelper);
  let draggingGizmo = false;
  gizmo.addEventListener("dragging-changed", (e) => {
    draggingGizmo = e.value;
    controls.enabled = !e.value;
  });
  const notifySceneChange = () => { if (typeof opts.onChange === "function") opts.onChange(); };
  gizmo.addEventListener("mouseUp", notifySceneChange);
  controls.addEventListener("end", notifySceneChange);

  let modelRoot = null;
  let modelMaxSize = 0;
  let renderMode = opts.renderMode || "clay";
  let selected = null;
  let clipboard = null; // 复制粘贴用
  const materialOverride = {};

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const activeCamera = () => (viewMode === "shot" ? shotCamera : freeCamera);
  const sceneUnit = () => (opts.director ? 1 : modelMaxSize > 0 ? modelMaxSize * 0.25 : 1);

  // 地面网格
  let grid = null;
  let groundY = 0;
  let showGrid = false;
  function buildGrid() {
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    const span = (modelMaxSize > 0 ? modelMaxSize : 2) * 3;
    grid = new THREE.GridHelper(span, 20, 0x9aa0aa, 0xd6dae2);
    grid.position.y = groundY;
    grid.visible = showGrid;
    scene.add(grid);
  }
  buildGrid();

  // ---- 投影（阴影）----
  // 不自动加“默认地面”——投影落在模型自身和用户添加的平面零件上（DCC 习惯）。
  let shadowOn = true;
  function configureLightShadow(light, kind) {
    const u = modelMaxSize > 0 ? modelMaxSize : 2;
    if (kind === "directional") {
      const d = u * 1.6;
      light.shadow.mapSize.set(2048, 2048);
      const cam = light.shadow.camera;
      cam.left = -d; cam.right = d; cam.top = d; cam.bottom = -d;
      cam.near = 0.05; cam.far = u * 10;
      cam.updateProjectionMatrix();
      light.shadow.bias = -0.0006;
      light.shadow.normalBias = u * 0.01;
    } else if (kind === "spot") {
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.camera.near = u * 0.05;
      light.shadow.camera.far = u * 12;
      light.shadow.bias = -0.0006;
    } else {
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.camera.near = u * 0.05;
      light.shadow.camera.far = u * 12;
      light.shadow.bias = -0.0015;
    }
  }
  configureLightShadow(baseDir, "directional");

  // ---- 后处理：GTAO 屏幕空间 AO（默认关；半径=AO 宽度，可调）----
  let aoOn = false;
  let aoRadius = 0.5; // 归一化 0..1，乘模型尺寸得世界半径
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, shotCamera);
  const gtaoPass = new GTAOPass(scene, shotCamera, width, height);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(gtaoPass);
  composer.addPass(outputPass);
  function applyAoParams() {
    const u = modelMaxSize > 0 ? modelMaxSize : 2;
    gtaoPass.updateGtaoMaterial({ radius: Math.max(0.01, aoRadius * u * 0.5), distanceExponent: 1, thickness: u * 0.5, scale: 1, samples: 16 });
  }
  applyAoParams();

  // ---- 渲染风格：逐网格换材质（只动模型 + 零件）----
  const modeMaterials = {};
  function modeMaterial(mode) {
    if (!modeMaterials[mode]) modeMaterials[mode] = makeModeMaterial(mode);
    return modeMaterials[mode];
  }
  function registerSrcMaterials(root) {
    root.traverse((m) => { if (m.isMesh && m.userData.srcMat === undefined) m.userData.srcMat = m.material; });
  }
  function eachEditableMesh(cb) {
    if (modelRoot) modelRoot.traverse((m) => m.isMesh && cb(m));
    primitivesGroup.traverse((m) => m.isMesh && cb(m));
  }
  function applyModeToMesh(mesh, mode) {
    mesh.material = mode === "material" ? mesh.userData.srcMat : modeMaterial(mode);
  }
  function applyRenderMode(mode) {
    eachEditableMesh((m) => applyModeToMesh(m, mode));
  }

  // ---- 材质通道（只作用于模型的标准材质，原始材质模式下可见）----
  function modelStandardMaterials() {
    const set = new Set();
    if (modelRoot) {
      modelRoot.traverse((m) => {
        if (!m.isMesh) return;
        const arr = Array.isArray(m.userData.srcMat) ? m.userData.srcMat : [m.userData.srcMat];
        arr.forEach((x) => { if (x && x.isMeshStandardMaterial) set.add(x); });
      });
    }
    return [...set];
  }
  function applyMaterialChannel(ch, val) {
    modelStandardMaterials().forEach((m) => {
      if (ch === "metalness") m.metalness = Number(val);
      else if (ch === "roughness") m.roughness = Number(val);
      else if (ch === "envMapIntensity") m.envMapIntensity = Number(val);
      else if (ch === "emissiveIntensity") m.emissiveIntensity = Number(val);
      else if (ch === "color") m.color.set(val);
      m.needsUpdate = true;
    });
  }
  function readModelChannels() {
    const mats = modelStandardMaterials();
    if (!mats.length) return null;
    const m = mats[0];
    return {
      metalness: m.metalness,
      roughness: m.roughness,
      envMapIntensity: m.envMapIntensity ?? 1,
      emissiveIntensity: m.emissiveIntensity ?? 1,
      color: `#${m.color.getHexString()}`,
    };
  }

  // ---- 选中 / gizmo ----
  function topSelectable(obj) {
    let o = obj;
    while (o.parent) {
      if (o.parent === primitivesGroup) return o;
      if (o.parent === lightsGroup) return o;
      if (o === modelRoot) return modelRoot;
      o = o.parent;
    }
    return null;
  }
  function selectionInfo() {
    if (!selected) return { kind: null };
    if (selected === modelRoot) return { kind: "model", channels: readModelChannels() };
    if (selected.parent === lightsGroup) {
      const light = selected.userData.light;
      return { kind: "light", lightType: selected.userData.lightType, intensity: light.intensity, color: `#${light.color.getHexString()}` };
    }
    if (selected.parent === primitivesGroup) return { kind: "primitive", primKind: selected.userData.primKind, color: `#${selected.userData.srcMat.color.getHexString()}` };
    return { kind: null };
  }
  function emitSelection() {
    if (onSelectionChange) onSelectionChange(selectionInfo());
  }
  function selectObject(obj) {
    if (!obj) return;
    selected = obj;
    gizmo.attach(obj);
    emitSelection();
  }
  function deselect() {
    selected = null;
    gizmo.detach();
    emitSelection();
  }

  let pickX = 0;
  let pickY = 0;
  let pickOnGizmo = false;
  function onPointerDownPick(e) {
    pickX = e.clientX;
    pickY = e.clientY;
    pickOnGizmo = Boolean(gizmo.axis);
  }
  function onPointerUpPick(e) {
    if (pickOnGizmo || draggingGizmo) return;
    if (Math.hypot(e.clientX - pickX, e.clientY - pickY) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, activeCamera());
    const targets = [...primitivesGroup.children, ...lightsGroup.children];
    if (modelRoot) targets.push(modelRoot);
    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length) selectObject(topSelectable(hits[0].object));
    else deselect();
  }
  renderer.domElement.addEventListener("pointerdown", onPointerDownPick);
  renderer.domElement.addEventListener("pointerup", onPointerUpPick);

  let disposed = false;
  let running = true;
  function tick() {
    if (disposed || !running) return;
    controls.update();
    if (lightsGroup.children.length) {
      scene.updateMatrixWorld(); // 让灯外形 helper 拿到当前灯位/朝向
      lightsGroup.children.forEach((r) => { const h = r.userData.helper; if (h && h.visible) h.update(); });
    }
    const cam = activeCamera();
    if (aoOn) {
      renderPass.camera = cam;
      gtaoPass.camera = cam;
      composer.render();
    } else {
      renderer.render(scene, cam);
    }
    if (viewMode === "free") {
      shotCamera.updateMatrixWorld(true);
      camHelper.update();
      if (focusPlane.visible) updateFocusPlane();
      renderer.autoClear = false;
      renderer.render(overlayScene, cam);
      renderer.autoClear = true;
    }
  }
  renderer.setAnimationLoop(tick);

  function updateFocusPlane() {
    shotCamera.updateMatrixWorld(true);
    const h = 2 * Math.tan(((shotCamera.fov * Math.PI) / 180) / 2) * focusDist;
    const w = h * shotCamera.aspect;
    const dir = new THREE.Vector3();
    shotCamera.getWorldDirection(dir);
    focusPlane.position.copy(shotCamera.position).add(dir.multiplyScalar(focusDist));
    focusPlane.quaternion.copy(shotCamera.quaternion);
    focusPlane.scale.set(w || 0.01, h || 0.01, 1);
  }
  function applyShotClip() {
    if (clipEnabled) {
      shotCamera.near = Math.max(focusDist - frontRange, 0.01);
      shotCamera.far = Math.max(shotCamera.near + 0.02, focusDist + backRange);
      focusPlane.visible = true;
    } else {
      // 关闭：宽松 near/far，不裁、不显示对焦平面。
      const u = modelMaxSize > 0 ? modelMaxSize : 2;
      shotCamera.near = Math.max(u * 0.01, 0.01);
      shotCamera.far = u * 200;
      focusPlane.visible = false;
    }
    shotCamera.updateProjectionMatrix();
    shotCamera.updateMatrixWorld(true);
    camHelper.update();
    if (focusPlane.visible) updateFocusPlane();
  }

  function frameModel(cam, targetVec, fitOffset = 1.35) {
    const target = modelRoot || primitivesGroup;
    target.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(target);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z) || 1;
    const fitHeightDistance = maxSize / (2 * Math.atan((Math.PI * cam.fov) / 360));
    const fitWidthDistance = fitHeightDistance / cam.aspect;
    const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);
    if (cam === freeCamera) {
      // 自由相机只观察：near/far 放宽，拉远不裁。
      cam.near = Math.max(maxSize * 0.01, 0.01);
      cam.far = maxSize * 1000;
      cam.updateProjectionMatrix();
    }
    const direction = new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(distance);
    targetVec.copy(center);
    cam.position.copy(center).add(direction);
    if (cam === shotCamera) {
      // 取景相机：对焦点默认落在模型中心(≈distance)，给默认前/后景范围，再算 near/far。
      focusDist = distance;
      frontRange = maxSize * 0.9;
      backRange = maxSize * 2.5;
      applyShotClip();
    }
    if (cam === activeCamera()) { controls.target.copy(targetVec); controls.update(); }
  }

  function disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      mats.forEach((m) => {
        for (const key in m) { const v = m[key]; if (v && v.isTexture) v.dispose(); }
        if (m && m.dispose) m.dispose();
      });
    });
  }

  function syncActiveTargetBack() {
    (viewMode === "shot" ? shotTarget : freeTarget).copy(controls.target);
  }

  function createPrimitiveMesh(kind) {
    const u = sceneUnit();
    const geo = makePrimitiveGeometry(kind, u);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xbcbcc4, roughness: 0.85, metalness: 0.05,
      side: kind === "plane" ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.srcMat = mat;
    mesh.userData.primKind = kind;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (kind === "plane") {
      mesh.rotation.x = -Math.PI / 2; // 水平
      mesh.position.y = groundY; // 默认落到模型脚下当地面，才能接到投影
    }
    return mesh;
  }
  function clearPrimitives() {
    if (selected && selected.parent === primitivesGroup) deselect();
    [...primitivesGroup.children].forEach((m) => { primitivesGroup.remove(m); disposeObject(m); });
  }

  // ---- 灯光 ----
  function createLightRig(kind) {
    const u = sceneUnit();
    const rig = new THREE.Group();
    rig.userData.isLight = true;
    rig.userData.lightType = kind;
    let light;
    if (kind === "point") light = new THREE.PointLight(0xffffff, 3, 0, 0);
    else if (kind === "spot") light = new THREE.SpotLight(0xffffff, 4, u * 8, Math.PI / 6, 0.35, 0);
    else light = new THREE.DirectionalLight(0xffffff, 2);
    light.castShadow = true;
    configureLightShadow(light, kind);
    rig.add(light);
    // 平行光/聚光：目标固定在世界原点（模型中心），移动灯位即自动对准模型。
    if (kind !== "point") {
      light.target.position.set(0, 0, 0);
      scene.add(light.target);
      rig.userData.target = light.target;
    }
    // 可拾取的灯标（不进截图，不受渲染模式影响）。
    const icon = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(u * 0.1, 0.04), 16, 12),
      new THREE.MeshBasicMaterial({ color: light.color.clone() }),
    );
    icon.userData.lightIcon = true;
    rig.add(icon);
    rig.userData.light = light;
    rig.userData.icon = icon;
    rig.position.set(u * 1.6, u * 2.0, u * 1.6);
    // 按类型的可见外形：锥(聚光)/方向线(平行光)/圆球线(点光)。helper 用 light 世界矩阵，
    // 必须挂在 scene 顶层（不能进 rig，否则变换会叠加）；每帧 update，截图时隐藏。
    let helper;
    if (kind === "spot") helper = new THREE.SpotLightHelper(light);
    else if (kind === "directional") helper = new THREE.DirectionalLightHelper(light, Math.max(u * 0.6, 0.2));
    else helper = new THREE.PointLightHelper(light, Math.max(u * 0.25, 0.1));
    helper.userData.lightIcon = true;
    scene.add(helper);
    rig.userData.helper = helper;
    return rig;
  }
  function disposeLightRig(rig) {
    if (rig.userData.target) scene.remove(rig.userData.target);
    if (rig.userData.helper) { scene.remove(rig.userData.helper); rig.userData.helper.dispose(); }
    rig.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
  }
  function clearLights() {
    if (selected && selected.parent === lightsGroup) deselect();
    [...lightsGroup.children].forEach((r) => { lightsGroup.remove(r); disposeLightRig(r); });
  }
  function setLightIconsVisible(v) {
    lightsGroup.traverse((o) => { if (o.userData.lightIcon) o.visible = v; });
    lightsGroup.children.forEach((r) => { if (r.userData.helper) r.userData.helper.visible = v; });
  }

  const controller = {
    async loadModel(blob, format) {
      const arrayBuffer = await blob.arrayBuffer();
      const root = await parseModel(String(format || "").toLowerCase(), arrayBuffer);
      if (!root) throw new Error("模型解析为空");
      if (disposed) { disposeObject(root); return false; }
      if (modelRoot) { scene.remove(modelRoot); disposeObject(modelRoot); }
      root.updateMatrixWorld(true);
      if (opts.director) {
        const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
        const extent = Math.max(size.x, size.y, size.z);
        if (extent > 0) root.scale.multiplyScalar(2 / extent);
        root.updateMatrixWorld(true);
      }
      const box0 = new THREE.Box3().setFromObject(root);
      let maxS = 1;
      if (!box0.isEmpty()) {
        const c0 = box0.getCenter(new THREE.Vector3());
        const s0 = box0.getSize(new THREE.Vector3());
        maxS = Math.max(s0.x, s0.y, s0.z) || 1;
        root.position.sub(opts.director ? new THREE.Vector3(c0.x, box0.min.y, c0.z) : c0);
        groundY = opts.director ? 0 : -s0.y / 2;
      }
      modelMaxSize = maxS;
      buildGrid();
      const pivot = new THREE.Group();
      pivot.add(root);
      modelRoot = pivot;
      scene.add(modelRoot);
      registerSrcMaterials(modelRoot);
      modelRoot.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      configureLightShadow(baseDir, "directional");
      applyAoParams();
      applyRenderMode(renderMode);
      frameModel(shotCamera, shotTarget, 1.35);
      frameModel(freeCamera, freeTarget, 2.0);
      controller.setViewMode("shot");
      shotCamera.updateMatrixWorld(true);
      camHelper.update();
      return true;
    },

    getViewMode() { return viewMode; },
    getShot() {
      syncActiveTargetBack();
      return { fov: shotCamera.fov, position: shotCamera.position.toArray(), target: shotTarget.toArray() };
    },
    setShot(shot) {
      if (!shot || ![shot.position, shot.target].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) return;
      // 先清掉 OrbitControls 的阻尼余量，避免程序运镜时叠加上一次鼠标拖动。
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      shotCamera.position.fromArray(shot.position);
      shotTarget.fromArray(shot.target);
      controller.setFov(shot.fov);
      shotCamera.lookAt(shotTarget);
      if (viewMode === "shot") { controls.target.copy(shotTarget); controls.update(); }
      controls.enableDamping = damping;
      shotCamera.updateMatrixWorld(true);
      camHelper.update();
    },
    setInteractionEnabled(on) { controls.enabled = Boolean(on); gizmo.enabled = Boolean(on); },
    setViewMode(mode) {
      const next = mode === "free" ? "free" : "shot";
      syncActiveTargetBack();
      viewMode = next;
      controls.object = activeCamera();
      controls.target.copy(viewMode === "shot" ? shotTarget : freeTarget);
      gizmo.camera = activeCamera();
      controls.update();
      return viewMode;
    },
    toggleViewMode() { return controller.setViewMode(viewMode === "shot" ? "free" : "shot"); },
    resetView() {
      if (viewMode === "shot") frameModel(shotCamera, shotTarget, 1.35);
      else frameModel(freeCamera, freeTarget, 2.0);
    },
    setPanMode(on) { controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE; },

    setRenderMode(mode) { renderMode = mode; applyRenderMode(mode); },
    getRenderMode() { return renderMode; },
    setBackground(color) { bgColor = color; if (!envBackground) scene.background = color === null ? null : new THREE.Color(color); },
    getBackground() { return typeof bgColor === "number" ? `#${bgColor.toString(16).padStart(6, "0")}` : bgColor; },

    setFov(deg) {
      shotCamera.fov = Math.max(5, Math.min(120, Number(deg) || shotCamera.fov));
      shotCamera.updateProjectionMatrix();
      shotCamera.updateMatrixWorld(true);
      camHelper.update();
      updateFocusPlane();
    },
    getFov() { return shotCamera.fov; },
    // C4D 式取景相机裁剪：对焦距离 + 前景(near)/背景(far)范围。
    getCameraClip() {
      return { enabled: clipEnabled, focus: focusDist, front: frontRange, back: backRange, unit: modelMaxSize > 0 ? modelMaxSize : 2 };
    },
    setCameraClip(p) {
      if (typeof p.focus === "number") focusDist = Math.max(0.02, p.focus);
      if (typeof p.front === "number") frontRange = Math.max(0, p.front);
      if (typeof p.back === "number") backRange = Math.max(0.02, p.back);
      applyShotClip();
    },
    setClipEnabled(on) { clipEnabled = Boolean(on); applyShotClip(); },
    getClipEnabled() { return clipEnabled; },

    // 几何零件
    addPrimitive(kind) {
      const k = PRIMITIVE_KINDS.includes(kind) ? kind : "box";
      const mesh = createPrimitiveMesh(k);
      primitivesGroup.add(mesh);
      applyModeToMesh(mesh, renderMode);
      selectObject(mesh);
      return mesh.uuid;
    },

    // 灯光
    addLight(kind) {
      const k = LIGHT_KINDS.includes(kind) ? kind : "directional";
      const rig = createLightRig(k);
      lightsGroup.add(rig);
      selectObject(rig);
      return rig.uuid;
    },
    setPrimitiveColor(hex) {
      if (!selected || selected.parent !== primitivesGroup) return;
      const mat = selected.userData.srcMat;
      if (mat && mat.color) { mat.color.set(hex); mat.needsUpdate = true; }
    },
    setLightParam(param, value) {
      if (!selected || selected.parent !== lightsGroup) return;
      const light = selected.userData.light;
      if (param === "intensity") light.intensity = Number(value);
      else if (param === "color") { light.color.set(value); selected.userData.icon.material.color.set(value); }
    },

    // 选中
    deleteSelected() {
      if (!selected || selected === modelRoot) return false;
      const obj = selected;
      deselect();
      if (obj.parent === lightsGroup) { lightsGroup.remove(obj); disposeLightRig(obj); emitSelection(); notifySceneChange(); return true; }
      if (obj.parent === primitivesGroup) { primitivesGroup.remove(obj); disposeObject(obj); emitSelection(); notifySceneChange(); return true; }
      return false;
    },
    // 复制粘贴：模型不复制（只一个）。
    copySelected() {
      if (!selected) return false;
      const o = selected;
      const base = { position: o.position.toArray(), rotation: [o.rotation.x, o.rotation.y, o.rotation.z], scale: o.scale.toArray() };
      if (o.parent === primitivesGroup) {
        clipboard = { kind: "primitive", primKind: o.userData.primKind, color: `#${o.userData.srcMat.color.getHexString()}`, ...base };
        return true;
      }
      if (o.parent === lightsGroup) {
        clipboard = { kind: "light", lightType: o.userData.lightType, intensity: o.userData.light.intensity, color: `#${o.userData.light.color.getHexString()}`, ...base };
        return true;
      }
      return false;
    },
    pasteClipboard() {
      if (!clipboard) return false;
      const off = sceneUnit() * 0.4; // 偏移一点避免完全重叠
      if (clipboard.kind === "primitive") {
        const mesh = createPrimitiveMesh(clipboard.primKind);
        mesh.position.fromArray(clipboard.position);
        mesh.position.x += off; mesh.position.z += off;
        mesh.rotation.set(clipboard.rotation[0], clipboard.rotation[1], clipboard.rotation[2]);
        mesh.scale.fromArray(clipboard.scale);
        mesh.userData.srcMat.color.set(clipboard.color);
        primitivesGroup.add(mesh);
        applyModeToMesh(mesh, renderMode);
        selectObject(mesh);
        return true;
      }
      if (clipboard.kind === "light") {
        const rig = createLightRig(clipboard.lightType);
        rig.position.fromArray(clipboard.position);
        rig.position.x += off; rig.position.z += off;
        rig.rotation.set(clipboard.rotation[0], clipboard.rotation[1], clipboard.rotation[2]);
        rig.userData.light.intensity = clipboard.intensity;
        rig.userData.light.color.set(clipboard.color);
        rig.userData.icon.material.color.set(clipboard.color);
        lightsGroup.add(rig);
        selectObject(rig);
        return true;
      }
      return false;
    },
    hasSelection() { return Boolean(selected); },
    getSelectionInfo() { return selectionInfo(); },
    getSelectedTransform() {
      if (!selected) return null;
      return { name: selected.name, position: selected.position.toArray(), rotation: [selected.rotation.x, selected.rotation.y, selected.rotation.z].map(THREE.MathUtils.radToDeg), scale: selected.scale.toArray() };
    },
    setSelectedTransform(field, axis, value) {
      if (!selected || !["position", "rotation", "scale"].includes(field) || ![0, 1, 2].includes(axis) || !Number.isFinite(Number(value))) return;
      let v = Number(value);
      if (field === "rotation") v = THREE.MathUtils.degToRad(v);
      if (field === "scale") v = Math.max(0.01, Math.min(1000, v));
      selected[field][["x", "y", "z"][axis]] = v;
    },
    renameSelected(name, notify = true) { if (selected) { selected.name = String(name).slice(0, 80); if (notify) emitSelection(); } },
    // Outliner：列出场景所有可选对象（模型/零件/灯），带当前选中标记。
    getObjects() {
      const PRIM = { box: "立方体", sphere: "球体", cone: "圆锥", cylinder: "圆柱", plane: "平面", torus: "圆环", actor: "站姿角色", seatedActor: "坐姿角色" };
      const LIGHT = { directional: "平行光", point: "点光", spot: "聚光" };
      const out = [];
      if (modelRoot) out.push({ id: modelRoot.uuid, kind: "model", label: "模型" });
      const pc = {};
      primitivesGroup.children.forEach((m) => {
        const k = m.userData.primKind || "box";
        pc[k] = (pc[k] || 0) + 1;
        out.push({ id: m.uuid, kind: "primitive", label: m.name || `${PRIM[k] || k} ${pc[k]}` });
      });
      const lc = {};
      lightsGroup.children.forEach((r) => {
        const t = r.userData.lightType;
        lc[t] = (lc[t] || 0) + 1;
        out.push({ id: r.uuid, kind: "light", label: `${LIGHT[t] || t} ${lc[t]}` });
      });
      const selId = selected ? selected.uuid : null;
      return out.map((o) => ({ ...o, selected: o.id === selId }));
    },
    selectById(id) {
      if (modelRoot && modelRoot.uuid === id) { selectObject(modelRoot); return; }
      const p = primitivesGroup.children.find((o) => o.uuid === id);
      if (p) { selectObject(p); return; }
      const l = lightsGroup.children.find((o) => o.uuid === id);
      if (l) { selectObject(l); return; }
    },
    deselect,
    setGizmoMode(mode) { if (["translate", "rotate", "scale"].includes(mode)) gizmo.setMode(mode); },
    getGizmoMode() { return gizmo.mode; },
    setGizmoSpace(space) { gizmo.setSpace(space === "local" ? "local" : "world"); },
    getGizmoSpace() { return gizmo.space; },
    setGrid(on) { showGrid = Boolean(on); if (grid) grid.visible = showGrid; },
    getGrid() { return showGrid; },
    setShadow(on) {
      shadowOn = Boolean(on);
      renderer.shadowMap.enabled = shadowOn;
      // 切换 shadowMap.enabled 后需要让材质重编译。
      eachEditableMesh((m) => { if (m.material) m.material.needsUpdate = true; });
    },
    getShadow() { return shadowOn; },
    setAO(on) { aoOn = Boolean(on); },
    getAO() { return aoOn; },
    setAORadius(v) { aoRadius = Math.max(0, Math.min(1, Number(v))); applyAoParams(); },
    getAORadius() { return aoRadius; },
    setEnvIntensity(v) {
      envIntensity = Math.max(0, Number(v));
      if ("environmentIntensity" in scene) scene.environmentIntensity = envIntensity;
    },
    getEnvIntensity() { return envIntensity; },
    setEnvBackground(on) {
      envBackground = Boolean(on);
      scene.background = envBackground ? (hdrTex || scene.background) : (bgColor === null ? null : new THREE.Color(bgColor));
    },
    getEnvBackground() { return envBackground; },

    // 材质通道（模型级）
    setMaterialChannel(ch, val) {
      if (!MATERIAL_CHANNELS.includes(ch)) return;
      materialOverride[ch] = val;
      applyMaterialChannel(ch, val);
    },
    getModelChannels() { return readModelChannels(); },

    resize() {
      const w = container.clientWidth || width;
      const h = container.clientHeight || height;
      shotCamera.aspect = w / h;
      shotCamera.updateProjectionMatrix();
      freeCamera.aspect = w / h;
      freeCamera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      gtaoPass.setSize(w, h);
    },

    getState() {
      syncActiveTargetBack();
      return {
        renderMode,
        mode: viewMode,
        envIntensity,
        envBackground,
        shadow: shadowOn,
        ao: aoOn,
        aoRadius,
        background: typeof bgColor === "number" ? `#${bgColor.toString(16).padStart(6, "0")}` : bgColor,
        shot: { fov: shotCamera.fov, position: shotCamera.position.toArray(), target: shotTarget.toArray() },
        cameraClip: { enabled: clipEnabled, focus: focusDist, front: frontRange, back: backRange },
        model: modelRoot
          ? { position: modelRoot.position.toArray(), rotation: [modelRoot.rotation.x, modelRoot.rotation.y, modelRoot.rotation.z], scale: modelRoot.scale.toArray() }
          : null,
        materialOverride: { ...materialOverride },
        primitives: primitivesGroup.children.map((m) => ({
          kind: m.userData.primKind || "box",
          name: m.name,
          position: m.position.toArray(),
          rotation: [m.rotation.x, m.rotation.y, m.rotation.z],
          scale: m.scale.toArray(),
          color: `#${m.userData.srcMat.color.getHexString()}`,
        })),
        lights: lightsGroup.children.map((r) => ({
          type: r.userData.lightType,
          position: r.position.toArray(),
          rotation: [r.rotation.x, r.rotation.y, r.rotation.z],
          intensity: r.userData.light.intensity,
          color: `#${r.userData.light.color.getHexString()}`,
        })),
      };
    },
    setState(state) {
      if (!state) return;
      const shot = state.shot || (state.position ? { fov: state.fov, position: state.position, target: state.target } : null);
      if (shot) {
        if (typeof shot.fov === "number") shotCamera.fov = shot.fov;
        if (Array.isArray(shot.position)) shotCamera.position.fromArray(shot.position);
        if (Array.isArray(shot.target)) shotTarget.fromArray(shot.target);
        shotCamera.updateProjectionMatrix();
        shotCamera.updateMatrixWorld(true);
      }
      if (state.cameraClip) {
        if (typeof state.cameraClip.enabled === "boolean") clipEnabled = state.cameraClip.enabled;
        if (typeof state.cameraClip.focus === "number") focusDist = state.cameraClip.focus;
        if (typeof state.cameraClip.front === "number") frontRange = state.cameraClip.front;
        if (typeof state.cameraClip.back === "number") backRange = state.cameraClip.back;
        applyShotClip();
      }
      if (state.renderMode) renderMode = state.renderMode;
      if (state.background) controller.setBackground(state.background);
      if (typeof state.envIntensity === "number") controller.setEnvIntensity(state.envIntensity);
      if (typeof state.envBackground === "boolean") controller.setEnvBackground(state.envBackground);
      if (typeof state.shadow === "boolean") controller.setShadow(state.shadow);
      if (typeof state.aoRadius === "number") controller.setAORadius(state.aoRadius);
      if (typeof state.ao === "boolean") controller.setAO(state.ao);
      if (state.model && modelRoot) {
        if (Array.isArray(state.model.position)) modelRoot.position.fromArray(state.model.position);
        if (Array.isArray(state.model.rotation)) modelRoot.rotation.set(state.model.rotation[0], state.model.rotation[1], state.model.rotation[2]);
        if (Array.isArray(state.model.scale)) modelRoot.scale.fromArray(state.model.scale);
      }
      if (Array.isArray(state.primitives)) {
        clearPrimitives();
        state.primitives.forEach((p) => {
          const mesh = createPrimitiveMesh(p.kind);
          mesh.name = String(p.name || "").slice(0, 80);
          if (Array.isArray(p.position)) mesh.position.fromArray(p.position);
          if (Array.isArray(p.rotation)) mesh.rotation.set(p.rotation[0], p.rotation[1], p.rotation[2]);
          if (Array.isArray(p.scale)) mesh.scale.fromArray(p.scale);
          if (p.color) mesh.userData.srcMat.color.set(p.color);
          primitivesGroup.add(mesh);
        });
      }
      if (Array.isArray(state.lights)) {
        clearLights();
        state.lights.forEach((l) => {
          const rig = createLightRig(l.type);
          if (Array.isArray(l.position)) rig.position.fromArray(l.position);
          if (Array.isArray(l.rotation)) rig.rotation.set(l.rotation[0], l.rotation[1], l.rotation[2]);
          if (typeof l.intensity === "number") rig.userData.light.intensity = l.intensity;
          if (l.color) { rig.userData.light.color.set(l.color); rig.userData.icon.material.color.set(l.color); }
          lightsGroup.add(rig);
        });
      }
      applyRenderMode(renderMode);
      // 材质覆盖最后套用（模型已就位）。
      if (state.materialOverride) {
        Object.assign(materialOverride, state.materialOverride);
        Object.entries(materialOverride).forEach(([ch, val]) => applyMaterialChannel(ch, val));
      }
      if (viewMode === "shot") { controls.object = shotCamera; controls.target.copy(shotTarget); }
      shotCamera.lookAt(shotTarget);
      controls.update();
      camHelper.update();
    },

    capture(type = "image/png", ratio = null) {
      const gv = gizmoHelper.visible;
      const grv = grid ? grid.visible : false;
      gizmoHelper.visible = false;
      if (grid) grid.visible = false;
      setLightIconsVisible(false); // 灯标不进截图，但灯光效果保留
      shotCamera.aspect = (container.clientWidth || width) / (container.clientHeight || height);
      shotCamera.updateProjectionMatrix();
      if (aoOn) {
        renderPass.camera = shotCamera;
        gtaoPass.camera = shotCamera;
        composer.render();
      } else {
        renderer.render(scene, shotCamera);
      }
      const src = renderer.domElement;
      let url;
      const ar = Number(ratio) || 0;
      if (ar > 0) {
        const cw = src.width;
        const ch = src.height;
        let w;
        let h;
        if (cw / ch > ar) { h = ch; w = Math.round(ch * ar); } else { w = cw; h = Math.round(cw / ar); }
        const sx = Math.round((cw - w) / 2);
        const sy = Math.round((ch - h) / 2);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(src, sx, sy, w, h, 0, 0, w, h);
        url = c.toDataURL(type);
      } else {
        url = src.toDataURL(type);
      }
      gizmoHelper.visible = gv;
      if (grid) grid.visible = grv;
      setLightIconsVisible(true);
      return url;
    },

    dispose() {
      disposed = true;
      running = false;
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", onPointerDownPick);
      renderer.domElement.removeEventListener("pointerup", onPointerUpPick);
      gizmo.detach();
      gizmo.dispose();
      controls.dispose();
      camHelper.dispose();
      focusPlane.geometry.dispose();
      focusPlane.material.dispose();
      if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); grid = null; }
      clearPrimitives();
      clearLights();
      if (modelRoot) { scene.remove(modelRoot); disposeObject(modelRoot); modelRoot = null; }
      Object.values(modeMaterials).forEach((m) => m && m.dispose && m.dispose());
      if (gtaoPass.dispose) gtaoPass.dispose();
      composer.dispose();
      if (roomRT) roomRT.dispose();
      if (hdrEnvRT) hdrEnvRT.dispose();
      if (hdrTex) hdrTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      const gl = renderer.getContext();
      const lose = gl && gl.getExtension && gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    },
  };

  return controller;
}

window.Model3D = {
  available: true,
  supportedFormats: ["glb", "gltf", "obj", "fbx", "stl"],
  primitiveKinds: PRIMITIVE_KINDS,
  lightKinds: LIGHT_KINDS,
  mount,
};
