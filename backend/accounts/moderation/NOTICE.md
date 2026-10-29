# nsfw-384.onnx

The profile-picture check (`accounts/avatar.py`) runs this model on the server.

- Model: [Marqo/nsfw-image-detection-384](https://huggingface.co/Marqo/nsfw-image-detection-384), a `vit_tiny_patch16_384` classifier (labels: NSFW, SFW).
- License: Apache License 2.0, copyright Marqo. A copy of the license is at https://www.apache.org/licenses/LICENSE-2.0.
- Change: the published timm weights were exported to ONNX (opset 17) with `torch.onnx.export`. The weights are unchanged. On test images, the ONNX outputs match PyTorch's.
- Input: `pixels`, 1×3×384×384 float32, RGB, normalised as (x / 255 − 0.5) / 0.5.
- Output: `logits`, 1×2, in the order [NSFW, SFW].
