# Ultra Qwen Image Editor + PiD v1.0.4

**Qwen 2511·2.1/Turbo 다중 이미지 편집 커스텀 노드 / A standalone ComfyUI multi-reference image editor for Qwen.**

Supports **Qwen Image Edit 2511** and **Qwen Image 2.1 Base/Turbo** with numbered references, target-image selection, built-in positive/negative prompts, configurable resolution, multi-LoRA support, and per-model settings recall.

### What's new in v1.0.4 / 1.0.4 변경 사항
- **Executed prompt record:** the node now writes the final positive/negative prompt it actually encoded into the saved image metadata (`ultra_generation_prompts`). Prompts that arrive through a link (translator, LLM, Preview Any, ...) are kept as the real text instead of only the link. Ultra Exif Reader v4.12+ shows it as the Final CLIP prompt. / 번역기·LLM 등을 거쳐 연결선으로 들어온 프롬프트도 노드가 실제로 모델에 넣은 최종 문장을 이미지 메타데이터에 기록합니다. Ultra Exif Reader v4.12 이상에서 Final CLIP 프롬프트로 표시됩니다.
- Cached re-runs keep the record; a failed record never stops generation. Image generation itself is unchanged. / 캐시로 실행이 생략돼도 기록이 유지되며, 기록 실패가 생성을 멈추지 않습니다. 이미지 생성 동작은 바뀌지 않았습니다.

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

**ZIP:** Download `comfyui-Ultra-Qwen-Image-Editor_v1.0.4.zip` below and extract it directly into `ComfyUI/custom_nodes/`.

**Important:** Remove the older `comfyui-Ultra-Image-Editor` folder first to avoid duplicate extension registration. Restart ComfyUI after installation. Install compatible Qwen model assets separately.

See the [README](https://github.com/Yamoon-jjang/comfyui-Ultra-Qwen-Image-Editor#readme) and included Korean/English manuals.

**Note:** PiD is not available for Qwen Image 2.1. Real model and GPU performance depend on your ComfyUI setup.
