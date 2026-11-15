# Ultra Qwen Image Editor + PiD — User Manual v1.0.7

## Purpose and supported models

This custom node edits reference images directly in ComfyUI. Supported model families:

- **Qwen Image Edit 2511**: up to 3 connected images; optional QwenImage-compatible PiD upscaling.
- **Qwen Image 2.1 Base / Turbo**: up to 10 connected images; PiD unavailable for this family.
- **MiniMax H3 Image**: up to 16 connected images; native H3 image conditioning; PiD disabled.

A Qwen text-to-image checkpoint (for example a clearly named Qwen Image 2512 generation model) is not a replacement for a compatible editing checkpoint.

## Install

1. Stop ComfyUI.
2. Extract this package to `ComfyUI/custom_nodes/comfyui-Ultra-Qwen-Image-Editor/`.
3. Remove or move aside any older duplicate installation of the **same** Ultra Image Editor node. The separate `comfyui-Ultra-Image-PiD` project is a different node.
4. Install the matching model assets into `models/diffusion_models`, `models/text_encoders` and `models/vae` (optional LoRAs go to `models/loras`).
5. Restart ComfyUI, search for **Ultra Qwen Image Editor + PiD**, and connect its `Edited Image` output to `Save Image`.

A recent ComfyUI core is required, including the native Qwen editing encoders, samplers and loaders. The node adds **no separate pip dependencies**. Optional PiD requires additional compatible core nodes, a QwenImage PiD checkpoint and a Gemma 2 ELM text encoder.

### Install with Git

From the ComfyUI `custom_nodes` directory:

```bash
git clone https://github.com/Yamoon-jjang/comfyui-Ultra-Qwen-Image-Editor.git
```

For future updates, enter `comfyui-Ultra-Qwen-Image-Editor` and run `git pull`, then restart ComfyUI. Do not keep the old `comfyui-Ultra-Image-Editor` folder installed at the same time; duplicate extensions can conflict.

The node UI automatically follows the selected Korean/English ComfyUI locale. Widget labels, tooltips, LoRA menus and notices are localized; model filenames, socket identifiers and stored workflow option values are intentionally not translated.


## Asset selection

| Family | Diffusion model | Text encoder | VAE |
| --- | --- | --- | --- |
| Qwen Image Edit 2511 | Qwen Image Edit 2511 compatible checkpoint | Qwen 2.5 VL 7B | Qwen Image VAE |
| Qwen Image 2.1 | Qwen Image 2.1 Base/Turbo compatible checkpoint | Qwen3 VL compatible encoder (not MiniMax H3) | Qwen Image 2.1 VAE |
| MiniMax H3 Image | `minimax_h3_image_pruned_int8_convrot.safetensors` | `qwen3vl_32b_minimax_h3_int8_convrot.safetensors` | `minimax_h3_image_vae_fp16.safetensors` |

Exact asset filenames vary by source and precision. Explicitly incompatible families are rejected, while a custom model with a neutral filename is not guaranteed compatible. When `<select installed model>` appears, install/select the correct matching asset before running.

## Basic workflow

1. Choose `Model Family` and the three matching model files.
2. Connect a Load Image node to `image1`.
3. Enter an image editing instruction in `Positive Prompt`.
4. Adjust resolution, Steps, CFG, Sampler, Scheduler and optional LoRAs.
5. Connect `Edited Image` to `Save Image`, then queue generation.

`image1` always exists. Additional ports appear as images are connected; maximum: **3 for 2511, 10 for 2.1, 16 for MiniMax H3**. Connect consecutively, without gaps. If any higher-numbered input is connected, the node **warns and refuses** switching to a family with a smaller limit. **You** must disconnect extra links manually; **no links are automatically removed**.

### Choosing an image to edit

`Edit Target = auto` selects `image1`. A different connected `imageN` can be selected explicitly. Internally the target is moved to the encoder's first picture position; the node renumbers English and Korean explicit references to preserve which connected image each reference means.

For example, with image1 as a hat and image2 as a person, `Put the hat from image1 on the person in image2` still refers to the same images if `Edit Target` is changed to image2.

Recognized forms include `image1`, `image 2`, `image_2`, `Picture 2:`, `이미지1`, `이미지 2`, `사진1`, `그림2` and `2번 이미지`. Quantity expressions such as `이미지 2배`, `사진 2매` and `그림 2초` are not image references. References to unconnected image numbers stay literal text but their missing image data is not supplied to the model.

