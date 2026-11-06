# Ultra Qwen Image Editor + PiD — User Manual v1.0

## Purpose and supported models

This custom node edits reference images directly in ComfyUI. Supported model families:

- **Qwen Image Edit 2511**: up to 3 connected images; optional QwenImage-compatible PiD upscaling.
- **Qwen Image 2.1 Base / Turbo**: up to 10 connected images; PiD unavailable for this family.

A Qwen text-to-image checkpoint (for example a clearly named Qwen Image 2512 generation model) is not a replacement for a compatible editing checkpoint.

## Install

1. Stop ComfyUI.
2. Extract this package to `ComfyUI/custom_nodes/comfyui-Ultra-Qwen-Image-Editor/`.
3. Remove or move aside any older duplicate installation of the **same** Ultra Image Editor node. The separate `comfyui-Ultra-Image-PiD` project is a different node.
4. Install the matching model assets into `models/diffusion_models`, `models/text_encoders` and `models/vae` (optional LoRAs go to `models/loras`).
5. Restart ComfyUI, search for **Ultra Qwen Image Editor + PiD**, and connect its `Edited Image` output to `Save Image`.

A recent ComfyUI core is required, including the native Qwen editing encoders, samplers and loaders. The node adds **no separate pip dependencies**. Optional PiD requires additional compatible core nodes, a QwenImage PiD checkpoint and a Gemma 2 ELM text encoder.

## Asset selection

| Family | Diffusion model | Text encoder | VAE |
| --- | --- | --- | --- |
| Qwen Image Edit 2511 | Qwen Image Edit 2511 compatible checkpoint | Qwen 2.5 VL 7B | Qwen Image VAE |
| Qwen Image 2.1 | Qwen Image 2.1 Base/Turbo compatible checkpoint | Qwen3 VL compatible encoder | Qwen Image 2.1 VAE |

Exact asset filenames vary by source and precision. Explicitly incompatible families are rejected, while a custom model with a neutral filename is not guaranteed compatible. When `<select installed model>` appears, install/select the correct matching asset before running.

## Basic workflow

1. Choose `Model Family` and the three matching model files.
2. Connect a Load Image node to `image1`.
3. Enter an image editing instruction in `Positive Prompt`.
4. Adjust resolution, Steps, CFG, Sampler, Scheduler and optional LoRAs.
5. Connect `Edited Image` to `Save Image`, then queue generation.

`image1` always exists. Additional ports appear as images are connected; the maximum is 3 for 2511 and 10 for 2.1. Connect consecutively, without gaps. Disconnect higher-numbered inputs before switching to a family with fewer allowed images.

### Choosing an image to edit

`Edit Target = auto` selects `image1`. A different connected `imageN` can be selected explicitly. Internally the target is moved to the encoder's first picture position; the node renumbers English and Korean explicit references to preserve which connected image each reference means.

For example, with image1 as a hat and image2 as a person, `Put the hat from image1 on the person in image2` still refers to the same images if `Edit Target` is changed to image2.

Recognized forms include `image1`, `image 2`, `image_2`, `Picture 2:`, `이미지1`, `이미지 2`, `사진1`, `그림2` and `2번 이미지`. Quantity expressions such as `이미지 2배`, `사진 2매` and `그림 2초` are not image references. References to unconnected image numbers stay literal text but their missing image data is not supplied to the model.

**Do not group reference numbers:** write `image1 and image2` rather than `image 1 and 2` (Korean: `이미지1과 이미지2`, not `이미지 1과 2`).

## Resolution options

`Resolution Selection` supports `auto_1mp` (default), `0.5MP`, `1.5MP`, `2MP`, `original` and `custom`. Preset modes retain the target image's aspect ratio. In `custom`, set Width and Height; 0 on one side derives that dimension from the target's aspect ratio. If both dimensions require a different aspect ratio, the source image is fitted with padding rather than stretched or cropped.

ComfyUI/core implementations may round dimensions to latent-grid multiples (16 for 2511, 32 for 2.1). In Qwen 2.1 `original`/`custom` mode, additional non-target references can be bounded to about 1 MP to reduce encoder load. Larger resolutions increase VRAM/time requirements.

