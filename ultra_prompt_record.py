"""Record the prompt text a generator node actually used into the saved image.

ComfyUI embeds only the submitted graph (node inputs and widget values) in a
saved image. When the positive prompt reaches a node through a link (for
example from a translator or an LLM node), the text that was really encoded
is produced at run time and never appears in the file. Readers can then only
walk the links back to the pre-conversion source text.

This module writes the encoded text into the shared ``extra_pnginfo`` dict
under ``ultra_generation_prompts``. Save nodes that run later in the same
prompt (Save Image, Image Saver Simple, ...) embed every ``extra_pnginfo``
entry, so the record lands in the same file as the image.

If ComfyUI reuses a cached result, the node function does not run. To keep the
record in that case, the last record per node id is re-inserted when a prompt
is submitted. A node that does run overwrites it before any saver runs, because
savers depend on the node's output.

Shared by the Ultra generator packs; each pack registers its own node types.
"""

KEY = "ultra_generation_prompts"
FORMAT_VERSION = 1

_last_records = {}
_handled_types = set()
_registered = False


def _as_text(value):
    if value is None:
        return ""
    return str(value)


def build_record(node_type, positive, negative=None, positive_input=None, **extra):
    record = {
        "v": FORMAT_VERSION,
        "node": str(node_type),
        "positive": _as_text(positive),
    }
    if negative is not None:
        record["negative"] = _as_text(negative)
    if positive_input is not None and _as_text(positive_input) != record["positive"]:
        record["positive_input"] = _as_text(positive_input)
    for key, value in extra.items():
        if value is not None:
            record[key] = value
    return record


def _insert(extra_pnginfo, unique_id, record):
    if not isinstance(extra_pnginfo, dict) or unique_id is None:
        return False
    bucket = extra_pnginfo.get(KEY)
    if not isinstance(bucket, dict):
        bucket = {}
        extra_pnginfo[KEY] = bucket
    bucket[str(unique_id)] = dict(record)
    return True


def record_prompt(extra_pnginfo, unique_id, node_type, positive, negative=None,
                  positive_input=None, **extra):
    """Never raises: a failed record must not fail image generation."""
    try:
        record = build_record(node_type, positive, negative, positive_input, **extra)
        if unique_id is not None:
            _last_records[(str(node_type), str(unique_id))] = record
        return _insert(extra_pnginfo, unique_id, record)
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[Ultra] prompt record skipped: {exc}")
        return False


def _on_prompt(json_data):
    try:
        prompt = json_data.get("prompt")
        extra_data = json_data.get("extra_data")
        if not isinstance(prompt, dict) or not isinstance(extra_data, dict):
            return json_data
        extra_pnginfo = extra_data.get("extra_pnginfo")
        if not isinstance(extra_pnginfo, dict):
            return json_data
        for node_id, node in prompt.items():
            if not isinstance(node, dict):
                continue
            node_type = str(node.get("class_type") or "")
            if node_type not in _handled_types:
                continue
            record = _last_records.get((node_type, str(node_id)))
            if record is not None:
                _insert(extra_pnginfo, node_id, record)
    except Exception as exc:  # pragma: no cover - defensive
        print(f"[Ultra] prompt record pre-insert skipped: {exc}")
    return json_data


def register(*node_types):
    """Enable cached-run re-insertion for these node class names."""
    global _registered
    _handled_types.update(str(t) for t in node_types)
    if _registered:
        return
    try:
        from server import PromptServer
        PromptServer.instance.add_on_prompt_handler(_on_prompt)
        _registered = True
    except Exception as exc:  # outside a running ComfyUI server
        print(f"[Ultra] prompt record handler not registered: {exc}")
