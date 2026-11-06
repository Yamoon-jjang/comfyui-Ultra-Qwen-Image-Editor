import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE = "UltraImageEditorPiD";
const CAP = {
  "Qwen Image Edit 2511": 3,
  "Qwen Image 2.1": 10,
};
const PID_DETAILS = ["pid_model", "pid_sampler", "pid_scheduler", "pid_steps", "pid_scale", "pid_color_match"];
const WIDGET_SCHEMA_VERSION = 1;
const WIDGET_SCHEMA_PROPERTY = "ultraEditorWidgetSchema";
const PROFILE_FIELDS = ["diffusion_model", "text_encoder", "vae_name", "steps", "cfg", "sampler_name", "scheduler", "zero_conditioning", "pid_upscale", "reuse_assets", ...PID_DETAILS];
const SUGGESTIONS = {
  "Qwen Image Edit 2511": { diffusion_model: /qwen.*edit|qedit|rapid.?aio/i, text_encoder: /qwen[_-]?2[._-]?5.*vl/i, vae_name: /(?:^|[\/])qwen[_-]?image[_-]?vae(?:$|[_.-])/i, steps: 20, cfg: 4, scheduler: "simple", zero_conditioning: false },
  "Qwen Image 2.1": { diffusion_model: /qwen.*(?:2[._-]?1|21)/i, text_encoder: /qwen.*3.*vl/i, vae_name: /qwen.*2[._-]?1.*vae/i, steps: 25, cfg: 1, scheduler: "simple", zero_conditioning: false },
};

