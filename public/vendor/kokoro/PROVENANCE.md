# Bebo local speech

Bebo uses the unmodified `kokoro-js` 1.2.1 package by hexgrad and Xenova and the Kokoro 82M v1.0 ONNX model published by ONNX Community. The code and model weights use Apache 2.0. The package license is included here; dependency licenses remain in the packaged application.

- Code: https://github.com/hexgrad/kokoro/tree/main/kokoro.js
- Model: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- Pinned model revision: `1939ad2a8e416c0acfeecc08a694d14ef25f2231`
- Quantized model SHA-256: `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478`
- Voices: Puck (`am_puck`), Heart (`af_heart`), George (`bm_george`). These are synthesized stock voices, not recordings of a human operator or a clone of the user.

`scripts/prepare-voice.cjs` verifies the model assets against their pinned upstream hashes. Speech inference runs in a local worker with remote model loading disabled. English is supported by this integration. Arabic uses an installed device voice when available.

The Windows cursor overlay is Bebo's own implementation. No code or assets from Clicky are bundled. Clicky's public project was consulted to understand the requested interaction: https://github.com/farzaa/clicky
