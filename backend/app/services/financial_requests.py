"""Serialize retries across workers without storing private request payloads."""
import hashlib
import json
from fastapi import HTTPException
from sqlalchemy import text
from app.models.financial_request import FinancialRequest


async def begin_request(db, user_id, operation, key, body):
    # Legacy API clients may omit the key. All financial UI actions supply one.
    if key is None:
        return None, None
    fingerprint = hashlib.sha256(json.dumps(body.model_dump(mode='json'), sort_keys=True).encode()).hexdigest()
    scope = f'{user_id}:{operation}:{key}'
    lock_id = int.from_bytes(hashlib.sha256(scope.encode()).digest()[:8], 'big', signed=True)
    await db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': lock_id})
    existing = await db.get(FinancialRequest, (user_id, operation, key))
    if existing:
        if existing.fingerprint != fingerprint:
            raise HTTPException(status_code=409, detail="Aynı işlem anahtarı farklı içerikle kullanılamaz")
        return None, existing.resource_id
    return dict(user_id=user_id, operation=operation, key=key, fingerprint=fingerprint), None


def finish_request(db, pending, resource_id):
    if pending is not None:
        db.add(FinancialRequest(**pending, resource_id=resource_id))
