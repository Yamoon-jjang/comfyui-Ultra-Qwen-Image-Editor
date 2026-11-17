# Ultra Qwen Image Editor + PiD v1.0.8 — What's New / 주요 변경 사항

Changes since v1.0.7 / v1.0.7 이후 변경 사항

## 한국어

- **모델별 편집 노드 높이 기억:** Qwen Image Edit 2511, Qwen Image 2.1, MiniMax H3 Image 각각에서 사용자가 조절한 높이를 기억하고 모델 복귀 시 복원합니다.
- **너비 유지:** 모델을 전환해도 모델별 너비는 복원하지 않고 현재 조절된 너비를 유지합니다. ComfyUI의 최소 너비는 지킵니다.
- **프롬프트 입력 공간 보호:** H3로 전환하거나 PiD·해상도 옵션을 바꿀 때도 Positive/Negative 프롬프트 입력란이 한 줄로 과도하게 줄어들지 않도록 합니다.
- **안정적인 레이아웃:** 모델 전환 후 노드 크기를 중복 조절하지 않고, 워크플로우의 사용자 크기 및 이전 테스트 형태의 높이 기록을 유지합니다.
- **편집 기능 유지:** 참조 이미지 연결과 번호, 편집 대상, 모델 로딩, 샘플링, LoRA, PiD, CFG++ 및 프롬프트 내용은 v1.0.7과 동일하게 처리합니다.

## English

- **Per-family editor height:** Remembers the user-adjusted node height for Qwen Image Edit 2511, Qwen Image 2.1, and MiniMax H3 Image and restores it when returning to a family.
- **Stable width:** Keeps the latest manually adjusted width across model changes rather than restoring per-family widths, while respecting ComfyUI's minimum.
- **Multiline prompts:** Protects Positive/Negative prompt editing space during H3 selection and PiD/resolution option changes instead of shrinking it to a single line.
- **Consistent layout:** Avoids redundant resize operations when switching models, preserves workflow-saved dimensions, and imports previously stored height values when present.
- **Editing unchanged:** Reference images, target mapping, model loading, sampling, LoRA, PiD, CFG++ support, and prompt content retain v1.0.7 behavior.