const widget = (node, name) => (node.widgets || []).find(w => w.name === name);
const model = node => String(widget(node, "model_family")?.value || "Qwen Image Edit 2511");
const limit = node => CAP[model(node)] || 1;
const imageIndex = name => /^image([1-9]|10)$/.test(String(name || "")) ? Number(name.slice(5)) : 0;
const connected = node => (node.inputs || []).filter(s => imageIndex(s.name) && s.link != null).map(s => imageIndex(s.name)).sort((a,b) => a-b);
const slotByName = (node, name) => (node.inputs || []).find(s => s.name === name);
const options = w => {
  const v = w?.options?.values;
  return Array.isArray(v) ? v : typeof v === "function" ? (v() || []) : [];
};
function setValue(node, name, value) {
  const w = widget(node, name);
  if (!w || value === undefined) return;
  const vals = options(w);
  if (vals.length && !vals.includes(value)) return;
  w.value = value;
}
const REQUIRED_ASSET_FIELDS = ["diffusion_model", "text_encoder", "vae_name"];
const UNSELECTED_ASSET = "<select installed model>";
function basename(value) { return String(value || "").split(/[\\/]/).pop() || ""; }
function isKnownWrongModel(family, filename) {
  const name = basename(filename).toLowerCase();
  const is21 = /qwen(?:[_ .-]*image)?[_ .-]*(?:2[._-]?1|21)(?![0-9])/.test(name);
  const is2511 = /qwen.*(?:edit.*2511|2511.*edit)|qedit.*2511/.test(name);
  const foreign = /(?:^|[_ .-])(?:flux(?:1|2)?|sdxl|hunyuan|wan2?[._-]?\d*|z[_-]?image)(?:[_ .-]|$)/.test(name);
  const t2i2512 = /qwen[_ .-]*image[_ .-]*2512(?![0-9])/.test(name) && !name.includes("edit");
  return foreign || t2i2512 || (family === "Qwen Image Edit 2511" && is21)
    || (family === "Qwen Image 2.1" && is2511);
}
function familyAssetMatch(family, field, value) {
  const file = basename(value);
  if (!file || file === UNSELECTED_ASSET) return false;
  if (field === "diffusion_model") {
    const pattern = SUGGESTIONS[family]?.diffusion_model;
    return pattern?.test(file) && !isKnownWrongModel(family, file);
  }
  if (field === "text_encoder") {
    return SUGGESTIONS[family]?.text_encoder?.test(file);
  }
  if (field === "vae_name") {
    const candidate = SUGGESTIONS[family]?.vae_name?.test(file);
    return Boolean(candidate) && !(family === "Qwen Image Edit 2511"
      && /qwen.*(?:2[._-]?1|21).*vae/i.test(file));
  }
  return false;
}
function prepareSafeAssetPlaceholders(node) {
  // Keep the explicit "choose model" sentinel a valid combo option during
  // workflow configure, even if unrelated model files are installed.
  for (const field of REQUIRED_ASSET_FIELDS) {
    const w = widget(node, field);
    const values = w?.options?.values;
    if (Array.isArray(values) && !values.includes(UNSELECTED_ASSET)) {
      w.options.values = [UNSELECTED_ASSET, ...values];
    }
  }
}
function selectSafeAssets(node, family) {
  const missing = [];
  for (const field of REQUIRED_ASSET_FIELDS) {
    const w = widget(node, field);
    if (!w) continue;
    const selected = options(w).find(value => familyAssetMatch(family, field, value));
    // Deliberate invalid sentinel: the backend refuses it before loading any
    // weights. Keep it in this widget's option list so the user gets a clear
    // missing-model choice, not a separate "value not in list" schema error.
    if (selected === undefined) {
      w.options ||= {};
      const available = options(w);
      if (!available.includes(UNSELECTED_ASSET)) {
        w.options.values = [UNSELECTED_ASSET, ...available];
      }
      w.value = UNSELECTED_ASSET;
      missing.push(field);
    } else {
      w.value = selected;
    }
  }
  return missing;
}
function isTurboModel(name) {
  // Match Python: inspect the filename ONLY, not directories named "turbo".
  const filename = String(name || "").split(/[\\/]/).pop() || "";
  return /turbo/i.test(filename);
}
function schedulerForTurbo(node) {
  const vals = options(widget(node, "scheduler"));
  return vals.includes("linear_quadratic") ? "linear_quadratic" : (vals.includes("simple") ? "simple" : vals[0]);
}
function applyModelDefaults(node, family, diffusionModel = widget(node, "diffusion_model")?.value) {
  const preset = SUGGESTIONS[family] || {};
  if (Object.prototype.hasOwnProperty.call(preset, "steps")) setValue(node, "steps", preset.steps);
  if (Object.prototype.hasOwnProperty.call(preset, "cfg")) setValue(node, "cfg", preset.cfg);
  if (Object.prototype.hasOwnProperty.call(preset, "scheduler")) setValue(node, "scheduler", preset.scheduler);
  if (Object.prototype.hasOwnProperty.call(preset, "zero_conditioning")) setValue(node, "zero_conditioning", preset.zero_conditioning);
  if (family === "Qwen Image 2.1" && isTurboModel(diffusionModel)) {
    setValue(node, "steps", 8);
    setValue(node, "cfg", 1);
    setValue(node, "scheduler", schedulerForTurbo(node));
  }
}
// Remove unsupported family settings from the current node state.
// No backward-compatibility or workflow migration is performed.
const PROFILE_ALLOWED = new Set([...PROFILE_FIELDS, "__loras"]);
function pruneRetiredFamilySettings(node) {
  const properties = node?.properties;
  if (!properties || typeof properties !== "object") return;
  // Legacy per-family data is not used. It may contain old prompts, and must
  // not leak through workflow/PNG metadata.
  if (Object.hasOwn(properties, "ultraEditorByFamily")) delete properties.ultraEditorByFamily;
  const perModel = properties.ultraEditorByModel;
  if (perModel && typeof perModel === "object" && !Array.isArray(perModel)) {
    for (const key of Object.keys(perModel)) {
      const family = String(key).split("::", 1)[0];
      const saved = perModel[key];
      if (!Object.hasOwn(CAP, family) || !saved || typeof saved !== "object" || Array.isArray(saved)) {
        delete perModel[key];
        continue;
      }
      // A v0.4.7 profile may contain positive_text, negative_text, seed,
      // resolution_mode and edit_target. Never restore or re-serialize them.
      for (const field of Object.keys(saved)) {
        if (!PROFILE_ALLOWED.has(field)) delete saved[field];
      }
      if (Object.hasOwn(saved, "__loras") && !Array.isArray(saved.__loras)) delete saved.__loras;
    }
  }
  const lastByFamily = properties.ultraEditorLastModelByFamily;
  if (lastByFamily && typeof lastByFamily === "object" && !Array.isArray(lastByFamily)) {
    for (const family of Object.keys(lastByFamily)) {
      if (!Object.hasOwn(CAP, family)) delete lastByFamily[family];
    }
  }
}
function profileStore(node) {
  node.properties ||= {};
  node.properties.ultraEditorByModel ||= {};
  node.properties.ultraEditorLastModelByFamily ||= {};
  return node.properties.ultraEditorByModel;
}
function profileKey(family, diffusionModel) {
  const fam = String(family || "");
  const modelName = String(diffusionModel || "");
  return fam && modelName ? `${fam}::${modelName}` : "";
}
function profileSnapshot(node, family = model(node), diffusionModel = widget(node, "diffusion_model")?.value) {
  pruneRetiredFamilySettings(node);
  if (!Object.hasOwn(CAP, family)) return null;
  diffusionModel = String(diffusionModel || "");
  const key = profileKey(family, diffusionModel);
  if (!key) return null;
  const values = {};
  for (const field of PROFILE_FIELDS) {
    const w = widget(node, field);
    if (w) values[field] = w.value;
  }
  values.diffusion_model = diffusionModel;
  values.__loras = getLoraRows(node).map(row => loraRowValue(node, row));
  return { family, diffusionModel, values };
}
function commitProfileSnapshot(node, snapshot) {
  if (!snapshot?.family || !snapshot?.diffusionModel || !snapshot?.values) return;
  const key = profileKey(snapshot.family, snapshot.diffusionModel);
  if (!key) return;
  const store = profileStore(node);
  store[key] = snapshot.values;
  node.properties.ultraEditorLastModelByFamily[snapshot.family] = snapshot.diffusionModel;
}
function loadSavedModelProfile(node, family, diffusionModel) {
  const key = profileKey(family, diffusionModel);
  if (!key) return false;
  pruneRetiredFamilySettings(node);
  // Drafts exist only during the current editor session. They preserve changes
  // while switching, but do NOT alter the generate-time committed profile.
  const stored = node.__ultraEditorDraftByModel?.[key] || node.properties?.ultraEditorByModel?.[key];
  if (!stored || typeof stored !== "object") return false;
  for (const field of PROFILE_FIELDS) {
    if (Object.hasOwn(stored, field)) setValue(node, field, stored[field]);
  }
  replaceLoras(node, Array.isArray(stored.__loras) ? stored.__loras : []);
  return true;
}
function captureCurrentDraft(node) {
  const family = node.__ultraEditorCurrentFamily || model(node);
  const diffusionModel = node.__ultraEditorCurrentDiffusion || widget(node, "diffusion_model")?.value;
  const snapshot = profileSnapshot(node, family, diffusionModel);
  if (!snapshot) return;
  node.__ultraEditorDraftByModel ||= Object.create(null);
  node.__ultraEditorDraftByModel[profileKey(family, diffusionModel)] = snapshot.values;
}
function trackActiveProfile(node) {
  node.__ultraEditorCurrentFamily = model(node);
  node.__ultraEditorCurrentDiffusion = String(widget(node, "diffusion_model")?.value || "");
}
function applyFamilyPreset(node, family) {
  selectSafeAssets(node, family);
  applyModelDefaults(node, family, widget(node, "diffusion_model")?.value);
  setValue(node, "pid_upscale", false);
  setValue(node, "reuse_assets", true);
  replaceLoras(node, []);
}
function restore(node, family) {
  pruneRetiredFamilySettings(node);
  if (!Object.hasOwn(CAP, family)) return;
  // A draft may be the newest selection even though it has not been generated.
  const last = node.__ultraEditorDraftLastModelByFamily?.[family]
    || node.properties?.ultraEditorLastModelByFamily?.[family];
  if (last) setValue(node, "diffusion_model", last);
  let diffusionModel = String(widget(node, "diffusion_model")?.value || "");
  if (loadSavedModelProfile(node, family, diffusionModel)) return;
  applyFamilyPreset(node, family);
  diffusionModel = String(widget(node, "diffusion_model")?.value || "");
  loadSavedModelProfile(node, family, diffusionModel);
}
function visible(w, show) {
  if (!w) return;
  // Core owns layout and DOM visibility. Never force element.style.display:
  // mixing direct DOM hiding with LiteGraph widget visibility can leave stale
  // measurements across workflow swaps or Vue/Legacy renderer transitions.
  w.hidden = !show;
  w.disabled = !show;
}
function syncNativeWidgets(node) {
  const family = model(node);
  const mode = String(widget(node, "resolution_mode")?.value || "auto_1mp");
  const manual = mode === "custom";
  visible(widget(node, "width"), manual);
  visible(widget(node, "height"), manual);
  const pid = widget(node, "pid_upscale");
  if (pid) {
    const unsupported = family === "Qwen Image 2.1";
    if (unsupported) pid.value = false;
    pid.disabled = unsupported;
  }
  const show = Boolean(pid?.value) && family !== "Qwen Image 2.1";
  for (const field of PID_DETAILS) visible(widget(node, field), show);
  visible(widget(node, "pid_prompt"), show);
  const target = widget(node, "edit_target");
  if (target) {
    const valid = connected(node).filter(x => x <= limit(node)).map(x => `image${x}`);
    const values = ["auto", ...valid];
    if ((node.__ultraEditorPendingTarget || app.configuringGraph) && !values.includes(target.value)) values.push(target.value);
    target.options ||= {};
    target.options.values = values;
    if (!values.includes(target.value)) target.value = "auto";
  }
  localizeNode(node);
}
// Initial prompt height: the core's setInitialSize() (node constructor) reads
// node._initialMinSize once and calls setSize() itself. Supplying extra height
// here only affects a newly created node; the core then gives that free space
// to the two growable prompt boxes (classic and Vue). It does not change the
// computeSize() floor the core re-checks on load, so a user-resized node is kept.
// Prompt widgets keep the core's default minimum, exactly like CLIPTextEncode.
const LORA_ADD_ROW_HEIGHT = 30;   // "+ Add LoRA" row is added after core sizing
// Free height shared by both prompts at creation (about 4-5 lines each).
// Vue widget rows are taller than classic canvas rows, so Vue needs more.
const PROMPT_INITIAL_EXTRA = { classic: 50, vue: 160 };
function installInitialPromptHeight(nodeType) {
  Object.defineProperty(nodeType.prototype, "_initialMinSize", {
    configurable: true,
    get() {
      // One object per node: the core also accumulates widget minimum sizes
      // (e.g. the multiline minimum width) into this same object.
      const own = this.__ultraEditorInitialMinSize ||= { width: 1, height: 1 };
      const base = typeof this.computeSize === "function" ? Number(this.computeSize()[1]) || 0 : 0;
      const extra = globalThis.LiteGraph?.vueNodesMode ? PROMPT_INITIAL_EXTRA.vue : PROMPT_INITIAL_EXTRA.classic;
      own.height = Math.max(Number(own.height) || 1, base + LORA_ADD_ROW_HEIGHT + extra);
      return own;
    },
    set(value) {
      if (value && typeof value === "object") this.__ultraEditorInitialMinSize = value;
    },
  });
}
// Node geometry belongs to the ComfyUI core. The backend still accepts
// image1..image10, but the frontend definition exposes only image1 so the core
// never builds 10 sockets at creation/load. Otherwise the core's post-load
// minimum-size check (max(saved size, computeSize)) counts 9 temporary empty
// sockets and overrides the user's saved node size. Extra sockets are added
// with the core addInput() API only when images are connected.
function exposeOnlyFirstImageSocket(nodeData) {
  const optional = nodeData?.input?.optional;
  if (optional && typeof optional === "object") {
    for (let i = 2; i <= 10; i++) delete optional[`image${i}`];
  }
  const order = nodeData?.input_order?.optional;
  if (Array.isArray(order)) {
    nodeData.input_order.optional = order.filter(name => !/^image(?:[2-9]|10)$/.test(String(name)));
  }
}

