# Ultra Qwen Image Editor + PiD v1.0.2

**Qwen 2511·2.1/Turbo 다중 이미지 편집 커스텀 노드 / A standalone ComfyUI multi-reference image editor for Qwen.**

Supports **Qwen Image Edit 2511** and **Qwen Image 2.1 Base/Turbo** with numbered references, target-image selection, built-in positive/negative prompts, configurable resolution, multi-LoRA support, and per-model settings recall.

### What's new in v1.0.2 / 1.0.2 변경 사항
- Comfy Registry security-scan fix: one JavaScript function-wrapping call in the queue hook was rewritten in an equivalent form, because the registry's automated scanner misread it as a network operation (false positive). No functional change. / Comfy 레지스트리 자동 보안 검사가 큐 실행 훅의 자바스크립트 함수 호출 한 곳을 네트워크 동작으로 잘못 판정해 보류(Flagged)된 문제를 같은 동작의 코드로 바꿔 해결했습니다. 기능 변화는 없습니다.

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

**ZIP:** Download `comfyui-Ultra-Qwen-Image-Editor_v1.0.2.zip` below and extract it directly into `ComfyUI/custom_nodes/`.

**Important:** Remove the older `comfyui-Ultra-Image-Editor` folder first to avoid duplicate extension registration. Restart ComfyUI after installation. Install compatible Qwen model assets separately.

See the [README](https://github.com/Yamoon-jjang/comfyui-Ultra-Qwen-Image-Editor#readme) and included Korean/English manuals.

**Note:** PiD is not available for Qwen Image 2.1. Real model and GPU performance depend on your ComfyUI setup.
