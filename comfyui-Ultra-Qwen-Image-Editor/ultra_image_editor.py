"""Ultra Qwen Image Editor + PiD — local ComfyUI core-node orchestration.

Qwen-only native ComfyUI node with dynamic IMAGE sockets, built-in
positive/negative prompts, target-image selection, per-family LoRA rows,
optional PiD upscale, and auto/custom dimensions.
"""
from __future__ import annotations

import importlib
import math
import os
import re
import threading

import comfy.samplers
import folder_paths
import nodes

FAMILIES = ("Qwen Image Edit 2511", "Qwen Image 2.1")
CAPS = {
    "Qwen Image Edit 2511": 3,
    "Qwen Image 2.1": 10,
}
PID_SPACE = {
    "Qwen Image Edit 2511": "qwenimage",
    "Qwen Image 2.1": None,
}
NONE = "<select installed model>"
PID_AUTO = "<auto select PiD>"
MAX_DIM = 8192
AUTO_PIXELS = 1024 * 1024
# Stable serialization tokens. Size is an approximate pixel budget, not a
# hard output cap: Qwen 2.1 rounds each axis to 32px independently.
RESOLUTION_PIXELS = {
    "auto_1mp": AUTO_PIXELS,
    "0.5MP": AUTO_PIXELS // 2,
    "1.5MP": AUTO_PIXELS * 3 // 2,
    "2MP": AUTO_PIXELS * 2,
}
RESOLUTION_MODES = (*RESOLUTION_PIXELS, "original", "custom")

# One entry per role; all asset roles share a conservative admission-only RAM budget.
# ComfyUI controls GPU/VRAM residency; this cache only retains original loader
# objects and never caches LoRA-patched models, conditioning or sampling state.
# File sizes are estimates, *not* measured Python/torch memory usage.
_ASSET_CACHE = {}
_ASSET_CACHE_LOCK = threading.RLock()
_CACHE_HARD_LIMIT = 40 * 1024 ** 3  # Upper bound even on very large machines.
_CACHE_FALLBACK_LIMIT = 12 * 1024 ** 3  # RAM-stat unavailable: be conservative.
QWEN21_TURBO_SIGMAS = "1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0"
PID_TEXT_ENCODER_NAMES = (
    "gemma_2_2b_it_elm_fp8_scaled.safetensors",
    "gemma_2_2b_it_elm_bf16.safetensors",
)
PID_PREFIX = re.compile(
    r"(?:^|[/._\-\s])(?:pid|pixeldit)(?=$|[/._\-\s\d]|qwenimage|upscale|model)", re.I
)
REF_PATTERN = re.compile(
    r"(?<![\w])(?P<before><\s*|@)?(?P<name>image|picture)(?P<gap>[\s_]*)"
    r"(?P<n>\d{1,2})(?P<after>\s*>)?(?![A-Za-z0-9_])",
    re.I,
)
# Korean references: accept explicit slots followed by a Korean particle,
# ordinal (번/번째), separator, or sentence end. Do NOT treat quantity units
# (배/매/초/장/개/픽셀 etc.) as image identifiers. The list is deliberately
# affirmative rather than an impossible-to-complete blacklist of units.
_KOREAN_REFERENCE_TAIL = (
    # Accept explicit particles/ordinals and delimiters. A space by itself is
    # ambiguous ("이미지 1 옷" / "사진 2 장"); check spaced counters separately.
    r"(?=[ \t\r\n]|$|[.,!?;:()\[\]{}<>/\\~…‘’“”]"
    r"|(?:에서|에게|한테|으로|부터|까지|보다|처럼|하고|께서|마다|조차|마저|끼리|대로|밖에|"
    r"의|을|를|에|와|과|은|는|이|가|도|만|로|랑|께|나))"
)
KOREAN_REF_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_가-힣])(?:"
    r"(?P<name>이미지|사진|그림)(?P<gap>[ \t]*)(?P<n>\d{1,2})"
    r"(?P<ordinal>[ \t]*(?:번째|번))?" + _KOREAN_REFERENCE_TAIL +
    r"|(?P<before_n>\d{1,2})(?P<between>[ \t]*)(?P<before_ordinal>번|번째)"
    r"(?P<after_ordinal>[ \t]*)(?P<reversed_name>이미지|사진|그림)"
    r")(?![A-Za-z0-9_])"
)


class _AnyType(str):
    def __ne__(self, other):
        return False


class _FlexibleOptionalInputs(dict):
    """Allow dynamic lora_N widgets while keeping fixed IMAGE validation."""

    def __init__(self, fixed):
        super().__init__(fixed)
        self.fixed = fixed

    def __contains__(self, key):
        return key in self.fixed or bool(re.fullmatch(r"lora_\d+", str(key)))

    def __getitem__(self, key):
        if key in self.fixed:
            return self.fixed[key]
        if re.fullmatch(r"lora_\d+", str(key)):
            return (_AnyType("*"),)
        raise KeyError(key)


