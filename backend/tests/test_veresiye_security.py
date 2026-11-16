"""Güvenlik incelemesi düzeltmeleri: T.C. tahmin sınırlayıcı ve 422 yanıtında girdi yansıtılmaması."""

import asyncio
import json
import uuid

import pytest
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError

from app.main import validation_error_handler
from app.schemas.credit import CreditSaleInput
from app.services import rate_limit


def test_rate_limit_blocks_after_max_failures_per_user():
    rate_limit.reset()
    user, other = uuid.uuid4(), uuid.uuid4()
    for _ in range(rate_limit.MAX_FAILURES):
        rate_limit.ensure_allowed(user)
        rate_limit.record_failure(user)
    with pytest.raises(HTTPException) as exc:
        rate_limit.ensure_allowed(user)
    assert exc.value.status_code == 429
    rate_limit.ensure_allowed(other)  # başka kullanıcı etkilenmez
    rate_limit.reset()
    rate_limit.ensure_allowed(user)


def test_validation_error_does_not_echo_tc_number():
    tc = "10000000146"
    # Geçerli T.C. + eksik şirket → model doğrulaması başarısız; varsayılan FastAPI
    # yanıtı tüm gövdeyi (T.C. dahil) `input` alanında geri yansıtırdı.
    try:
        CreditSaleInput.model_validate({"account_type": "corporate", "driver_tc": tc})
    except ValidationError as exc:
        errors = exc.errors()
    assert tc in str(errors)  # ham hata gerçekten T.C. içeriyor

    res = asyncio.run(validation_error_handler(None, RequestValidationError(errors)))
    body = res.body.decode()
    assert res.status_code == 422
    assert tc not in body
    assert all(set(err) == {"type", "loc", "msg"} for err in json.loads(body)["detail"])
