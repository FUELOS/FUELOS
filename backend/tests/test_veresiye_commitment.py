from __future__ import annotations

import hashlib
import json
import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.credit_commitment import (
    SaleLeaf,
    build_shift_ledger,
    canonical_time,
    leaf_from_record,
    ledger_statement_digest,
    merkle_inclusion_path,
    merkle_root,
    sale_commitment,
    to_kurus,
    to_millilitres,
    verify_merkle_inclusion,
    verify_sale_commitment,
)

VECTORS_PATH = (
    Path(__file__).resolve().parents[2]
    / "midnight"
    / "tests"
    / "vectors"
    / "credit-ledger.json"
)


def _load_vectors() -> dict:
    return json.loads(VECTORS_PATH.read_text(encoding="utf-8"))


def _vector_to_leaf(data: dict) -> SaleLeaf:
    return SaleLeaf(
        sale_id=data["saleId"],
        transaction_id=data["transactionId"],
        shift_id=data["shiftId"],
        station_id=data["stationId"],
        account_type=data["accountType"],
        account_id=data["accountId"],
        plate=data["plate"],
        driver_id=data["driverId"],
        fuel_type=data["fuelType"],
        liters_ml=data["litersMl"],
        amount_kurus=data["amountKurus"],
        sale_time=data["saleTime"],
    )


def test_shared_leaf_vectors_match_python_reference() -> None:
    bundle = _load_vectors()
    for entry in bundle["leaves"]:
        leaf = _vector_to_leaf(entry["leaf"])
        nonce = entry["nonce"]
        canonical = json.dumps(
            leaf.payload(nonce),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        )
        assert canonical == entry["canonicalPayload"], entry["label"]
        commitment = sale_commitment(leaf, nonce)
        assert commitment == entry["commitment"], entry["label"]
        assert verify_sale_commitment(leaf, nonce, commitment) is True


def test_nonce_hides_low_entropy_amounts() -> None:
    bundle = _load_vectors()
    leaf_a = bundle["leaves"][1]
    leaf_b = bundle["leaves"][2]
    assert leaf_a["leaf"]["amountKurus"] == leaf_b["leaf"]["amountKurus"]
    assert leaf_a["commitment"] != leaf_b["commitment"]


def test_shared_merkle_vectors_and_rfc6962_hand_checks() -> None:
    bundle = _load_vectors()
    for case in bundle["merkleCases"]:
        sales = [(sid, c) for sid, c in case["inputSales"]]
        ledger = build_shift_ledger(case["shiftId"], sales)
        assert ledger.leaf_count == case["count"]
        assert list(ledger.ordered_sale_ids) == case["orderedSaleIds"]
        assert list(ledger.ordered_commitments) == case["orderedCommitments"]
        assert ledger.merkle_root == case["merkleRoot"]
        assert ledger.statement_digest == case["statementDigest"]
        assert (
            ledger_statement_digest(case["shiftId"], case["count"], case["merkleRoot"])
            == case["statementDigest"]
        )
        for item in case["inclusionPaths"]:
            idx = item["index"]
            path = merkle_inclusion_path(ledger.ordered_commitments, idx)
            assert path == item["path"]
            assert (
                verify_merkle_inclusion(
                    item["commitment"],
                    idx,
                    case["count"],
                    path,
                    case["merkleRoot"],
                )
                is True
            )

    # Independent RFC 6962 checks for 0, 1, and 2 leaves
    c_zero = next(c for c in bundle["merkleCases"] if c["count"] == 0)
    assert c_zero["merkleRoot"] == hashlib.sha256(b"").hexdigest()

    c_one = next(c for c in bundle["merkleCases"] if c["count"] == 1)
    leaf0_hash = hashlib.sha256(
        b"\x00" + bytes.fromhex(c_one["orderedCommitments"][0])
    ).hexdigest()
    assert c_one["merkleRoot"] == leaf0_hash

    c_two = next(c for c in bundle["merkleCases"] if c["count"] == 2)
    h0 = hashlib.sha256(b"\x00" + bytes.fromhex(c_two["orderedCommitments"][0])).digest()
    h1 = hashlib.sha256(b"\x00" + bytes.fromhex(c_two["orderedCommitments"][1])).digest()
    assert c_two["merkleRoot"] == hashlib.sha256(b"\x01" + h0 + h1).hexdigest()


