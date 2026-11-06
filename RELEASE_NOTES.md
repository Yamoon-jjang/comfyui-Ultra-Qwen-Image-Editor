# Ultra Qwen Image Editor + PiD v1.0.0

**Qwen 2511·2.1/Turbo 다중 이미지 편집 커스텀 노드 / A standalone ComfyUI multi-reference image editor for Qwen.**

Supports **Qwen Image Edit 2511** and **Qwen Image 2.1 Base/Turbo** with numbered references, target-image selection, built-in positive/negative prompts, configurable resolution, multi-LoRA support, and per-model settings recall.

### Key features / 주요 기능
- **Multiple references:** Up to 3 images for Qwen 2511, up to 10 for Qwen 2.1.
- **Flexible sampling:** Turbo uses built-in 8-step sigmas at exactly 8 steps; other steps use KSampler. CFG remains editable.
- **Optional PiD upscaling:** x2/x4 and optional color matching for **Qwen 2511 only**.
- **Model resource reuse:** Optional RAM cache for model assets.
- **Automatic KO/EN UI:** Labels, tooltips, menus and notices follow the ComfyUI locale. / ComfyUI 언어 설정에 따라 한글·영문 UI 자동 전환.
- **Workflow-friendly:** Native ComfyUI node, custom-node LoRA controls, model settings profiles.

### Installation / 설치

**Git:**
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Yamoon-jjang/comfyui-Ultra-Qwen-Image-Editor.git
```

**ZIP:** Download `comfyui-Ultra-Qwen-Image-Editor_v1.0.0.zip` below and extract it directly into `ComfyUI/custom_nodes/`.

**Important:** Remove the older `comfyui-Ultra-Image-Editor` folder first to avoid duplicate extension registration. Restart ComfyUI after installation. Install compatible Qwen model assets separately.

See the [README](https://github.com/Yamoon-jjang/comfyui-Ultra-Qwen-Image-Editor#readme) and included Korean/English manuals.

**Note:** PiD is not available for Qwen Image 2.1. Real model and GPU performance depend on your ComfyUI setup.