def _collect_loras(values):
    parsed = []
    for at, (key, item) in enumerate(values.items()):
        if not re.fullmatch(r"lora_\d+", str(key)) or not isinstance(item, dict):
            continue
        if item.get("on", True) is False:
            continue
        name = str(item.get("lora") or "").strip()
        if not name or name.lower() == "none":
            continue
        try:
            strength = float(item.get("strength", 1.0))
        except (ValueError, TypeError) as exc:
            raise ValueError(f"LoRA '{name}' 강도가 숫자가 아닙니다.") from exc
        if not math.isfinite(strength) or abs(strength) > 100:
            raise ValueError(f"LoRA '{name}' 강도는 유한한 -100~100 값이어야 합니다.")
        if strength == 0:
            continue
        if name not in folder_paths.get_filename_list("loras"):
            raise ValueError(f"LoRA 파일을 찾을 수 없습니다: {name}")
        order = item.get("order")
        try:
            rank = int(order) if order is not None else None
        except (ValueError, TypeError):
            rank = None
        parsed.append((rank, at, name, strength))
    if parsed and all(x[0] is not None for x in parsed):
        parsed.sort(key=lambda x: (x[0], x[1]))
    return [(name, strength) for _, _, name, strength in parsed]


def _apply_loras(model, rows):
    for name, strength in rows:
        model = _core("LoraLoaderModelOnly", model=model, lora_name=name, strength_model=strength)[0]
    return model


def _choices(category):
    choices = tuple(folder_paths.get_filename_list(category))
    return choices if choices else (NONE,)


def _out(result):
    if isinstance(result, (tuple, list)):
        return tuple(result)
    for name in ("args", "result"):
        value = getattr(result, name, None)
        if value is not None:
            return tuple(value) if isinstance(value, (tuple, list)) else (value,)
    return (result,)


def _core(name, **kwargs):
    cls = nodes.NODE_CLASS_MAPPINGS.get(name)
    if cls is None:
        raise RuntimeError(f"ComfyUI 코어 노드 '{name}'가 없습니다. ComfyUI를 업데이트하세요.")
    method = getattr(cls, "execute", None)
    if callable(method):
        return _out(method(**kwargs))
    obj = cls()
    fn = getattr(obj, getattr(obj, "FUNCTION", ""), None)
    if fn is None:
        raise RuntimeError(f"ComfyUI 코어 노드 '{name}'의 실행 함수를 찾지 못했습니다.")
    return _out(fn(**kwargs))


def _extra(module, class_name, **kwargs):
    cls = getattr(importlib.import_module(f"comfy_extras.{module}"), class_name)
    fn = getattr(cls, "execute", None)
    if fn is None:
        obj = cls()
        fn = getattr(obj, getattr(obj, "FUNCTION", ""))
    return _out(fn(**kwargs))


def _resize(image, width, height, method="lanczos"):
    if image.ndim != 4 or image.shape[0] != 1 or image.shape[-1] not in (3, 4):
        raise ValueError("각 IMAGE 단자는 RGB/RGBA 이미지 배치 1장만 지원합니다.")
    if (image.shape[2], image.shape[1]) == (width, height):
        return image
    import comfy.utils
    return comfy.utils.common_upscale(image.movedim(-1, 1), width, height, method, "disabled").movedim(1, -1)


