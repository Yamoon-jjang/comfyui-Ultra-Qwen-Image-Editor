# Ultra Qwen Image Editor + PiD v1.0.7 — What's New / 주요 변경 사항

Changes since v1.0.6 / v1.0.6 이후 변경 사항

## 한국어

- **MiniMax H3 Image 편집 지원:** 실제 참조 이미지 최대 16장의 비전 토큰과 참조 latent를 사용하고, 수정 대상을 `<Picture 1>`로 지정해 네이티브 H3 컨디셔닝으로 처리합니다.
- **샘플링 선택:** H3는 6 Steps / Euler / simple / CFG 1을 기본 권장하며 체크포인트 `pdd_sigmas`를 사용합니다. Steps·Sampler·Scheduler의 다른 조합은 실험적입니다.
- **CFG++ 호환:** H3에서 사용자 Negative Prompt 및 Zero Conditioning 설정은 적용하지 않지만 내부 `ConditioningZeroOut(positive)`를 제공합니다. 빈 이미지 보조는 사용하지 않습니다.
- **안전한 실행:** H3용 모델·Qwen3-VL 인코더·VAE를 사전 검사하며, CFG 1·PiD OFF·RAM 자산 재사용 OFF를 유지합니다.
- **기존 기능 유지:** Qwen Image Edit 2511 및 Qwen Image 2.1 Base·Turbo의 참조 이미지, PiD, 샘플링, LoRA 및 설정 복원 동작은 그대로입니다.

## English

- **MiniMax H3 Image editing:** Uses native H3 conditioning, vision/reference latents from up to 16 real image inputs, and maps the edit target to `<Picture 1>`.
- **Sampling controls:** Recommends 6 steps / Euler / simple / CFG 1 with checkpoint `pdd_sigmas`. Other steps, samplers, and schedulers are experimental.
- **CFG++ support:** H3 ignores user Negative Prompt text and the Zero Conditioning setting, while internally supplying `ConditioningZeroOut(positive)`. No blank-image assistance is used.
- **Execution safeguards:** Checks required H3 model, Qwen3-VL text encoder, and VAE before reference resizing; keeps CFG 1, PiD OFF, and RAM asset reuse OFF.
- **Existing features:** Qwen Image Edit 2511 and Qwen Image 2.1 Base/Turbo retain their reference handling, optional PiD, sampling, LoRA, and profile settings.