function syncImageSlots(node) {
  if (!node || node.__ultraEditorLoading || app.configuringGraph) return;
  const links = connected(node);
  const gap = links.some((index, position) => index !== position + 1);
  const signature = gap ? links.join(",") : null;
  if (signature && signature !== node.__ultraEditorGapNotice) {
    node.__ultraEditorGapNotice = signature;
    nonblockingNotice("IMAGE sockets have a gap. Connect image1, image2, ... without skipping a number before queueing.",
                      "IMAGE 연결에 빈 번호가 있습니다. 실행 전에 image1, image2부터 번호를 건너뛰지 않고 연결하세요.");
  } else if (!signature) {
    node.__ultraEditorGapNotice = null;
  }
  const highest = Math.max(0, ...links);
  const desired = Math.min(10, Math.max(1, highest + (highest < limit(node) ? 1 : 0)));
  for (let i = 1; i <= desired; i++) {
    if (!slotByName(node, `image${i}`)) {
      node.addInput(`image${i}`, "IMAGE");
    }
  }
  for (let i = 10; i > desired; i--) {
    const at = (node.inputs || []).findIndex(s => s.name === `image${i}`);
    if (at >= 0 && node.inputs[at].link == null) {
      node.removeInput(at);
    }
  }
  node.__ultraEditorPendingTarget = false;
  syncNativeWidgets(node);
  // No geometry calls here: ComfyUI/LiteGraph lays out native sockets and
  // widgets. Only invalidate the drawing after actual widget changes.
  node.setDirtyCanvas?.(true, true);
}
function schedule(node) {
  if (!node || node.__ultraEditorLoading) return;
  const counter = (node.__ultraEditorSyncSeq || 0) + 1;
  node.__ultraEditorSyncSeq = counter;
  const apply = () => {
    if (counter !== node.__ultraEditorSyncSeq) return;
    if (app.configuringGraph) {
      if ((node.__ultraEditorGraphRetry || 0) < 60) {
        node.__ultraEditorGraphRetry = (node.__ultraEditorGraphRetry || 0) + 1;
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
      }
      return;
    }
    node.__ultraEditorGraphRetry = 0;
    syncImageSlots(node);
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
  else Promise.resolve().then(apply);
}

let localeOverride = null;
let localeListenerSet = false;
const WIDGET_LABELS = {
  model_family: ["Model Family", "모델 계열"],
  diffusion_model: ["Diffusion Model", "확산 모델"],
  text_encoder: ["Text Encoder", "텍스트 인코더"],
  vae_name: ["VAE", "VAE"],
  resolution_mode: ["Resolution Selection", "해상도 선택"],
  reuse_assets: ["Reuse Models (RAM)", "모델 재사용 (RAM)"],
  pid_prompt: ["PiD Scene Prompt", "PiD 장면 프롬프트"],
  edit_target: ["Edit Target", "수정 대상 이미지"],
  positive_text: ["Positive Prompt", "긍정 프롬프트"],
  negative_text: ["Negative Prompt", "부정 프롬프트"],
  width: ["Width (0 = Aspect)", "가로 (0 = 비율 유지)"],
  height: ["Height (0 = Aspect)", "세로 (0 = 비율 유지)"],
  seed: ["Seed", "시드"],
  control_after_generate: ["Seed after Generate", "생성 후 시드 동작"],
  steps: ["Steps", "스텝"], cfg: ["CFG", "CFG"],
  sampler_name: ["Sampler", "샘플러"], scheduler: ["Scheduler", "스케줄러"],
  zero_conditioning: ["Zero Conditioning", "제로 컨디셔닝"],
  pid_upscale: ["PiD Upscale", "PiD 업스케일"],
  pid_model: ["PiD Model", "PiD 모델"],
  pid_sampler: ["PiD Sampler", "PiD 샘플러"],
  pid_scheduler: ["PiD Scheduler", "PiD 스케줄러"],
  pid_steps: ["PiD Steps", "PiD 스텝"],
  pid_scale: ["PiD Output Scale", "PiD 최종 배율"],
  pid_color_match: ["PiD Color Match", "PiD 색상 일치"],
};
// Tooltip-only text is localized without changing the canonical underlying
// widget name, serialized option value, model file or seed operation token.
const WIDGET_TOOLTIPS = {
  model_family: ["Choose the Qwen editing model family. 2511 supports up to 3 images and optional PiD; 2.1 supports up to 10 images.",
                 "Qwen 편집 모델 계열을 선택합니다. 2511은 최대 3장과 PiD를 지원하며 2.1은 최대 10장까지 지원합니다."],
  diffusion_model: ["Select a compatible diffusion model for this Qwen family.",
                    "선택한 Qwen 계열과 호환되는 확산 모델 파일을 선택하세요."],
  text_encoder: ["Select the matching Qwen VL text encoder for the selected family.",
                 "선택한 계열에 맞는 Qwen VL 텍스트 인코더를 선택하세요."],
  vae_name: ["Select the VAE matching the Qwen model family.",
             "Qwen 모델 계열에 맞는 VAE를 선택하세요."],
  positive_text: ["Describe the requested image edit. Numbered image references follow the original IMAGE sockets.",
                  "원하는 이미지 편집 지시를 입력하세요. 이미지 번호는 원래 IMAGE 입력 단자 번호를 기준으로 작성합니다."],
  width: ["Custom resolution only. Use 0 to derive the width from the selected target image aspect ratio.",
          "사용자 지정 해상도에서만 사용합니다. 0은 수정 대상 이미지의 비율에 맞춰 가로 길이를 계산합니다."],
  height: ["Custom resolution only. Use 0 to derive the height from the selected target image aspect ratio.",
           "사용자 지정 해상도에서만 사용합니다. 0은 수정 대상 이미지의 비율에 맞춰 세로 길이를 계산합니다."],
  seed: ["Random seed for image editing and optional PiD.", "이미지 편집과 PiD에서 사용하는 시드입니다."],
  control_after_generate: ["Choose whether the seed stays fixed or changes after generating.",
                           "생성 후 시드를 고정할지 자동 변경할지 선택합니다."],
  sampler_name: ["Sampler for editing. Turbo uses the selected sampler in either 8-step or KSampler mode.",
                 "편집용 샘플러입니다. Turbo의 8스텝 전용/일반 샘플링 모두 선택한 샘플러를 사용합니다."],
  zero_conditioning: ["ON zeros the negative conditioning; OFF uses the negative prompt. At CFG=1, negative guidance is ineffective.",
                      "ON이면 부정 컨디셔닝을 0으로 만듭니다. OFF이면 부정 프롬프트를 사용합니다. CFG=1에서는 부정 유도 효과가 없습니다."],
  pid_prompt: ["Optional description for PiD upscaling. Leave empty to reuse the edit prompt.",
               "PiD 업스케일에 쓰는 별도 장면 설명입니다. 비우면 편집 프롬프트를 재사용합니다."],
  pid_model: ["Select a compatible PiD checkpoint, or use automatic selection.",
              "호환되는 PiD 체크포인트를 선택하거나 자동 선택을 사용하세요."],
  pid_sampler: ["Sampler for the optional PiD upscale pass.", "선택적 PiD 업스케일에 사용할 샘플러입니다."],
  pid_scheduler: ["Scheduler for the optional PiD upscale pass.", "선택적 PiD 업스케일에 사용할 스케줄러입니다."],
  pid_steps: ["Sampling steps for optional PiD upscaling.", "선택적 PiD 업스케일의 샘플링 스텝입니다."],
  pid_scale: ["Choose the final PiD output scale (x2 or x4).", "PiD 결과 이미지의 최종 배율(x2 또는 x4)을 선택합니다."],
  pid_color_match: ["ON adjusts the PiD output color toward the original edited image.",
                    "ON이면 PiD 결과 이미지의 색감을 원래 편집 이미지에 가깝게 맞춥니다."],
  reuse_assets: ["Keep unchanged Qwen model, text encoder and VAE objects cached in system RAM across runs; OFF releases this node's cache.",
                 "변경되지 않은 모델·텍스트 인코더·VAE를 시스템 RAM에 보관해 재사용합니다. OFF는 이 노드의 캐시를 해제합니다."],
};
function currentLanguage() {
  if (localeOverride) return localeOverride;
  const stores = [app?.extensionManager?.setting, app?.ui?.settings];
  for (const store of stores) {
    for (const getter of ["getSettingValue", "get"]) {
      try {
        const value = store?.[getter]?.("Comfy.Locale");
        if (typeof value === "string" && value) return value.toLowerCase();
      } catch (_) {}
    }
  }
  const candidates = [app?.extensionManager?.locale, globalThis?.document?.documentElement?.lang, globalThis?.navigator?.language];
  const first = candidates.find(s => typeof s === "string" && s.trim());
  return String(first || "en").toLowerCase();
}
const tr = (en, ko) => currentLanguage().startsWith("ko") ? ko : en;
function isOurNode(node) { return node?.comfyClass === NODE || node?.type === NODE; }
function localizeNode(node) {
  if (!isOurNode(node)) return;
  for (const w of node.widgets || []) {
    const labels = WIDGET_LABELS[w.name];
    if (labels) w.label = tr(...labels);
    const tips = WIDGET_TOOLTIPS[w.name];
    if (tips) w.tooltip = tr(...tips);
  }
  // Localization is presentation only: do not call syncNativeWidgets here,
  // which can change disabled/value state while a workflow is being loaded.
  // Refresh every dynamic tooltip immediately on Comfy.Locale.change.
  const family = model(node);
  const mode = String(widget(node, "resolution_mode")?.value || "auto_1mp");
  const res = widget(node, "resolution_mode");
  if (res) res.tooltip = family === "Qwen Image Edit 2511" && mode === "original"
    ? tr("Qwen Edit 2511 is best used at Auto ~1MP: its official reference encoder uses ~1MP latents. Original size may alter composition and use much more VRAM.",
         "Qwen Edit 2511은 자동 약 1MP를 권장합니다. 공식 참조 인코더는 약 1MP latent를 사용하므로 원본 크기로 출력하면 구도가 변하거나 VRAM이 크게 늘 수 있습니다.")
    : tr("Preserves edit target aspect ratio. Auto ~1MP, 0.5/1.5/2MP, Original, or Custom. Original in Qwen 2.1 keeps the edit target native but limits other references to ~1MP. PiD x4 depends on the longest side.",
         "수정 대상의 비율 유지. 자동 약 1MP, 0.5/1.5/2MP, 원본 크기, 사용자 지정. Qwen 2.1 원본 모드는 대상만 원본 크기로 유지하고 나머지 참조는 약 1MP로 제한합니다. PiD x4 제한은 긴 변 기준입니다.");
  const pid = widget(node, "pid_upscale");
  if (pid) pid.tooltip = family === "Qwen Image 2.1"
    ? tr("No native compatible PiD checkpoint for Qwen 2.1.", "Qwen 2.1에는 호환되는 네이티브 PiD 체크포인트가 없습니다.")
    : tr("Upscale edited latent with a compatible PiD checkpoint.", "호환 PiD 모델을 사용해 편집된 latent를 확대합니다.");
  const turbo = family === "Qwen Image 2.1" && isTurboModel(widget(node, "diffusion_model")?.value);
  const turboManual = turbo && Number(widget(node, "steps")?.value || 0) === 8;
  const steps = widget(node, "steps");
  if (steps) steps.tooltip = turbo
    ? (turboManual
        ? tr("Qwen 2.1 Turbo uses its built-in 8-step sigma schedule when Steps = 8. Change the step count to use normal KSampler stepping.",
             "Qwen 2.1 Turbo는 Steps=8일 때 내장 8스텝 시그마 스케줄을 사용합니다. 다른 스텝 수를 입력하면 일반 KSampler 스텝을 사용합니다.")
        : tr("Qwen 2.1 Turbo is using normal KSampler stepping because Steps is not 8.",
             "Qwen 2.1 Turbo는 Steps가 8이 아니므로 일반 KSampler 스텝을 사용합니다."))
    : tr("Sampler steps", "샘플링 스텝");
  const cfg = widget(node, "cfg");
  if (cfg) cfg.tooltip = turbo
    ? tr("Qwen 2.1 Turbo keeps CFG editable. The common starting value is 1.0.",
         "Qwen 2.1 Turbo에서도 CFG를 직접 조절할 수 있습니다. 일반적인 시작값은 1.0입니다.")
    : tr("Classifier-free guidance (CFG)", "분류기 없는 유도 강도(CFG)");
  const scheduler = widget(node, "scheduler");
  if (scheduler) scheduler.tooltip = turboManual
    ? tr("When Turbo Steps = 8, the built-in sigma schedule is used and Scheduler is ignored.",
         "Turbo에서 Steps=8이면 내장 시그마 스케줄을 사용하므로 Scheduler 값은 적용되지 않습니다.")
    : tr("Scheduler", "스케줄러");
  const negative = widget(node, "negative_text");
  if (negative) negative.tooltip = family === "Qwen Image 2.1"
      ? tr("At CFG=1 negative text has no effective guidance. Increase CFG above 1 to strengthen it.", "CFG=1에서는 부정 프롬프트의 유도 효과가 거의 없으며 CFG를 1보다 높이면 강화됩니다.")
      : tr("Negative editing prompt", "부정 편집 프롬프트");
  const target = widget(node, "edit_target");
  if (target) {
    const valid = connected(node).filter(x => x <= limit(node)).map(x => `image${x}`);
    target.tooltip = valid.length <= 1
      ? tr("The only connected image is the edit target.", "연결된 이미지 한 장이 자동으로 수정 대상이 됩니다.")
      : tr(`Select the image to edit; image socket numbers do not change (${valid.join(", ")}).`,
           `수정할 이미지를 선택합니다. IMAGE 단자 번호는 변경되지 않습니다 (${valid.join(", ")}).`);
  }
  const p = widget(node, "pid_upscale");
  if (p?.disabled) p.label = tr("PiD Upscale (unsupported)", "PiD 업스케일 (미지원)");
  if (Array.isArray(node.outputs)) {
    for (let i = 0; i < 2; i++) {
      if (node.outputs[i]) node.outputs[i].label = i ? tr("PiD Image", "PiD 이미지") : tr("Edited Image", "편집 이미지");
    }
  }
  // Preserve user-defined node title across all locale and socket updates.
  node.setDirtyCanvas?.(true, true);
}
// Official ComfyUI SubgraphNode exposes a nested LGraph on node.subgraph.
// Use local node IDs only within one graph; full execution IDs are colon paths.
function walkGraphNodes(graph, callback) {
  // Track the active recursion chain rather than deduping all graph objects.
  // Multiple subgraph instances may share a definition but need distinct IDs.
  const activeChain = new Set();
  function traverse(current, prefix = "", ancestorsActive = true) {
    if (!current || activeChain.has(current)) return;
    activeChain.add(current);
    for (const node of current._nodes || current.nodes || []) {
      if (!node) continue;
      const id = String(node.id ?? "");
      const path = prefix && id ? `${prefix}:${id}` : id;
      const active = ancestorsActive && node.mode !== 2 && node.mode !== 4;
      callback(node, current, path, active, prefix);
      if (node.subgraph) traverse(node.subgraph, path, active);
    }
    activeChain.delete(current);
  }
  traverse(graph);
}
function forEachEditorNode(callback) {
  walkGraphNodes(app.graph, (node, graph, path, active, prefix) => {
    if (isOurNode(node)) callback(node, graph, path, active, prefix);
  });
}
function installLocale() {
  if (localeListenerSet) return;
  localeListenerSet = true;
  try {
    app?.ui?.settings?.addEventListener?.("Comfy.Locale.change", event => {
      const next = event?.detail?.value;
      localeOverride = typeof next === "string" && next.trim() ? next.toLowerCase() : null;
      forEachEditorNode(node => localizeNode(node));
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => {
        forEachEditorNode(node => localizeNode(node));
      });
    });
  } catch (e) { console.warn("[Ultra Qwen Image Editor] Locale listener unavailable", e); }
}

