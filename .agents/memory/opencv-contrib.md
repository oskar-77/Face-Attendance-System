---
name: opencv-contrib required for cv2.face
description: cv2.face (LBPH, Eigenfaces, Fisherfaces) is only in the contrib build of OpenCV, not the base headless build.
---

**Rule:** Use `opencv-contrib-python-headless` (not `opencv-python-headless`) whenever the code uses `cv2.face.*`.

**Why:** The base `opencv-python-headless` package omits the `face` module. `cv2.face.LBPHFaceRecognizer_create()` raises `AttributeError: module 'cv2' has no attribute 'face'` at runtime.

**How to apply:** `pip install opencv-contrib-python-headless`. Uninstall the base package first if already installed to avoid conflicts.
