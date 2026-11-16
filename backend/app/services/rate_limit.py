"""
FuelOS — T.C. kimlik no tahmin denemelerine karşı başarısızlık sınırlayıcı.

Maskeli T.C. (ilk 3 + son 2 hane) gören bir kullanıcı, eşleşme/eşleşmeme yanıtı
veren uç noktaları (sürücü doğrulama, müşteri arama, mükerrer kayıt, veresiye
satış) art arda deneyerek tam numarayı bulabilir. Bu modül kullanıcı başına
BAŞARISIZ denemeleri kayan pencerede sayar; sınır aşılınca 429 döner.

Not: Sayaç süreç belleğindedir (tek uvicorn süreci için yeterli). Birden fazla
worker ile çalıştırılıyorsa Redis gibi paylaşılan bir depoya taşınmalıdır.
"""

from __future__ import annotations

import threading
import time
import uuid
from collections import defaultdict, deque

from fastapi import HTTPException, status

MAX_FAILURES = 20
WINDOW_SECONDS = 15 * 60

_lock = threading.Lock()
_failures: dict[uuid.UUID, deque[float]] = defaultdict(deque)


def _prune(bucket: deque[float], now: float) -> None:
    while bucket and now - bucket[0] > WINDOW_SECONDS:
        bucket.popleft()


def ensure_allowed(user_id: uuid.UUID) -> None:
    """Kullanıcı başarısız deneme sınırını aştıysa 429 fırlatır."""
    now = time.monotonic()
    with _lock:
        bucket = _failures.get(user_id)
        if bucket is None:
            return
        _prune(bucket, now)
        if len(bucket) >= MAX_FAILURES:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Çok fazla başarısız T.C. kimlik denemesi. Lütfen bir süre sonra tekrar deneyin.",
            )


def record_failure(user_id: uuid.UUID) -> None:
    """Başarısız bir T.C. eşleştirme denemesini kaydeder."""
    now = time.monotonic()
    with _lock:
        bucket = _failures[user_id]
        _prune(bucket, now)
        bucket.append(now)


def reset() -> None:
    """Tüm sayaçları sıfırlar (yalnızca testler için)."""
    with _lock:
        _failures.clear()