const ROW_HEIGHT = 26;
const ROW_PREFIX = "lora_";
let loraCache = null;
let loraRequest = null;
let loraVersion = 0;
const isLora = w => Boolean(w?._editorLoraRow);
const isLoraAdd = w => Boolean(w?._editorLoraAdd);
const getLoraRows = node => (node?.widgets || []).filter(isLora);
const normalizeLora = value => ({
  on: value?.on !== false,
  lora: String(value?.lora || ""),
  strength: Number.isFinite(Number(value?.strength)) ? Math.max(-100, Math.min(100, Number(value.strength))) : 1,
});
function loraRowValue(node, row) {
  return { ...normalizeLora(row.value), order: getLoraRows(node).indexOf(row) };
}
async function getLoras(force = false) {
  if (force) { loraCache = null; loraVersion++; loraRequest = null; }
  if (loraCache) return loraCache;
  if (loraRequest) return loraRequest;
  const version = loraVersion;
  const task = (async () => {
    let error = null;
    for (const cls of ["LoraLoaderModelOnly", "LoraLoader"]) {
      try {
        const response = await api.fetchApi(`/object_info/${cls}`);
        if (!response.ok) throw Error(`${cls} HTTP ${response.status}`);
        const data = await response.json();
        const def = data?.[cls] || data;
        const values = def?.input?.required?.lora_name?.[0];
        if (Array.isArray(values)) {
          const found = [...new Set(values.map(String))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          if (version === loraVersion) loraCache = found;
          return found;
        }
      } catch (e) { error = e; }
    }
    if (error) console.warn("[Ultra Qwen Image Editor] LoRA list lookup failed", error);
    return [];
  })();
  loraRequest = task;
  try { return await task; }
  finally { if (loraRequest === task) loraRequest = null; }
}
function menuTree(values) {
  const root = { dirs: new Map(), files: [] };
  for (const value of values) {
    let cursor = root;
    const parts = String(value).split(/[\\/]/g).filter(Boolean);
    for (const part of parts.slice(0, -1)) {
      if (!cursor.dirs.has(part)) cursor.dirs.set(part, { dirs: new Map(), files: [] });
      cursor = cursor.dirs.get(part);
    }
    cursor.files.push({ text: parts.at(-1) || value, value });
  }
  return root;
}
function menuItems(root, cb) {
  const items = [];
  for (const [name, dir] of [...root.dirs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    items.push({ content: `📁 ${name}`, submenu: { options: menuItems(dir, cb) } });
  }
  for (const item of root.files.sort((a, b) => a.text.localeCompare(b.text))) {
    items.push({ content: item.text, callback: () => cb(item.value) });
  }
  return items;
}
function menuEvent(event) {
  if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) return event;
  // Keyboard-activated context menus may have no MouseEvent. Anchor a native
  // event at the canvas centre without moving or resizing any ComfyUI nodes.
  const canvas = app.canvas?.canvas;
  const rect = canvas?.getBoundingClientRect?.();
  const View = canvas?.ownerDocument?.defaultView || globalThis;
  if (!rect || typeof View.MouseEvent !== "function") return null;
  return new View.MouseEvent("click", {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    bubbles: true,
  });
}
function openMenu(event, options) {
  const Menu = globalThis.LiteGraph?.ContextMenu;
  if (typeof Menu === "function") {
    const anchor = menuEvent(event);
    return new Menu(options, { event: anchor || undefined, parentMenu: app.canvas?.currentMenu });
  }
  return null;
}
async function selectLora(event, cb) {
  const values = await getLoras(false);
  const entries = values.length ? menuItems(menuTree(values), cb) : [{ content: tr("No installed LoRAs", "설치된 LoRA 없음") }];
  openMenu(event, entries);
}
function editStrength(node, row, event) {
  const applyValue = value => {
    if (value == null) return;
    const amount = Number(value);
    if (!Number.isFinite(amount)) return;
    row.value.strength = Math.max(-100, Math.min(100, Math.round(amount * 1000) / 1000));
    node.setDirtyCanvas?.(true, true);
  };
  const title = tr("LoRA strength", "LoRA 강도");
  const anchor = menuEvent(event);
  if (anchor && typeof app.canvas?.prompt === "function") {
    app.canvas.prompt(title, String(row.value.strength), applyValue, anchor);
    return;
  }
  const dialog = app.extensionManager?.dialog;
  if (typeof dialog?.prompt === "function") {
    Promise.resolve(dialog.prompt({
      title,
      message: tr("Enter a value between -100 and 100.", "-100에서 100 사이의 값을 입력하십시오."),
      defaultValue: String(row.value.strength),
    })).then(applyValue).catch(error => console.warn("[Ultra Qwen Image Editor] LoRA strength dialog error", error));
    return;
  }
  if (typeof globalThis.prompt === "function") applyValue(globalThis.prompt(title, String(row.value.strength)));
}
function roundRect(ctx, x, y, w, h, r = 4) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fitLabel(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  let out = value;
  while (out.length > 3 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}
class EditorLoraRow {
  constructor(name, value = {}) {
    this.name = name; this.type = "custom"; this.options = {}; this._editorLoraRow = true;
    this.value = normalizeLora(value); this.last_y = 0;
    Object.defineProperty(this, "width", { get: () => undefined, set: () => {}, configurable: true });
  }
  computeSize(width) { return [width, ROW_HEIGHT]; }
  draw(ctx, node, width, y, height) {
    this.last_y = y;
    // Core assigns widget.width via a read-only compatibility property;
    // draw() provides the actual usable row width for pointer hit-testing.
    this._width = width;
    const top = y + 2, rh = Math.max(20, height - 4), left = 15, right = width - 15;
    const toggle = 24, strength = 66, gap = 4, loraX = left + toggle + gap;
    const strengthX = right - strength, loraWidth = Math.max(50, strengthX - gap - loraX);
    ctx.save(); ctx.globalAlpha = this.value.on ? 1 : .5;
    for (const [x, w] of [[left, toggle], [loraX, loraWidth], [strengthX, strength]]) {
      roundRect(ctx, x, top, w, rh); ctx.fillStyle = globalThis.LiteGraph?.WIDGET_BGCOLOR || "#222";
      ctx.strokeStyle = globalThis.LiteGraph?.WIDGET_OUTLINE_COLOR || "#666"; ctx.fill(); ctx.stroke();
    }
    ctx.textBaseline = "middle"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
    ctx.fillStyle = this.value.on ? "#8fd18f" : "#888";
    ctx.fillText(this.value.on ? "●" : "○", left + toggle / 2, top + rh / 2);
    ctx.fillStyle = globalThis.LiteGraph?.WIDGET_TEXT_COLOR || "#ddd";
    ctx.textAlign = "left";
    ctx.fillText(fitLabel(ctx, this.value.lora || tr("Select LoRA", "LoRA 선택"), loraWidth - 14), loraX + 7, top + rh / 2);
    ctx.textAlign = "center"; ctx.fillText(this.value.strength.toFixed(2), strengthX + strength / 2, top + rh / 2);
    ctx.restore();
  }
  serializeValue(node) { return loraRowValue(node, this); }
  mouse(event, pos, node) {
    if (event.type !== "pointerdown" || event.button === 2) return false;
    const right = (this._width || node?.size?.[0] || 340) - 15, x = pos[0];
    if (x >= 15 && x <= 39) { this.value.on = !this.value.on; node.setDirtyCanvas?.(true, true); return true; }
    if (x >= right - 70 && x <= right) { editStrength(node, this, event); return true; }
    if (x > 39 && x < right - 70) { selectLora(event, name => { this.value.lora = name; node.setDirtyCanvas?.(true, true); }); return true; }
    return false;
  }
}
class EditorLoraAdd {
  constructor() {
    this.name = "ultra_editor_add_lora"; this.type = "custom"; this.value = "";
    this.options = { serialize: false }; this.serialize = false; this._editorLoraAdd = true;
    Object.defineProperty(this, "width", { get: () => undefined, set: () => {}, configurable: true });
  }
  computeSize(width) { return [width, ROW_HEIGHT]; }
  draw(ctx, node, width, y, height) {
    ctx.save(); roundRect(ctx, 15, y + 2, width - 30, Math.max(20, height - 4));
    ctx.fillStyle = globalThis.LiteGraph?.WIDGET_BGCOLOR || "#222";
    ctx.strokeStyle = globalThis.LiteGraph?.WIDGET_OUTLINE_COLOR || "#666"; ctx.fill(); ctx.stroke();
    ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = globalThis.LiteGraph?.WIDGET_TEXT_COLOR || "#ddd";
    ctx.fillText(tr("＋ Add LoRA", "＋ LoRA 추가"), width / 2, y + height / 2); ctx.restore();
  }
  mouse(event, pos, node) {
    if (event.type !== "pointerdown" || event.button === 2) return false;
    selectLora(event, name => addLora(node, { lora: name })); return true;
  }
}
function ensureAddLora(node) {
  let add = (node.widgets || []).find(isLoraAdd);
  if (!add && typeof node.addCustomWidget === "function") add = node.addCustomWidget(new EditorLoraAdd());
  if (add) {
    const index = node.widgets.indexOf(add);
    if (index >= 0) node.widgets.splice(index, 1);
    node.widgets.push(add);
  }
  return add;
}
function addLora(node, value = {}, name = null, resize = true) {
  node._editorLoraCounter = (node._editorLoraCounter || 0) + 1;
  const key = name || `${ROW_PREFIX}${node._editorLoraCounter}`;
  const num = Number(key.slice(5));
  if (Number.isFinite(num)) node._editorLoraCounter = Math.max(node._editorLoraCounter, num);
  if (typeof node.addCustomWidget !== "function") return null;
  const row = node.addCustomWidget(new EditorLoraRow(key, value));
  const add = ensureAddLora(node);
  if (add) {
    const idx = node.widgets.indexOf(row), btnIdx = node.widgets.indexOf(add);
    if (idx > btnIdx) { node.widgets.splice(idx, 1); node.widgets.splice(btnIdx, 0, row); }
  }
  if (resize) node.setDirtyCanvas?.(true, true);
  return row;
}
function removeLoraWidgets(node) {
  for (const w of [...(node.widgets || [])].reverse()) {
    if (!isLora(w) && !isLoraAdd(w)) continue;
    if (typeof node.removeWidget === "function") node.removeWidget(w);
    else { const index = node.widgets.indexOf(w); if (index >= 0) node.widgets.splice(index, 1); }
  }
}
function replaceLoras(node, values) {
  removeLoraWidgets(node); node._editorLoraCounter = 0;
  for (const v of values || []) addLora(node, v, null, false);
  ensureAddLora(node);
}
function reorderLora(node, row, shift) {
  const rows = getLoraRows(node), a = rows.indexOf(row), b = a + shift;
  if (b < 0 || b >= rows.length) return;
  const x = node.widgets.indexOf(row), y = node.widgets.indexOf(rows[b]);
  [node.widgets[x], node.widgets[y]] = [node.widgets[y], node.widgets[x]];
  node.setDirtyCanvas?.(true, true);
}
function rowMenu(node, row) {
  const rows = getLoraRows(node), index = rows.indexOf(row);
  return [
    { content: row.value.on ? tr("Disable this LoRA", "이 LoRA 비활성화") : tr("Enable this LoRA", "이 LoRA 활성화"), callback: () => { row.value.on = !row.value.on; node.setDirtyCanvas?.(true, true); } },
    { content: tr("Move LoRA up", "LoRA 위로 이동"), disabled: index <= 0, callback: () => reorderLora(node, row, -1) },
    { content: tr("Move LoRA down", "LoRA 아래로 이동"), disabled: index >= rows.length - 1, callback: () => reorderLora(node, row, 1) },
    { content: tr("Remove only this LoRA", "이 LoRA만 삭제"), callback: () => {
      if (node.removeWidget) node.removeWidget(row);
      else node.widgets.splice(node.widgets.indexOf(row), 1);
      node.setDirtyCanvas?.(true, true);
    } },
    null,
    { content: tr("Refresh LoRA list", "LoRA 목록 새로고침"), callback: () => getLoras(true) },
    { content: tr("Change LoRA file", "LoRA 파일 변경"), callback: (_value, _options, event) => selectLora(event, name => {
      row.value.lora = name;
      node.setDirtyCanvas?.(true, true);
    }) },
    { content: tr("Change LoRA strength", "LoRA 강도 변경"), callback: (_value, _options, event) => editStrength(node, row, event) },
  ];
}
function rowAtPointer(node, canvas = app.canvas) {
  const p = canvas?.graph_mouse || canvas?.graphMouse;
  if (!p || !node?.pos) return null;
  const x = p[0] - node.pos[0], y = p[1] - node.pos[1];
  if (x < 0 || x > (node.size?.[0] || 0)) return null;
  const rows = getLoraRows(node);
  const hits = rows.filter(w => {
    // Core Layout uses widget.y even when custom draw() is not called in Vue.
    const wy = Number.isFinite(w.y) && w.y > 0 ? w.y : w.last_y;
    return Number.isFinite(wy) && y >= wy && y <= wy + ROW_HEIGHT;
  });
  // On Vue/Nodes 2.0 some widget coordinates are not unique. Never choose
  // an arbitrary row in that situation; use explicit per-row menu fallback.
  return hits.length === 1 ? hits[0] : null;
}
function loraFallbackMenu(node) {
  // Vue contextMenuConverter recognizes submenus only with has_submenu=true
  // and its convertSubmenuToOptions flattens exactly ONE submenu level.
  // Put each LoRA directly in the top-level menu with its actions as leaves.
  // Classic LiteGraph also accepts has_submenu + submenu.options.
  return getLoraRows(node).map((row, i) => ({
    content: `LoRA ${i + 1}: ${row.value.lora || tr("Select LoRA", "LoRA 선택")}`,
    has_submenu: true,
    submenu: { options: rowMenu(node, row) },
  }));
}
function nonblockingNotice(english, korean) {
  const message = tr(english, korean);
  const toast = app?.extensionManager?.toast;
  if (typeof toast?.addAlert === "function") toast.addAlert(message);
  else console.warn("[Ultra Qwen Image Editor]", message);
}
let legacyMenuWrapped = false;
function installLegacyMenu() {
  if (legacyMenuWrapped || typeof app?.collectNodeMenuItems === "function") return;
  const canvas = app?.canvas, original = canvas?.getNodeMenuOptions;
  if (typeof original !== "function") return;
  canvas.getNodeMenuOptions = function(node, ...args) {
    if (isOurNode(node)) {
      const row = rowAtPointer(node, this);
      if (row) return rowMenu(node, row);
      const fallback = loraFallbackMenu(node);
      return [...fallback, ...(original.call(this, node, ...args) || [])];
    }
    return original.call(this, node, ...args);
  };
  legacyMenuWrapped = true;
}
function restoreLorasFromValues(values) {
  return (values || []).filter(x => x && typeof x === "object" && typeof x.lora === "string")
    .map((v, i) => ({ ...normalizeLora(v), order: Number.isInteger(Number(v.order)) ? Number(v.order) : i }))
    .sort((a, b) => a.order - b.order);
}

const SAFE_WIDGET_DEFAULTS = {
  model_family: "Qwen Image Edit 2511", positive_text: "", negative_text: "",
  edit_target: "auto", resolution_mode: "auto_1mp",
  width: 0, height: 0, seed: 0, steps: 20, cfg: 4,
  sampler_name: "euler", scheduler: "simple", zero_conditioning: false,
  pid_upscale: false, pid_prompt: "", pid_sampler: "lcm",
  pid_scheduler: "sgm_uniform", pid_steps: 4, pid_scale: "x4",
  pid_color_match: true, reuse_assets: true,
  control_after_generate: "randomize",
};
function safeWidgetDefault(w) {
  if (REQUIRED_ASSET_FIELDS.includes(w?.name)) return UNSELECTED_ASSET;
  const vals = options(w);
  const preferred = SAFE_WIDGET_DEFAULTS[w?.name];
  if (Object.hasOwn(SAFE_WIDGET_DEFAULTS, w?.name)) {
    if (w?.name === "control_after_generate" && vals.length && !vals.includes(preferred)) {
      return vals.includes(w.value) ? w.value : (w?.options?.default || vals[0]);
    }
    return vals.length && !vals.includes(preferred) ? vals[0] : preferred;
  }
  return vals.length ? vals[0] : w?.options?.default ?? w?.value;
}
function isCurrentWidgetLayout(standardWidgets, saved, properties) {
  const schema = properties?.[WIDGET_SCHEMA_PROPERTY];
  if (schema !== undefined && schema !== WIDGET_SCHEMA_VERSION) return false;
  // Files from v0.4.4–v0.4.8 predate the marker but have this same order.
  // Reject older positional schemas, not all unmarked workflows.
  if (!saved?.length) return true;
  const byName = Object.create(null);
  for (let i = 0; i < Math.min(standardWidgets.length, saved.length); i++) {
    byName[standardWidgets[i].name] = saved[i];
  }
  const oneOf = (name, vals) => byName[name] == null || vals.includes(byName[name]);
  const isText = name => byName[name] == null || typeof byName[name] === "string";
  const isNumber = name => byName[name] == null || (typeof byName[name] === "number" && Number.isFinite(byName[name]));
  const isBool = name => byName[name] == null || typeof byName[name] === "boolean";
  if (!oneOf("model_family", Object.keys(CAP))) return false;
  if (!oneOf("edit_target", ["auto", ...Array.from({length:10}, (_, i) => `image${i + 1}`)])) return false;
  if (!oneOf("resolution_mode", ["auto_1mp", "0.5MP", "1.5MP", "2MP", "original", "custom"])) return false;
  if (!oneOf("pid_scale", ["x2", "x4"])) return false;
  for (const name of ["positive_text", "negative_text", "pid_prompt", "diffusion_model", "text_encoder", "vae_name", "sampler_name", "scheduler", "pid_model", "pid_sampler", "pid_scheduler"]) {
    if (!isText(name)) return false;
  }
  for (const name of ["width", "height", "seed", "steps", "cfg", "pid_steps"]) {
    if (!isNumber(name)) return false;
  }
  for (const name of ["zero_conditioning", "pid_upscale", "pid_color_match", "reuse_assets"]) {
    if (!isBool(name)) return false;
  }
  return true;
}
function attachHooks(node) {
  if (!node || node.__ultraEditorHooked) return;
  node.__ultraEditorHooked = true;
  node.__ultraEditorCurrentFamily ||= model(node);
  node.__ultraEditorCurrentDiffusion ||= String(widget(node, "diffusion_model")?.value || "");
  const familyWidget = widget(node, "model_family");
  if (familyWidget) {
    const callback = familyWidget.callback;
    familyWidget.callback = function(value, ...args) {
      const next = String(value || familyWidget.value || "");
      const oldFamily = node.__ultraEditorCurrentFamily || model(node);
      const highest = Math.max(0, ...connected(node));
      if (highest > (CAP[next] || 1)) {
        familyWidget.value = oldFamily;
        nonblockingNotice(`${next}: at most ${CAP[next]} images; disconnect image${highest} first.`, `${next}: 최대 ${CAP[next]}장입니다. image${highest} 연결을 먼저 해제하세요.`);
        schedule(node);
        return;
      }
      if (next !== oldFamily) {
        captureCurrentDraft(node);
        node.__ultraEditorDraftLastModelByFamily ||= Object.create(null);
        node.__ultraEditorDraftLastModelByFamily[oldFamily] = node.__ultraEditorCurrentDiffusion;
      }
      const ret = callback?.call(this, next, ...args);
      if (next !== oldFamily) restore(node, next);
      trackActiveProfile(node);
      syncNativeWidgets(node);
      schedule(node);
      return ret;
    };
  }
  const resolution = widget(node, "resolution_mode");
  if (resolution) {
    const callback = resolution.callback;
    resolution.callback = function(value, ...args) {
      const ret = callback?.call(this, value, ...args);
      syncNativeWidgets(node);
      return ret;
    };
  }
  const diffusion = widget(node, "diffusion_model");
  if (diffusion) {
    const callback = diffusion.callback;
    diffusion.callback = function(value, ...args) {
      const currentFamily = model(node);
      const selectedModel = String(value || widget(node, "diffusion_model")?.value || "");
      const previousModel = node.__ultraEditorCurrentDiffusion || "";
      if (selectedModel !== previousModel) captureCurrentDraft(node);
      const result = callback?.call(this, value, ...args);
      if (selectedModel !== previousModel && !loadSavedModelProfile(node, currentFamily, selectedModel)) {
        applyModelDefaults(node, currentFamily, selectedModel);
        // Same-family BF16/FP8 variants often share compatible LoRA files.
        // Preserve LoRAs for a new unsaved model in that family; a saved/draft
        // profile for a model still replaces the list with its own rows.
      }
      trackActiveProfile(node);
      syncNativeWidgets(node);
      return result;
    };
  }
  const steps = widget(node, "steps");
  if (steps) {
    const callback = steps.callback;
    steps.callback = function(value, ...args) {
      const ret = callback?.call(this, value, ...args);
      localizeNode(node); // Tooltip switches between Turbo manual and KSampler.
      return ret;
    };
  }
  const pid = widget(node, "pid_upscale");
  if (pid) {
    const callback = pid.callback;
    pid.callback = function(value, ...args) {
      const ret = callback?.call(this, value, ...args);
      syncNativeWidgets(node);
      return ret;
    };
  }
}


function selectedExecutionScope(graph, options) {
  const chosen = Array.isArray(options) ? options : options?.queueNodeIds;
  if (!Array.isArray(chosen)) return null;
  const byId = new Map();
  walkGraphNodes(graph, (node, owner, path, active, prefix) => {
    if (path) byId.set(path, { node, owner, prefix });
  });
  const scope = new Set();
  const pending = chosen.map(String);
  while (pending.length && scope.size < 10000) {
    const id = pending.pop();
    if (scope.has(id)) continue;
    scope.add(id);
    const record = byId.get(id);
    if (!record) continue;
    const { node, owner, prefix } = record;
    // When a subgraph container is the selected dependency, conservatively
    // include its nested executable graph. For selected internal execution IDs,
    // only traverse the matching upstream path (e.g. 5:12 -> 5:8).
    if (node.subgraph) {
      walkGraphNodes(node.subgraph, (_inner, _g, nested) => {
        pending.push(id + ":" + nested);
      });
    }
    for (const input of node.inputs || []) {
      if (input?.link == null) continue;
      const link = owner?.links instanceof Map
        ? owner.links.get(input.link) : owner?.links?.[input.link];
      const originId = Array.isArray(link) ? link[1] : link?.origin_id;
      if (originId != null) {
        const origin = prefix ? `${prefix}:${originId}` : String(originId);
        if (!scope.has(origin)) pending.push(origin);
      }
    }
  }
  return scope;
}
let queueHookInstalled = false;
function installQueueSaveHook() {
  if (queueHookInstalled || typeof app?.queuePrompt !== "function") return;
  const original = app.queuePrompt.bind(app);
  app.queuePrompt = async function ultraEditorQueuePrompt(...args) {
    let pending = [];
    try {
      const selected = selectedExecutionScope(app.graph, args[2]);
      forEachEditorNode((node, _graph, path, active) => {
        if (active && (selected === null || selected.has(path))) {
          const snapshot = profileSnapshot(node);
          if (snapshot) pending.push({ node, snapshot });
        }
      });
    } catch {}
    const result = await original(...args);
    if (result !== false) {
      try {
        for (const entry of pending) commitProfileSnapshot(entry.node, entry.snapshot);
      } catch {}
    }
    return result;
  };
  queueHookInstalled = true;
}
app.registerExtension({
  name: "Ultra.ImageEditor.CoreUI",
  setup() { installLocale(); installLegacyMenu(); installQueueSaveHook(); },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== NODE && nodeType?.comfyClass !== NODE) return;
    exposeOnlyFirstImageSocket(nodeData);
    installInitialPromptHeight(nodeType);
    const prevConfigure = nodeType.prototype.configure;
    const prevConnections = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.configure = function ultraEditorConfigure(info) {
      this.__ultraEditorLoading = true;
      this.serialize_widgets = true;
      this.__ultraEditorSyncSeq = (this.__ultraEditorSyncSeq || 0) + 1;
      const saved = Array.isArray(info?.widgets_values) ? info.widgets_values : [];
      removeLoraWidgets(this);
      const standardWidgets = (this.widgets || []).filter(w => w?.serialize !== false);
      const standardCount = standardWidgets.length;
      // Current schema only: reject malformed standard widget positions instead
      // of putting a LoRA object into a COMBO/BOOLEAN slot. Do not migrate or
      // reorder values from unsupported earlier workflow formats.
      const normalValues = saved.slice(0, standardCount);
      const malformed = normalValues.some(v => v && typeof v === "object" && !Array.isArray(v))
        || !isCurrentWidgetLayout(standardWidgets, normalValues, info?.properties);
      if (malformed) {
        prepareSafeAssetPlaceholders(this);
        // Don't guess offsets or migrate unsupported workflows. Applying
        // shifted strings/numbers causes silent prompt and resolution damage.
        normalValues.splice(0, normalValues.length, ...standardWidgets.map(safeWidgetDefault));
        nonblockingNotice("Unsupported or shifted Ultra Image Editor widget schema. Widget values were reset safely; recreate this node if necessary.",
                          "Ultra Image Editor 위젯 순서/스키마가 호환되지 않습니다. 잘못된 값 대신 기본값으로 초기화했습니다. 필요하면 노드를 새로 배치하세요.");
      }
      let result;
      try {
        result = prevConfigure?.call(this, { ...info, widgets_values: normalValues });
        if (malformed) {
          const missing = selectSafeAssets(this, model(this));
          if (missing.length) nonblockingNotice(
            `No compatible installed Qwen assets for: ${missing.join(", ")}. Select those files before running.`,
            `호환되는 Qwen 모델 파일이 없습니다: ${missing.join(", ")}. 실행 전에 직접 선택하세요.`);
        }
        replaceLoras(this, malformed ? [] : restoreLorasFromValues(saved.slice(standardCount)));
      } finally {
        this.__ultraEditorLoading = false;
      }
      this.__ultraEditorDraftByModel = Object.create(null);
      this.__ultraEditorDraftLastModelByFamily = Object.create(null);
      if (malformed) {
        delete this.properties?.ultraEditorByModel;
        delete this.properties?.ultraEditorLastModelByFamily;
      }
      this.properties ||= {};
      this.properties[WIDGET_SCHEMA_PROPERTY] = WIDGET_SCHEMA_VERSION;
      pruneRetiredFamilySettings(this);
      attachHooks(this);
      this.__ultraEditorPendingTarget = true;
      trackActiveProfile(this);
      syncNativeWidgets(this);
      schedule(this);
      return result;
    };
    nodeType.prototype.onConnectionsChange = function ultraEditorConnections(...args) {
      const result = prevConnections?.apply(this, args);
      schedule(this);
      return result;
    };
  },
  nodeCreated(node) {
    if (!isOurNode(node)) return;
    installLocale(); installLegacyMenu();
    node.serialize_widgets = true;
    pruneRetiredFamilySettings(node);
    node.properties ||= {};
    node.properties[WIDGET_SCHEMA_PROPERTY] = WIDGET_SCHEMA_VERSION;
    attachHooks(node);
    trackActiveProfile(node);
    ensureAddLora(node);
    syncNativeWidgets(node);
    if (!app.configuringGraph && !node.__ultraEditorLoading) schedule(node);
  },
  getNodeMenuItems(node) {
    if (!isOurNode(node)) return [];
    const row = rowAtPointer(node);
    return row ? rowMenu(node, row) : loraFallbackMenu(node);
  },
  loadedGraphNode(node) {
    if (!isOurNode(node)) return;
    installLocale(); installLegacyMenu();
    node.serialize_widgets = true;
    pruneRetiredFamilySettings(node);
    attachHooks(node);
    ensureAddLora(node);
    trackActiveProfile(node);
    syncNativeWidgets(node);
    schedule(node);
  },
});
