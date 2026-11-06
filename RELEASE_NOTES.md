# Ultra Qwen Image Editor + PiD v1.0.3

**Qwen 2511·2.1/Turbo 다중 이미지 편집 커스텀 노드 / A standalone ComfyUI multi-reference image editor for Qwen.**

Supports **Qwen Image Edit 2511** and **Qwen Image 2.1 Base/Turbo** with numbered references, target-image selection, built-in positive/negative prompts, configurable resolution, multi-LoRA support, and per-model settings recall.

### What's new in v1.0.3 / 1.0.3 변경 사항
- Saved workflows now record this pack's Registry ID (`cnr_id`) on its nodes, so ComfyUI names this pack instead of "Unknown pack" when the workflow is opened without the pack installed. Node behaviour is unchanged. / 워크플로를 저장할 때 이 노드 팩의 레지스트리 ID(`cnr_id`)를 노드 정보에 함께 기록합니다. 노드 팩이 없는 환경에서 워크플로를 열면 '알 수 없는 팩' 대신 이 팩 이름과 설치 버튼이 표시됩니다. 노드 기능은 이전 버전과 같습니다.

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

**ZIP:** Download `comfyui-Ultra-Qwen-Image-Editor_v1.0.3.zip` below and extract it directly into `ComfyUI/custom_nodes/`.

**Important:** Remove the older `comfyui-Ultra-Image-Editor` folder first to avoid duplicate extension registration. Restart ComfyUI after installation. Install compatible Qwen model assets separately.

See the [README](https://github.com/Yamoon-jjang/comfyui-Ultra-Qwen-Image-Editor#readme) and included Korean/English manuals.

**Note:** PiD is not available for Qwen Image 2.1. Real model and GPU performance depend on your ComfyUI setup.
