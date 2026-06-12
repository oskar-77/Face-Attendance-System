import base64
import json
import logging
import threading
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np

from .config import MODEL_PATH, LABELS_PATH, EMPLOYEES_DIR

logger = logging.getLogger(__name__)

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)

_lock = threading.Lock()
_recognizer = None
_label_map: dict = {}


def load_model() -> None:
    global _recognizer, _label_map
    if MODEL_PATH.exists() and LABELS_PATH.exists():
        rec = cv2.face.LBPHFaceRecognizer_create()
        rec.read(str(MODEL_PATH))
        with open(LABELS_PATH) as f:
            _label_map = {int(k): v for k, v in json.load(f).items()}
        with _lock:
            _recognizer = rec
        logger.info("Loaded face model with %d employees", len(_label_map))


def retrain_all(employees) -> Tuple[bool, str]:
    faces, labels = [], []
    new_label_map = {}

    for emp in employees:
        emp_dir = EMPLOYEES_DIR / str(emp.id)
        if not emp_dir.exists():
            continue
        photos = list(emp_dir.glob("*.jpg")) + list(emp_dir.glob("*.png"))
        if not photos:
            continue
        new_label_map[emp.id] = {
            "id": emp.id,
            "name": emp.name,
            "employee_number": emp.employee_number,
        }
        for photo_path in photos:
            img = cv2.imread(str(photo_path), cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue
            detected = face_cascade.detectMultiScale(
                img, scaleFactor=1.1, minNeighbors=5, minSize=(50, 50)
            )
            for (x, y, w, h) in detected:
                face_roi = cv2.resize(img[y : y + h, x : x + w], (100, 100))
                faces.append(face_roi)
                labels.append(emp.id)

    if not faces:
        return False, "No face data available for training"

    rec = cv2.face.LBPHFaceRecognizer_create()
    rec.train(faces, np.array(labels))
    rec.save(str(MODEL_PATH))
    with open(LABELS_PATH, "w") as f:
        json.dump({str(k): v for k, v in new_label_map.items()}, f)

    global _recognizer, _label_map
    with _lock:
        _recognizer = rec
        _label_map = new_label_map

    msg = f"Trained with {len(faces)} photos from {len(new_label_map)} employees"
    logger.info(msg)
    return True, msg


def detect_faces(gray_img) -> list:
    return face_cascade.detectMultiScale(
        gray_img, scaleFactor=1.1, minNeighbors=5, minSize=(50, 50)
    )


def recognize_frame(image_b64: str) -> List[dict]:
    try:
        img_bytes = base64.b64decode(image_b64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return []

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        detected = detect_faces(gray)

        results = []
        with _lock:
            rec = _recognizer
            lmap = dict(_label_map)

        for x, y, w, h in detected:
            face_roi = cv2.resize(gray[y : y + h, x : x + w], (100, 100))
            if rec is not None and lmap:
                label, confidence = rec.predict(face_roi)
                if confidence < 80 and label in lmap:
                    emp = lmap[label]
                    results.append(
                        {
                            "employee_id": emp["id"],
                            "name": emp["name"],
                            "confidence": round(float(100 - confidence), 1),
                            "bbox": [int(x), int(y), int(w), int(h)],
                        }
                    )
                else:
                    results.append(
                        {
                            "employee_id": None,
                            "name": "Unknown",
                            "confidence": 0.0,
                            "bbox": [int(x), int(y), int(w), int(h)],
                        }
                    )
            else:
                results.append(
                    {
                        "employee_id": None,
                        "name": "Unknown",
                        "confidence": 0.0,
                        "bbox": [int(x), int(y), int(w), int(h)],
                    }
                )
        return results
    except Exception as e:
        logger.error("Recognition error: %s", e)
        return []
