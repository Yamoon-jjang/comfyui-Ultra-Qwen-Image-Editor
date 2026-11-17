# Ultra Qwen Image Editor + PiD v1.0.9 — What's New / 주요 변경 사항

Changes since v1.0.8 / v1.0.8 이후 변경 사항

## 한국어

- **모델별 높이 기억 개선:** 모델 계열마다 전체 노드 높이 대신 사용자가 늘려 둔 프롬프트 입력 공간을 기억합니다. 다른 모델에 있는 동안 이미지 연결 수, LoRA 행, PiD·해상도 행이 바뀌어도 돌아오면 프롬프트 입력란 크기가 그대로 복원됩니다.
- **빠른 모델 전환 보호:** 크기 정리가 끝나기 전에 모델을 연속으로 바꿔도 다른 모델의 높이가 잘못 기록되지 않습니다. 접힌 노드나 워크플로우 다시 불러오기 뒤에 이전 전환 정보가 남지 않습니다.
- **불필요한 크기 변경 방지:** 줄 수가 바뀌지 않는 해상도 변경(예: 4MP → 8MP)에서는 노드 높이를 바꾸지 않습니다. 같은 모델 계열 안에서 모델 파일을 바꿔 PiD·해상도 행이 달라질 때도 프롬프트 공간을 유지합니다.
- **LoRA 버튼 표시 수정:** "＋ LoRA 추가" 버튼과 LoRA 행이 가끔 노드 폭보다 좁게 그려지던 현상을 수정했습니다.
- **기존 기록 호환:** v1.0.8에서 저장된 모델별 높이 기록을 그대로 읽어 이어서 사용합니다.
- **편집 기능 유지:** 참조 이미지 연결, 편집 대상, 모델 로딩, 샘플링, LoRA, PiD, CFG++ 및 프롬프트 내용은 v1.0.8과 동일하게 처리합니다.

## English

- **Better per-family height memory:** Each model family now remembers the extra prompt space you added instead of the total node height, so the prompt box keeps its size on return even if image sockets, LoRA rows, or PiD/resolution rows changed meanwhile.
- **Rapid switching:** Switching families again before the layout settles no longer records one family's height under another; stale transitions are cleared for collapsed nodes and after a workflow reload.
- **No needless resizing:** Resolution changes that add or remove no rows (e.g. 4MP → 8MP) leave the node height alone; changing the model file within a family keeps the prompt space when PiD/resolution rows change.
- **LoRA button drawing:** Fixed the "+ Add LoRA" button and LoRA rows occasionally being drawn narrower than the node.
- **Compatible:** Height records saved by v1.0.8 are read and carried forward.
- **Editing unchanged:** Reference images, target mapping, model loading, sampling, LoRA, PiD, CFG++ support, and prompt content retain v1.0.8 behavior.
