MediaPipe Tasks Vision runtime 1.1.0, copyright The MediaPipe Authors.
The WebAssembly runtime and loader are distributed under Apache-2.0;
see LICENSE.txt in this directory.

Face Landmarker float16 model bundle, version 1, provided by Google MediaPipe:
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

Upstream documentation and model cards:
https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker

The worker runtime and its non-SIMD fallback are included. These assets load only after
a player opts into facial-expression mirroring. Camera frames are processed
locally in a worker and are never uploaded by expression mode.