**Do not group reference numbers:** write `image1 and image2` rather than `image 1 and 2` (Korean: `이미지1과 이미지2`, not `이미지 1과 2`).

## Resolution options

`Resolution Selection` supports `auto_1mp` (default), `0.5MP`, `1.5MP`, `2MP`, `original` and `custom`. Preset modes retain the target image's aspect ratio. In `custom`, set Width and Height; 0 on one side derives that dimension from the target's aspect ratio. If both dimensions require a different aspect ratio, the source image is fitted with padding rather than stretched or cropped.

ComfyUI/core implementations may round dimensions to latent-grid multiples (16 for 2511, 32 for 2.1). In Qwen 2.1 `original`/`custom` mode, additional non-target references can be bounded to about 1 MP to reduce encoder load. Larger resolutions increase VRAM/time requirements.

### MiniMax H3 image preprocessing

Requires current ComfyUI with `MiniMaxH3ImageConditioning`. H3 uses its own resolution list: **4MP (default), 8MP, 16MP, original, custom**. The MP presets use *area* resize and 32-pixel **cover-crop**, not stretch-to-fit. At 16MP, source images within 3% of an official native aspect are instead center-cropped with ComfyUI's core resize helper to that exact native canvas. Other aspect ratios retain the normal area/cover path. `original` only performs the 32px cover-crop. `custom` is a convenience mode that fits the complete image with padding onto a 32px-aligned canvas. The exact processed width/height are explicitly passed to H3 conditioning, preventing unintended 0/0 dimension fallback. Very high MP settings require substantial memory. Selected H3 diffusion/text/VAE files are validated before the image is resized.

ComfyUI officially lists native ~16MP H3 output including 4096×4096, 4736×3552, 5024×3360, 5472×3072 and 6272×2688. These are model outputs, not PiD enlargements. The editor validates the projected 32px cover-crop dimensions **before** allocating an enlarged source image; MiniMax H3 uses the native core's 16384px per-axis limit, while the two older Qwen families retain their 8192px limit. In H3 `custom` mode, Width=Height=0 uses approximately 4MP; one zero dimension derives from source aspect ratio.

On first selection of MiniMax H3, available `int8_convrot` diffusion/encoder files are preferred over BF16. A user's previously saved model selection is never replaced by this preference. If changing to a lower-cap family would leave excess linked images, the warning identifies the affected sockets and count; image disconnection remains manual.

The target image is internally encoded as `<Picture 1>`; other connected inputs are reordered in sequence. English/Korean explicit `imageN` references are converted into `<Picture N>` for MiniMax, preserving the target mapping. Each IMAGE input accepts a batch of exactly one RGB/RGBA image.

## Sampling behavior

| Model family | Initial Steps / CFG | Sampling behavior |
| --- | --- | --- |
| Qwen Image Edit 2511 | 20 / 4 | KSampler |
| Qwen Image 2.1 Base | 25 / 1 | KSampler |
| Qwen Image 2.1 Turbo | 8 / 1 | At exactly 8 steps, built-in ManualSigmas; otherwise KSampler |
| MiniMax H3 Image | 6 / 1 recommended | Native H3 positive + 5D latent; euler/simple recommended; other sampling settings experimental |

For a Turbo filename, **exactly Steps=8** uses the built-in eight-interval sigma schedule, with editable CFG and the selected Sampler. The Scheduler widget is ignored only on that path. Any other Turbo step value runs KSampler with the selected Scheduler. Other model families retain editable Steps/Scheduler; MiniMax H3 Image fixes both to 6/`simple`.

`Zero Conditioning = ON` zeroes the negative conditioning; `OFF` encodes the entered Negative Prompt. Negative-prompt guidance can be ineffective at CFG=1.

For MiniMax H3, the official six-step sigma values are read from the loaded checkpoint's `pdd_sigmas` through ComfyUI's native model sampler. **Steps 6 / Euler / Scheduler `simple`** are recommended defaults, while users may select other steps/samplers/schedulers experimentally. At alternate step counts, the native H3 sampler interpolates the PDD grid; no hard-coded substitute grid is introduced. **CFG 1** remains fixed for H3. User negative text and the Zero Conditioning control are inapplicable and hidden, but an internal `ConditioningZeroOut(positive)` provides a valid unconditional model prediction when a CFG++ sampler requests it even at CFG 1. PiD and RAM asset reuse are forced OFF for H3. The negative text remains stored for other model families, whose behavior remains unchanged. The editor uses vision tokens and reference latents from connected **real** images, never synthetic blank-image tokens. Compatible H3-specific LoRAs can be applied on the model path; compatibility must be checked with the chosen checkpoint. External prompt expansion is optional and not bundled into this custom node.