def test_build_shift_ledger_order_independence_and_duplicate_rejection() -> None:
    bundle = _load_vectors()
    case = bundle["merkleCases"][-1]
    sales = [(sid, c) for sid, c in case["inputSales"]]
    shuffled = list(sales)
    rng = random.Random(42)
    rng.shuffle(shuffled)

    ledger_a = build_shift_ledger(case["shiftId"], sales)
    ledger_b = build_shift_ledger(case["shiftId"], shuffled)
    assert ledger_a == ledger_b

    with pytest.raises(ValueError):
        build_shift_ledger(
            case["shiftId"],
            [
                ("aaaa0000-1111-4111-8111-000000000001", case["orderedCommitments"][0]),
                ("AAAA0000-1111-4111-8111-000000000001", case["orderedCommitments"][1]),
            ],
        )


def test_merkle_trees_1_to_17_leaves_and_tamper_failures() -> None:
    for n in range(1, 18):
        commitments = [hashlib.sha256(f"node-{i}".encode("ascii")).hexdigest() for i in range(n)]
        root = merkle_root(commitments)
        for idx in range(n):
            path = merkle_inclusion_path(commitments, idx)
            assert verify_merkle_inclusion(commitments[idx], idx, n, path, root) is True

            if n > 1:
                assert verify_merkle_inclusion(
                    commitments[idx], (idx + 1) % n, n, path, root
                ) is False
                assert verify_merkle_inclusion(commitments[idx], idx, idx, path, root) is False
            assert verify_merkle_inclusion(commitments[idx], idx, n * 2 + 1, path, root) is False
            bad_root = ("1" if root[0] == "0" else "0") + root[1:]
            assert verify_merkle_inclusion(commitments[idx], idx, n, path, bad_root) is False
            if path:
                bad_path = list(path)
                bad_path[0] = ("1" if bad_path[0][0] == "0" else "0") + bad_path[0][1:]
                assert verify_merkle_inclusion(commitments[idx], idx, n, bad_path, root) is False


def test_unit_converters_and_canonical_time() -> None:
    assert to_kurus(Decimal("2145.50")) == 214550
    with pytest.raises(ValueError):
        to_kurus(Decimal("12.345"))
    with pytest.raises(ValueError):
        to_kurus(Decimal("-1.00"))

    assert to_millilitres(None) is None
    assert to_millilitres(Decimal("45.500")) == 45500
    with pytest.raises(ValueError):
        to_millilitres(Decimal("1.2345"))
    with pytest.raises(ValueError):
        to_millilitres(Decimal("-0.001"))

    with pytest.raises(ValueError):
        canonical_time(datetime(2026, 11, 15, 10, 0, 0))

    istanbul = timezone(timedelta(hours=3))
    dt = datetime(2026, 11, 15, 11, 15, 30, 999999, tzinfo=istanbul)
    assert canonical_time(dt) == "2026-11-15T08:15:30Z"


def test_leaf_from_record_simplenamespace() -> None:
    corp = SimpleNamespace(
        id="99999999-1111-4111-8111-000000000001",
        transaction_id="88888888-1111-4111-8111-000000000001",
        shift_id="77777777-1111-4111-8111-000000000001",
        station_id="66666666-1111-4111-8111-000000000001",
        account_type=SimpleNamespace(value="corporate"),
        credit_company_id="55555555-1111-4111-8111-000000000001",
        credit_customer_id=None,
        plate="06ABC123",
        driver_id="44444444-1111-4111-8111-000000000001",
        fuel_type="Kurşunsuz 95",
        liters=Decimal("10.500"),
        amount=Decimal("500.25"),
        sale_time=datetime(2026, 11, 15, 12, 0, 0, tzinfo=timezone.utc),
    )
    leaf = leaf_from_record(corp)
    assert leaf.account_type == "corporate"
    assert leaf.account_id == corp.credit_company_id
    assert leaf.liters_ml == 10500
    assert leaf.amount_kurus == 50025
    assert leaf.sale_time == "2026-11-15T12:00:00Z"

    indiv = SimpleNamespace(
        id="99999999-1111-4111-8111-000000000002",
        transaction_id="88888888-1111-4111-8111-000000000002",
        shift_id="77777777-1111-4111-8111-000000000001",
        station_id="66666666-1111-4111-8111-000000000001",
        account_type="individual",
        credit_company_id=None,
        credit_customer_id="33333333-1111-4111-8111-000000000001",
        plate=None,
        driver_id=None,
        fuel_type=None,
        liters=None,
        amount=Decimal("100.00"),
        sale_time=datetime(2026, 11, 15, 13, 0, 0, tzinfo=timezone.utc),
    )
    indiv_leaf = leaf_from_record(indiv)
    assert indiv_leaf.account_id == indiv.credit_customer_id
    assert indiv_leaf.liters_ml is None
    assert indiv_leaf.amount_kurus == 10000