## Sampling behavior

| Model family | Initial Steps / CFG | Sampling behavior |
| --- | --- | --- |
| Qwen Image Edit 2511 | 20 / 4 | KSampler |
| Qwen Image 2.1 Base | 25 / 1 | KSampler |
| Qwen Image 2.1 Turbo | 8 / 1 | At exactly 8 steps, built-in ManualSigmas; otherwise KSampler |

For a Turbo filename, **exactly Steps=8** uses the built-in eight-interval sigma schedule, with editable CFG and the selected Sampler. The Scheduler widget is ignored only on that path. Any other Turbo step value runs KSampler with the selected Scheduler. All sampling controls remain editable.

`Zero Conditioning = ON` zeroes the negative conditioning; `OFF` encodes the entered Negative Prompt. Negative-prompt guidance can be ineffective at CFG=1.

## LoRA

Use **+ Add LoRA** to choose installed LoRAs. Each row provides an on/off control, filename picker and strength (valid range -100 to 100). Context-menu actions include move up/down, remove, change filename/strength and refresh list. **Displayed row order is application order.** The selected model may not support every LoRA; choose compatible files.

## PiD upscaling (2511 only)

With `PiD Upscale = ON`, an additional QwenImage-compatible PiD pass upscales the edited latent. PiD options are Model, Scene Prompt, Sampler, Scheduler, Steps, Output Scale (`x2`/`x4`) and Color Match. If Scene Prompt is empty the edit prompt is reused. `x2` is produced after the internal x4 processing pass. Color Match optionally adjusts the PiD result toward the original edited image.

- `Edited Image`: decoded result before PiD.
- `PiD Image`: PiD result (or the same edited image if PiD is OFF).

The internal x4 processing dimension cannot exceed 8192px on its longest side. PiD requires a compatible QwenImage PiD checkpoint and Gemma 2 ELM encoder. Qwen 2.1 does not support PiD in this node.

## Caching, profiles, and workflow files

`Reuse Models (RAM)` retains unchanged loaded model/encoder/VAE assets within a conservative system RAM budget; it does not enlarge GPU VRAM. Disable it for a run to clear the node's retained references. PiD may need extra RAM and model files.

Model-specific profiles include model file selections, sampling settings, Zero Conditioning, PiD settings and LoRAs. They are **committed after successful queue submission**, not after finished image rendering. Edits made before queuing are kept as temporary drafts during model switching in the current editor session. Positive/Negative prompts, PiD scene prompt, edit target, resolution and seed remain the current task's values when models change. Save your ComfyUI workflow separately for persistent storage.

Old workflows with incompatible positional widget layouts may be reset to safe defaults rather than incorrectly shifting text, dimensions or LoRA values. If warned, rebuild the node and save a new workflow. Nested subgraphs support profile saving and label localization, but a selection restricted to an output inside a subgraph may not include editor nodes upstream of the external boundary.

## Korean / English UI

ComfyUI's `Comfy.Locale` setting controls translated widget labels, tooltips, LoRA menus and in-node notifications. Literal model filenames, `imageN` socket IDs, scheduler names and canonical option tokens (for example `randomize`, `auto_1mp`) are kept unchanged to protect workflow compatibility. Some backend error messages are in Korean regardless of client locale.

## Troubleshooting

- No images: connect `image1` before queuing.
- Gaps in IMAGE sockets: connect `image1`, `image2`, etc. consecutively.
- `<select installed model>`: install and select matching Qwen model, encoder and VAE.
- PiD disabled on 2.1: this is expected; PiD is supported only for 2511.
- Missing PiD checkpoint/Gemma: install compatible PiD and Gemma 2 ELM files.
- Out of VRAM: lower output resolution, image count or disable PiD.
- LoRA not listed: check `models/loras` and refresh the list.
- Unexpected reset loading an old workflow: recreate the node and save with the current format.

The node does not write image files itself. Generated PNG/workflow metadata may contain your active prompt and other settings; inspect metadata before sharing images.

## License

GPL-3.0-or-later; see `LICENSE`.