## LoRA

Use **+ Add LoRA** to choose installed LoRAs. Each row provides an on/off control, filename picker and strength (valid range -100 to 100). Context-menu actions include move up/down, remove, change filename/strength and refresh list. **Displayed row order is application order.** The selected model may not support every LoRA; choose compatible files.

## PiD upscaling (2511 only)

With `PiD Upscale = ON`, an additional QwenImage-compatible PiD pass upscales the edited latent. PiD options are Model, Scene Prompt, Sampler, Scheduler, Steps, Output Scale (`x2`/`x4`) and Color Match. If Scene Prompt is empty the edit prompt is reused. `x2` is produced after the internal x4 processing pass. Color Match optionally adjusts the PiD result toward the original edited image.

- `Edited Image`: decoded result before PiD.
- `PiD Image`: PiD result (or the same edited image if PiD is OFF).

The internal x4 processing dimension cannot exceed 8192px on its longest side. PiD requires a compatible QwenImage PiD checkpoint and Gemma 2 ELM encoder. Qwen 2.1 and MiniMax H3 do not support PiD in this node.

## Caching, profiles, and workflow files

`Reuse Models (RAM)` retains unchanged loaded model/encoder/VAE assets within a conservative system RAM budget; it does not enlarge GPU VRAM. Disable it for a run to clear the node's retained references. MiniMax H3 defaults to OFF because its assets are large, but users may turn it ON at the cost of higher retained RAM. PiD may need extra RAM and model files.

Model-specific profiles include model file selections, sampling settings, Zero Conditioning, PiD settings and LoRAs. They are **committed after successful queue submission**, not after finished image rendering. Edits made before queuing are kept as temporary drafts during model switching in the current editor session. Positive/Negative prompts, PiD scene prompt, edit target, resolution and seed remain the current task's values when models change. Save your ComfyUI workflow separately for persistent storage.

The node records the final positive/negative prompt it actually encoded (after image-reference renumbering) in the saved image metadata under `ultra_generation_prompts`. A prompt that arrives through a link — for example from a translator or LLM node — is therefore kept as the real text, not only as a link. Ultra Exif Reader v4.12+ shows it as the Final CLIP prompt. When ComfyUI reuses a cached result, the previous record is inserted again; a failed record never stops generation.

Old workflows with incompatible positional widget layouts may be reset to safe defaults rather than incorrectly shifting text, dimensions or LoRA values. If warned, rebuild the node and save a new workflow. Nested subgraphs support profile saving and label localization, but a selection restricted to an output inside a subgraph may not include editor nodes upstream of the external boundary.

## Korean / English UI

ComfyUI's `Comfy.Locale` setting controls translated widget labels, tooltips, LoRA menus and in-node notifications. Literal model filenames, `imageN` socket IDs, scheduler names and canonical option tokens (for example `randomize`, `auto_1mp`) are kept unchanged to protect workflow compatibility. Some backend error messages are in Korean regardless of client locale.

## Troubleshooting

- No images: connect `image1` before queuing.
- Gaps in IMAGE sockets: connect `image1`, `image2`, etc. consecutively.
- `<select installed model>`: install and select matching Qwen model, encoder and VAE.
- PiD disabled on 2.1/H3: expected; PiD is supported only for 2511.
- Cannot switch family: manually disconnect all linked `imageN` sockets above the desired family's 3/10/16 limit; the node never removes them automatically.
- H3 asset detection mismatch: install the dedicated MiniMax H3 diffusion, Qwen3-VL H3 encoder and VAE files; do not reuse the Qwen 2.1 text encoder.
- Missing PiD checkpoint/Gemma: install compatible PiD and Gemma 2 ELM files.
- Out of VRAM: lower output resolution, image count or disable PiD.
- LoRA not listed: check `models/loras` and refresh the list.
- Unexpected reset loading an old workflow: recreate the node and save with the current format.

The node does not write image files itself. Generated PNG/workflow metadata may contain your active prompt and other settings; inspect metadata before sharing images.

## License

GPL-3.0-or-later; see `LICENSE`.
