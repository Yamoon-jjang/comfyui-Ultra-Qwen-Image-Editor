# Ultra Qwen Image Editor + PiD v1.0.6

**Qwen 2511·2.1/Turbo·MiniMax H3 Image 다중 이미지 편집 커스텀 노드 / A standalone ComfyUI multi-reference image editor for Qwen and MiniMax H3 Image.**

Supports **Qwen Image Edit 2511**, **Qwen Image 2.1 Base/Turbo** and **MiniMax H3 Image** with numbered references, target-image selection, built-in positive/negative prompts, configurable resolution, multi-LoRA support, and per-model settings recall.

### What's new since v1.0.4 / v1.0.4 이후 변경 사항 (v1.0.6)
- **Supported models / 지원 모델:** Qwen Image Edit 2511 (up to 3 images), Qwen Image 2.1 Base/Turbo (up to 10), and **new: MiniMax H3 Image (up to 16)**. / Qwen Image Edit 2511(최대 3장), Qwen Image 2.1 Base/Turbo(최대 10장), **신규: MiniMax H3 Image(최대 16장)**.
- **MiniMax H3 Image:** edits through the same graph as the official ComfyUI edit workflow (`image_minimax_h3_image_edit`) — native MiniMax H3 Image Conditioning with the VAE and images, zeroed negative, 6 steps / CFG 1 / euler / simple (locked; no PiD). Up to **16** references; references such as `image2` or `이미지 2` become `<Picture N>`. / ComfyUI 공식 편집 워크플로우와 같은 경로로 실행합니다. 6스텝·CFG 1 고정, 참조 최대 16장, 프롬프트의 이미지 참조는 `<Picture N>`으로 자동 변환됩니다.
- **Resolution for MiniMax:** 4 MP (default), 8 MP, 16 MP, Original and Custom. Presets follow the official template (area resize, then 32 px centre crop); 16 MP snaps to the official native canvas (4096×4096, 4736×3552, 5024×3360, 5472×3072, 6272×2688, or portrait) when the aspect ratio matches within 3 %. MiniMax canvases may use up to 16384 px per side; Qwen keeps 8192 px. / MiniMax는 4·8·16MP·원본·사용자 지정. 16MP는 비율이 맞으면 공식 네이티브 크기에 정확히 맞춥니다.
- **Family switch:** when too many images are linked, the switch is refused with a notice naming every link to disconnect (and whether the edit target is among them). Links are never removed automatically. / 이미지가 한도를 넘으면 해제할 단자를 모두 알려 주고 전환을 막습니다. 연결은 자동으로 끊지 않습니다.
- **Fixes:** with MiniMax files installed, Qwen Image 2.1 could auto-select the MiniMax text encoder; Korean quantities such as "사진 2 장을" were treated as image numbers. / MiniMax 파일 설치 시 Qwen 2.1이 MiniMax 인코더를 고르던 문제, "사진 2 장을" 같은 수량 표현을 이미지 번호로 오인하던 문제를 고쳤습니다.
- **Security-scan compatible loading:** ComfyUI core modules (`comfy_extras`) are loaded with plain imports (no `importlib`), so the package passes the Comfy Registry's automated security scan. / ComfyUI 코어 모듈을 일반 import로 불러와 레지스트리 자동 보안 검사를 통과합니다.
- Existing Qwen 2511 / 2.1 editing and saved workflows are unchanged. MiniMax H3 Image requires a current ComfyUI that includes the native MiniMax H3 nodes. / 기존 Qwen 동작과 저장된 워크플로우는 바뀌지 않았습니다.

### v1.0.4
- Executed prompt record in saved image metadata (`ultra_generation_prompts`). / 실제 인코딩한 프롬프트를 이미지 메타데이터에 기록.

### Key features / 주요 기능
- **Multiple references:** Up to 3 images for Qwen 2511, up to 10 for Qwen 2.1, up to 16 for MiniMax H3 Image.
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

**ZIP:** Download `comfyui-Ultra-Qwen-Image-Editor_v1.0.6.zip` below and extract it directly into `ComfyUI/custom_nodes/`.

**Important:** Remove the older `comfyui-Ultra-Image-Editor` folder first to avoid duplicate extension registration. Restart ComfyUI after installation. Install compatible Qwen / MiniMax H3 Image model assets separately.

See the [README](https://github.com/Yamoon-jjang/comfyui-Ultra-Qwen-Image-Editor#readme) and included Korean/English manuals.

**Note:** PiD is not available for Qwen Image 2.1. Real model and GPU performance depend on your ComfyUI setup.