def _dimensions(image, family, width, height, resolution_mode="auto_1mp"):
    """Target aspect ratio controls MP presets; custom may choose canvas shape.

    The core Qwen 2.1 encoder performs its own 32px aspect-preserving rounding.
    A custom canvas deliberately permits a different aspect ratio; the source
    reference is fitted/padded, not stretched, before native conditioning.
    """
    source_w, source_h = int(image.shape[2]), int(image.shape[1])
    if min(source_w, source_h) < 16:
        raise ValueError("수정 대상 이미지의 최소 크기는 16px입니다.")
    if resolution_mode not in RESOLUTION_MODES:
        raise ValueError(f"지원되지 않는 해상도 모드: {resolution_mode}")
    multiple = 32 if family == "Qwen Image 2.1" else 16
    manual_w, manual_h = int(width), int(height)
    if manual_w < 0 or manual_h < 0:
        raise ValueError("가로/세로는 0 이상이어야 합니다.")
    if resolution_mode == "custom" and manual_w and manual_h:
        requested_w, requested_h = manual_w, manual_h
    elif resolution_mode == "custom" and manual_w:
        requested_w, requested_h = manual_w, max(16, round(manual_w * source_h / source_w))
    elif resolution_mode == "custom" and manual_h:
        requested_h, requested_w = manual_h, max(16, round(manual_h * source_w / source_h))
    elif resolution_mode == "original":
        requested_w, requested_h = source_w, source_h
    else:
        # When custom dimensions are both zero, fall back to ~1MP while the
        # user chooses a size; all other presets ignore inactive width/height.
        pixels = RESOLUTION_PIXELS.get(resolution_mode, AUTO_PIXELS)
        ratio = source_w / source_h
        requested_w = max(16, round(math.sqrt(pixels * ratio)))
        requested_h = max(16, round(math.sqrt(pixels / ratio)))
    if min(requested_w, requested_h) < 16 or max(requested_w, requested_h) > MAX_DIM:
        raise ValueError("가로/세로는 자동(0) 또는 16~8192px 범위여야 합니다.")
    w = max(multiple, ((requested_w + multiple // 2) // multiple) * multiple)
    h = max(multiple, ((requested_h + multiple // 2) // multiple) * multiple)
    if max(w, h) > MAX_DIM:
        raise ValueError("잠재 공간 배수 정렬 후 해상도 제한을 초과했습니다.")
    return w, h


def _fit_image_to_canvas(image, width, height):
    """Preserve the full source aspect ratio for Qwen2.1 custom canvases.

    Uses native ComfyUI resize, then edge-replicated padding. Never stretch,
    crop, overwrite the original tensor, or modify unrelated references.
    """
    iw, ih = int(image.shape[2]), int(image.shape[1])
    if (iw, ih) == (width, height):
        return image
    ratio = min(width / iw, height / ih)
    fit_w = min(width, max(1, round(iw * ratio)))
    fit_h = min(height, max(1, round(ih * ratio)))
    fitted = _resize(image, fit_w, fit_h)
    if (fit_w, fit_h) == (width, height):
        return fitted
    import torch.nn.functional as F
    left, top = (width - fit_w) // 2, (height - fit_h) // 2
    return F.pad(fitted.movedim(-1, 1),
                 (left, width - fit_w - left, top, height - fit_h - top),
                 mode="replicate").movedim(1, -1)

def _connected(images, family, target):
    max_count = CAPS[family]
    present = []
    for i in range(1, 11):
        v = images.get(f"image{i}")
        if v is not None:
            if i > max_count:
                raise ValueError(f"{family}: 최대 {max_count}장만 연결할 수 있습니다. image{i}를 해제하세요.")
            present.append(i)
    if not present:
        raise ValueError("이미지가 연결되지 않았습니다. image1에 편집할 이미지를 연결하세요.")
    if present != list(range(1, len(present) + 1)):
        raise ValueError("IMAGE는 image1부터 빈 번호 없이 순서대로 연결하세요. 번호를 자동 변경하지 않았습니다.")
    target_id = 1 if len(present) == 1 or target == "auto" else int(str(target).replace("image", ""))
    if target_id not in present:
        raise ValueError(f"수정 대상 {target}이 연결되지 않았습니다.")
    for i in present:
        v = images[f"image{i}"]
        if getattr(v, "ndim", 0) != 4 or int(v.shape[0]) != 1 or int(v.shape[-1]) not in (3, 4):
            raise ValueError(f"image{i}: IMAGE 배치 1장, RGB/RGBA 형식만 지원합니다.")
    ordering = [target_id] + [i for i in present if i != target_id]
    return present, target_id, ordering


def _rewrite_prompt(text, connected_indices, ordering):
    """Renumber only references to connected input slots, retaining syntax.

    The target is always encoder Picture 1. English and Korean references must
    follow that same ordering; stray numbers and unconnected references remain
    ordinary text. A quantity such as "사진 2장" must not become "사진 1장".
    """
    mapping = {old: new for new, old in enumerate(ordering, 1)}
    original = str(text or "")

    def sub_english(match):
        # "picture 4 people" is ordinary English, not a numbered image slot.
        # Explicit picture4, picture_4, <picture 4> remain supported.
        if (match.group("name").lower() == "picture"
                and match.group("gap").isspace()
                and not match.group("before") and not match.group("after")
                and not original[match.end():].lstrip().startswith(":")):
            return match.group(0)
        n = int(match.group("n"))
        if n not in mapping:
            return match.group(0)
        return (f'{match.group("before") or ""}{match.group("name")}'
                f'{match.group("gap")}{mapping[n]}{match.group("after") or ""}')

    def sub_korean(match):
        # Only a separated unit needs an extra ambiguity check: "사진 2 장"
        # otherwise resembles "이미지 1 옷" because both contain a space.
        # Attached units (2배/2매/2초/2개/2장) already fail the whitelist.
        if match.group("n") is not None and not match.group("ordinal"):
            suffix = original[match.end():]
            if re.match(r"[ \t]+(?:배|매|초|장|개|명|분|픽셀|px)(?=$|[ \t\r\n,.!?;:])", suffix, re.I):
                return match.group(0)
        n = int(match.group("n") or match.group("before_n"))
        if n not in mapping:
            return match.group(0)
        if match.group("n") is not None:
            return (f'{match.group("name")}{match.group("gap")}'
                    f'{mapping[n]}{match.group("ordinal") or ""}')
        return (f'{mapping[n]}{match.group("between")}'
                f'{match.group("before_ordinal")}{match.group("after_ordinal")}'
                f'{match.group("reversed_name")}')

    return KOREAN_REF_PATTERN.sub(sub_korean, REF_PATTERN.sub(sub_english, original))


def _validate_family_files(family, encoder_name, vae_name, model_name=None):
    """Fail on unambiguous wrong family files; permit custom neutral aliases."""
    te = str(encoder_name).replace("\\", "/").lower()
    vae = str(vae_name).replace("\\", "/").lower()
    filename = str(model_name or "").replace("\\", "/").rsplit("/", 1)[-1].lower()
    # Only reject explicit known mismatch markers in the actual filename.
    # Arbitrarily named compatible fine-tunes remain allowed.
    is_21 = bool(re.search(r"qwen(?:[_ .-]*image)?[_ .-]*(?:2[._-]?1|21)(?![0-9])", filename))
    is_2511 = bool(re.search(r"qwen.*(?:edit.*2511|2511.*edit)|qedit.*2511", filename))
    unrelated = bool(re.search(r"(?:^|[_ .-])(?:flux(?:1|2)?|sdxl|hunyuan|wan2?[._-]?\d*|z[_-]?image)(?:[_ .-]|$)", filename))
    # The explicitly named 2512 Qwen Image text-to-image checkpoint is not an
    # image editor for either supported family. Do not block neutral aliases.
    t2i_2512 = bool(re.search(r"qwen[_ .-]*image[_ .-]*2512(?![0-9])", filename) and "edit" not in filename)
    if unrelated or t2i_2512 or (family == "Qwen Image Edit 2511" and is_21) or (family == "Qwen Image 2.1" and is_2511):
        raise ValueError(f"선택한 확산 모델 파일이 {family} 계열과 맞지 않습니다: {model_name}")
    if family == "Qwen Image Edit 2511":
        if re.search(r"qwen[_-]?3(?:[_-]|\d|$)", te) or "qwen3vl" in te or "qwen3-vl" in te:
            raise ValueError("Qwen Edit 2511에는 Qwen 2.5 VL 7B 계열 텍스트 인코더를 선택하세요 (Qwen3 인코더 아님).")
        if re.search(r"qwen[_-]?image[_-]?(?:2[._-]?1|21)[_-]?vae", vae):
            raise ValueError("Qwen Edit 2511에는 Qwen Image VAE를 선택하세요 (Qwen 2.1 VAE 아님).")
    elif family == "Qwen Image 2.1":
        if "qwen_2.5_vl" in te or "qwen-2.5-vl" in te or "qwen2.5vl" in te:
            raise ValueError("Qwen Image 2.1에는 Qwen3 VL 호환 텍스트 인코더를 선택하세요.")
        if re.search(r"qwen[_-]?image[_-]?vae(?:[_-]|\.|$)", vae):
            raise ValueError("Qwen Image 2.1에는 Qwen 2.1 전용 VAE를 선택하세요.")


def _asset_key(folder, name, kind):
    """Key on an actual file identity, not a GUI combo string alone."""
    path = folder_paths.get_full_path_or_raise(folder, name)
    stat = os.stat(path)
    return kind, os.path.normcase(os.path.realpath(path)), stat.st_size, stat.st_mtime_ns


def _cache_ram_budget():
    """Conservative system-RAM budget, never a GPU memory reservation.

    A new model stays uncached if available RAM is too tight. psutil is
    optional; a low fixed bound is used when memory statistics are unavailable.
    The sum of file sizes is an approximation, so leave ample RAM headroom.
    """
    try:
        import psutil
        memory = psutil.virtual_memory()
        physical, available = int(memory.total), int(memory.available)
    except (ImportError, AttributeError, OSError, ValueError):
        return _CACHE_FALLBACK_LIMIT
    retained = sum(item[0][2] for item in _ASSET_CACHE.values())
    return max(0, min(_CACHE_HARD_LIMIT, physical // 2, int(available * 0.70) + retained))


def _cached_loader(kind, folder, filename, call, *, reuse_assets=True):
    if not reuse_assets:
        # Explicit opt-out releases strong references retained by this node.
        with _ASSET_CACHE_LOCK:
            _ASSET_CACHE.clear()
        return call()
    key = _asset_key(folder, filename, kind)
    with _ASSET_CACHE_LOCK:
        entry = _ASSET_CACHE.get(kind)
        if entry is not None and entry[0] == key:
            return entry[1]
        # Drop only the stale asset role, not other model families' cache entries.
        _ASSET_CACHE.pop(kind, None)
        budget = _cache_ram_budget()
        estimate = key[2]  # safetensors on-disk size, not the actual RAM footprint
        if estimate > budget:
            # Allow ComfyUI to run, without pinning oversized assets in this cache.
            return call()
        # Admission-only cache: never evict an already useful base model to
        # admit a PiD asset that would exceed the conservative RAM budget.
        # Sequential workflows load base -> encoder -> VAE -> PiD -> Gemma.
        # Evicting LRU under a too-small budget thrashes *every* item on each
        # subsequent run. An oversized new asset still loads for this run,
        # but does not retain another long-lived strong reference here.
        retained = sum(item[0][2] for item in _ASSET_CACHE.values())
        if retained + estimate > budget:
            return call()
        # Never retain failed/incomplete loader results. On success, one role
        # entry holds the original asset; ModelOnly LoRAs operate on clones.
        result = call()
        _ASSET_CACHE[kind] = (key, result)
        return result


def _load_model_assets(model_name, encoder_name, vae_name, family=None, reuse_assets=True):
    for name, field, folder in (
        (model_name, "diffusion model", "diffusion_models"),
        (encoder_name, "text encoder", "text_encoders"),
        (vae_name, "VAE", "vae"),
    ):
        if not name or name == NONE or name not in folder_paths.get_filename_list(folder):
            raise ValueError(f"{field}: 설치된 모델을 정확히 선택하세요: {name}")
    if family is not None:
        _validate_family_files(family, encoder_name, vae_name, model_name)
    model = _cached_loader("main_model", "diffusion_models", model_name,
        lambda: _core("UNETLoader", unet_name=model_name, weight_dtype="default")[0], reuse_assets=reuse_assets)
    clip = _cached_loader("main_clip", "text_encoders", encoder_name,
        lambda: _core("CLIPLoader", clip_name=encoder_name, type="qwen_image", device="default")[0], reuse_assets=reuse_assets)
    vae = _cached_loader("main_vae", "vae", vae_name,
        lambda: _core("VAELoader", vae_name=vae_name)[0], reuse_assets=reuse_assets)
    return model, clip, vae

def _zero(conditioning):
    return _core("ConditioningZeroOut", conditioning=conditioning)[0]


def _empty(w, h):
    return _core("EmptySD3LatentImage", width=w, height=h, batch_size=1)[0]


def _manual_sigmas_sample(model, positive, negative, latent, seed, cfg, sampler, text):
    sigmas = _core("ManualSigmas", sigmas=text)[0]
    noise = _core("RandomNoise", noise_seed=seed)[0]
    sampler_obj = _core("KSamplerSelect", sampler_name=sampler)[0]
    guider = _core("CFGGuider", model=model, positive=positive, negative=negative, cfg=cfg)[0]
    return _core(
        "SamplerCustomAdvanced",
        noise=noise,
        guider=guider,
        sampler=sampler_obj,
        sigmas=sigmas,
        latent_image=latent,
    )[0]


def _regular_sample(model, positive, negative, latent, seed, steps, cfg, sampler, scheduler):
    return _core(
        "KSampler",
        model=model,
        seed=seed,
        steps=steps,
        cfg=cfg,
        sampler_name=sampler,
        scheduler=scheduler,
        positive=positive,
        negative=negative,
        latent_image=latent,
        denoise=1.0,
    )[0]


def _pid_files():
    # Only Qwen-Image latent-compatible PiD files belong in this Qwen-only UI.
    # FLUX PiD models are deliberately absent from the dropdown as well as
    # from execution paths, avoiding a misleading selectable-but-invalid file.
    choices = []
    for name in folder_paths.get_filename_list("diffusion_models"):
        normalized = name.lower().replace("\\", "/")
        if not PID_PREFIX.search(normalized):
            continue
        if not re.search(r"(?:^|[/._\-])qwenimage(?:$|[/._\-\d])", normalized):
            continue
        if re.search(r"qwen[-_ ]?image[-_ .]?2[._-]?1(?!\d)", normalized):
            continue
        choices.append(name)
    return choices


def _pid_target_model(family, candidate):
    if PID_SPACE[family] is None:
        raise ValueError("Qwen Image 2.1은 PiD 비활성화 모델입니다.")
    choices = [
        name
        for name in _pid_files()
        if re.search(r"(?:^|[/._\-])qwenimage(?:$|[/._\-\d])", name.lower().replace("\\", "/"))
    ]
    choices = [n for n in choices if not re.search(r"qwen[-_ ]?image[-_ .]?2[._-]?1(?!\d)", n, re.I)]
    if not choices:
        raise ValueError("PiD 체크포인트 qwenimage 계열이 설치되어 있지 않습니다.")
    if candidate == PID_AUTO:
        preferred = sorted(choices, key=lambda n: ("1024_to_4096" not in n, "4step" not in n, "bf16" not in n, n))
        return preferred[0]
    if candidate not in choices:
        raise ValueError(f"PiD 체크포인트가 qwenimage latent와 맞지 않습니다: {candidate}")
    return candidate


def _pid_clip_name():
    names = folder_paths.get_filename_list("text_encoders")
    for preferred in PID_TEXT_ENCODER_NAMES:
        if preferred in names:
            return preferred
    found = [n for n in names if "gemma_2_2b_it_elm" in n.lower()]
    if found:
        return sorted(found)[0]
    raise ValueError("PiD용 Gemma 2 ELM 텍스트 인코더가 필요합니다.")


def _pid_upscale(latent, prompt, family, model_name, seed, sampler, scheduler, steps, scale, width, height, reuse_assets=True):
    if max(width, height) * 4 > MAX_DIM:
        raise ValueError(f"PiD x4 내부 처리 크기가 {MAX_DIM}px 제한을 초과합니다.")
    actual_channels = int(latent["samples"].shape[1])
    if actual_channels != 16:
        raise ValueError(
            f"PiD latent 채널 불일치: {actual_channels}, expected 16. 올바른 Qwen 모델 및 VAE를 선택하세요."
        )
    pmodel = _pid_target_model(family, model_name)
    pclip = _pid_clip_name()
    model = _cached_loader("pid_model", "diffusion_models", pmodel,
        lambda: _core("UNETLoader", unet_name=pmodel, weight_dtype="default")[0], reuse_assets=reuse_assets)
    dim = 3 if width > height else 2
    model = _extra(
        "nodes_context_windows",
        "ContextWindowsManualNode",
        model=model,
        context_length=2048,
        context_overlap=512,
        context_schedule="standard_static",
        context_stride=1,
        closed_loop=False,
        fuse_method="pyramid",
        dim=dim,
        freenoise=False,
        cond_retain_index_list="",
        split_conds_to_windows=False,
        latent_retain_index_list="",
        causal_window_fix=False,
    )[0]
    clip = _cached_loader("pid_clip", "text_encoders", pclip,
        lambda: _core("CLIPLoader", clip_name=pclip, type="pixeldit", device="default")[0], reuse_assets=reuse_assets)
    # pixel_space is a lightweight synthetic VAE, no disk caching required.
    pvae = _core("VAELoader", vae_name="pixel_space")[0]
    ptext = _core("CLIPTextEncode", clip=clip, text=prompt)[0]
    negative = _zero(ptext)
    positive = _extra(
        "nodes_pid",
        "PiDConditioning",
        positive=ptext,
        latent=latent,
        latent_format="qwenimage",
        degrade_sigma=0.0,
    )[0]
    empty = _core("EmptyChromaRadianceLatentImage", width=width * 4, height=height * 4, batch_size=1)[0]
    sampled = _regular_sample(model, positive, negative, empty, seed, steps, 1.0, sampler, scheduler)
    image = _core("VAEDecode", vae=pvae, samples=sampled)[0]
    if scale == "x2":
        image = _resize(image, max(16, round(image.shape[2] / 2)), max(16, round(image.shape[1] / 2)))
    return image


def _pid_color_match(image, original):
    import kornia
    import torch

    if image.shape[-1] < 3 or original.shape[-1] < 3:
        raise ValueError("PiD 색상 정합에는 RGB가 필요합니다.")
    with torch.no_grad():
        source = image[..., :3].to(dtype=torch.float32)
        reference = original[..., :3].to(device=source.device, dtype=torch.float32)
        src_lab = kornia.color.rgb_to_lab(source.permute(0, 3, 1, 2))
        ref_lab = kornia.color.rgb_to_lab(reference.permute(0, 3, 1, 2))
        src_avg = src_lab.mean(dim=(2, 3), keepdim=True)
        ref_avg = ref_lab.mean(dim=(2, 3), keepdim=True)
        src_std = src_lab.std(dim=(2, 3), keepdim=True, unbiased=False).clamp_min(1e-6)
        ref_std = ref_lab.std(dim=(2, 3), keepdim=True, unbiased=False)
        colored = (src_lab - src_avg) * (ref_std / src_std) + ref_avg
        rgb = kornia.color.lab_to_rgb(colored).clamp(0, 1).permute(0, 2, 3, 1)
        return rgb.to(dtype=image.dtype)


def _family_edit(family, model, model_name, clip, vae, images, order, prompt, negative_prompt,
                 width, height, seed, steps, cfg, sampler, scheduler, zero_conditioning, resolution_mode="auto_1mp"):
    target = images[f"image{order[0]}"]
    w, h = _dimensions(target, family, width, height, resolution_mode)
    refs = [images[f"image{i}"] for i in order]

    if family == "Qwen Image Edit 2511":
        # A changed custom canvas aspect must not stretch the subject. The
        # official Edit Plus node subsequently encodes its own ~1MP references.
        if resolution_mode == "custom" and (int(width) or int(height)):
            src_w, src_h = int(refs[0].shape[2]), int(refs[0].shape[1])
            # 16px latent-grid rounding alone can introduce a few pixels of
            # aspect discrepancy. Avoid needless padding for <=12px mismatch.
            if abs(src_w * h - src_h * w) > 12 * max(src_w, src_h):
                refs[0] = _fit_image_to_canvas(refs[0], w, h)
        refs = [r if r.shape[-1] == 3 else r[..., :3] for r in refs]
        kwargs = {f"image{i + 1}": image for i, image in enumerate(refs)}
        positive = _extra("nodes_qwen", "TextEncodeQwenImageEditPlus", clip=clip, prompt=prompt, vae=vae, **kwargs)[0]
        negative = _zero(positive) if zero_conditioning else _extra(
            "nodes_qwen", "TextEncodeQwenImageEditPlus", clip=clip, prompt=negative_prompt, vae=vae, **kwargs
        )[0]
        latent = _empty(w, h)
    else:
        if resolution_mode == "custom" and (int(width) or int(height)):
            refs[0] = _fit_image_to_canvas(refs[0], w, h)
            core_resolution = 0  # Preserve the explicit, padded custom canvas.
        elif resolution_mode == "original":
            core_resolution = 0  # Native core rounds the original to 32px.
        else:
            # Native core resizes every image to approximately resolution²
            # pixels at 32px multiples; preserve each reference aspect ratio.
            pixel_budget = RESOLUTION_PIXELS.get(resolution_mode, AUTO_PIXELS)
            core_resolution = max(32, round(math.sqrt(pixel_budget) / 32) * 32)
        # Both custom and original run with resolution=0. Only the target
        # should retain custom/native resolution: the remaining 1..9 references
        # are bounded to ~1MP to prevent massive Qwen2.1 VAE/KV workloads.
        if core_resolution == 0:
            for i in range(1, len(refs)):
                rw, rh = int(refs[i].shape[2]), int(refs[i].shape[1])
                if rw * rh > AUTO_PIXELS:
                    factor = math.sqrt(AUTO_PIXELS / (rw * rh))
                    bounded_w = max(32, round((rw * factor) / 32) * 32)
                    bounded_h = max(32, round((rh * factor) / 32) * 32)
                    refs[i] = _resize(refs[i], bounded_w, bounded_h)
        positive, negative, latent = _extra(
            "nodes_qwen",
            "TextEncodeQwenImage21",
            clip=clip,
            prompt=prompt,
            negative_prompt=negative_prompt if not zero_conditioning else "",
            vae=vae,
            resolution=core_resolution,
            images={f"image_{i + 1}": ref for i, ref in enumerate(refs)},
        )
        if zero_conditioning:
            negative = _zero(negative)
        w, h = int(latent["samples"].shape[3]) * 16, int(latent["samples"].shape[2]) * 16

    turbo_mode = family == "Qwen Image 2.1" and "turbo" in str(model_name).lower().replace("\\", "/").split("/")[-1]
    if turbo_mode and int(steps) == 8:
        sampled = _manual_sigmas_sample(model, positive, negative, latent, seed, cfg, sampler, QWEN21_TURBO_SIGMAS)
    else:
        sampled = _regular_sample(model, positive, negative, latent, seed, steps, cfg, sampler, scheduler)
    image = _core("VAEDecode", vae=vae, samples=sampled)[0]
    return image, sampled, w, h


class UltraImageEditorPiD:
    CATEGORY = "Ultra/Image"
    FUNCTION = "edit"
    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("Edited Image", "PiD Image")
    OUTPUT_NODE = False
    DESCRIPTION = "Native Qwen image editor (2511 / 2.1). image1..N are numbered references; Edit Target selects the photo to modify.\nQwen 이미지 편집기. 수정 대상 이미지를 선택하고 프롬프트로 편집합니다."

    @classmethod
    def INPUT_TYPES(cls):
        samplers = tuple(comfy.samplers.KSampler.SAMPLERS)
        schedulers = tuple(comfy.samplers.KSampler.SCHEDULERS)
        specs = {
            "required": {
                "model_family": (FAMILIES,),
                "diffusion_model": (_choices("diffusion_models"),),
                "text_encoder": (_choices("text_encoders"),),
                "vae_name": (_choices("vae"),),
                "positive_text": ("STRING", {"multiline": True, "default": "", "tooltip": "Edit instruction. Direct Qwen image1/image2 references and Prompt Selecter output work without conversion."}),
                "negative_text": ("STRING", {"multiline": True, "default": "", "tooltip": "Negative prompt; when Zero Conditioning is ON the model's unconditional branch is used instead."}),
                "edit_target": (("auto",) + tuple(f"image{i}" for i in range(1, 11)),
                                {"default": "auto", "tooltip": "auto uses image1. Select a connected imageN to edit a different image."}),
                "resolution_mode": (RESOLUTION_MODES, {"default": "auto_1mp", "tooltip": "Preserve the edit target aspect ratio: Auto ~1MP / 0.5MP / 1.5MP / 2MP / Original. Custom enables Width/Height and fits the source into a padded canvas when the aspect ratio changes."}),
                "width": ("INT", {"default": 0, "min": 0, "max": MAX_DIM, "step": 16, "tooltip": "Used only in Custom resolution mode. 0 = derive width from the target image aspect ratio.", "hidden": True}),
                "height": ("INT", {"default": 0, "min": 0, "max": MAX_DIM, "step": 16, "tooltip": "Used only in Custom resolution mode. 0 = derive height from the target image aspect ratio.", "hidden": True}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "control_after_generate": True}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 1000}),
                "cfg": ("FLOAT", {"default": 4.0, "min": 0, "max": 50, "step": 0.1}),
                "sampler_name": (samplers, {"default": "euler" if "euler" in samplers else samplers[0]}),
                "scheduler": (schedulers, {"default": "simple" if "simple" in schedulers else schedulers[0]}),
                "zero_conditioning": ("BOOLEAN", {"default": False, "label_on": "ON", "label_off": "OFF", "tooltip": "ON: zero out negative conditioning. OFF: encode local negative prompt. Qwen 2.1 needs CFG > 1 for negatives to affect guidance."}),
                "pid_upscale": ("BOOLEAN", {"default": False, "label_on": "ON", "label_off": "OFF"}),
                "pid_prompt": ("STRING", {"multiline": True, "default": "", "tooltip": "Optional scene description for PiD. Empty uses the edit prompt for compatibility with existing workflows.", "hidden": True}),
                "pid_model": ((PID_AUTO,) + tuple(_pid_files()), {"default": PID_AUTO, "hidden": True}),
                "pid_sampler": (samplers, {"default": "lcm" if "lcm" in samplers else samplers[0], "hidden": True}),
                "pid_scheduler": (schedulers, {"default": "sgm_uniform" if "sgm_uniform" in schedulers else schedulers[0], "hidden": True}),
                "pid_steps": ("INT", {"default": 4, "min": 1, "max": 100, "hidden": True}),
                "pid_scale": (("x4", "x2"), {"default": "x4", "hidden": True}),
                "pid_color_match": ("BOOLEAN", {"default": True, "label_on": "ON", "label_off": "OFF", "tooltip": "PiD output color-match to the edited image (Reinhard Lab).", "hidden": True}),
                "reuse_assets": ("BOOLEAN", {"default": True, "label_on": "ON", "label_off": "OFF", "tooltip": "Reuse one unmodified Qwen model, text encoder and VAE by file identity between renders. Turn OFF to reduce retained system RAM."}),
            },
            "optional": {},
        }
        for i in range(1, 11):
            specs["optional"][f"image{i}"] = ("IMAGE",)
        specs["optional"] = _FlexibleOptionalInputs(specs["optional"])
        return specs

    def edit(self, model_family, diffusion_model, text_encoder, vae_name, edit_target,
             positive_text, negative_text, width, height, seed, steps, cfg, sampler_name,
             scheduler, zero_conditioning, pid_upscale, pid_model, pid_sampler,
             pid_scheduler, pid_steps, pid_scale, pid_color_match=True,
             resolution_mode="auto_1mp", reuse_assets=True, pid_prompt="", **inputs):
        if model_family not in CAPS:
            raise ValueError(f"지원되지 않는 모델 계열: {model_family}")
        images = {key: value for key, value in inputs.items() if re.fullmatch(r"image(?:[1-9]|10)", key)}
        connected, target, ordering = _connected(images, model_family, edit_target)
        lora_rows = _collect_loras(inputs)
        if not str(positive_text or "").strip():
            raise ValueError("긍정 프롬프트가 비어 있습니다. 노드 내부에 편집 지시를 입력하세요.")
        prompt = _rewrite_prompt(positive_text, connected, ordering)
        neg_prompt = _rewrite_prompt(negative_text, connected, ordering)
        if pid_upscale and PID_SPACE[model_family] is None:
            raise ValueError("Qwen Image 2.1은 현재 네이티브 PiD를 지원하지 않습니다. PiD를 OFF로 설정하세요.")
        if pid_upscale:
            _pid_target_model(model_family, pid_model)
            _pid_clip_name()
        _dimensions(images[f"image{ordering[0]}"], model_family, width, height, resolution_mode)
        # Reject oversized PiD before allocating any model weights.
        if pid_upscale:
            preview_w, preview_h = _dimensions(images[f"image{ordering[0]}"], model_family,
                                                width, height, resolution_mode)
            if max(preview_w, preview_h) * 4 > MAX_DIM:
                raise ValueError("PiD x4 내부 처리 크기가 8192px를 넘습니다. 가로/세로를 낮추세요.")
        model, clip, vae = _load_model_assets(diffusion_model, text_encoder, vae_name,
                                               model_family, bool(reuse_assets))
        try:
            model = _apply_loras(model, lora_rows)
        except Exception as exc:
            raise RuntimeError(f"LoRA 적용 실패: {exc}") from exc
        if model_family == "Qwen Image Edit 2511":
            model = _core("ModelSamplingAuraFlow", model=model, shift=3.1)[0]
        try:
            original, sampled, w, h = _family_edit(
                model_family,
                model,
                diffusion_model,
                clip,
                vae,
                images,
                ordering,
                prompt,
                neg_prompt,
                width,
                height,
                int(seed),
                int(steps),
                float(cfg),
                sampler_name,
                scheduler,
                bool(zero_conditioning),
                resolution_mode,
            )
        except Exception as exc:
            raise RuntimeError(f"{model_family} 편집 실행 실패: {exc}") from exc
        if not pid_upscale:
            return original, original
        original = original.cpu()
        del model, clip, vae
        try:
            scaled = _pid_upscale(sampled, str(pid_prompt or "").strip() or prompt, model_family, pid_model,
                                  int(seed), pid_sampler, pid_scheduler, int(pid_steps), pid_scale, w, h,
                                  bool(reuse_assets))
        except Exception as exc:
            raise RuntimeError(f"PiD 업스케일 실행 실패: {exc}") from exc
        if pid_color_match:
            try:
                scaled = _pid_color_match(scaled, original)
            except Exception as exc:
                raise RuntimeError(f"PiD 색상 정합 실패: {exc}") from exc
        return original, scaled


NODE_CLASS_MAPPINGS = {"UltraImageEditorPiD": UltraImageEditorPiD}
NODE_DISPLAY_NAME_MAPPINGS = {"UltraImageEditorPiD": "Ultra Qwen Image Editor + PiD"}
