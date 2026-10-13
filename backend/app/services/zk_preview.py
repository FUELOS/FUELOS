"""Private server-side transaction preparation and public Preview inspection."""

import asyncio
import json
import os
import re
import signal

from app.services.zk_service import _midnight_dir

HEX64 = re.compile(r"^[0-9a-f]{64}$")
TX_ID = re.compile(r"^[0-9a-f]{66}$")


class PreviewHandoffError(RuntimeError):
    pass


def trusted_preview_deployment() -> dict:
    registry = _midnight_dir() / "preview" / "deployment.preview.json"
    data = json.loads(registry.read_text(encoding="utf-8"))
    if (data.get("network") != "preview"
        or data.get("statementVersion") != "reconcile-v4-financial-commitment"
        or not HEX64.fullmatch(data.get("contractAddress", ""))
        or not HEX64.fullmatch(data.get("verifierKeySha256", ""))):
        raise PreviewHandoffError("Trusted Preview deployment registry is invalid")
    return data


async def _node(command: str, *, private_input: dict | None = None, arguments: tuple[str, ...] = ()) -> dict:
    npm = os.getenv("FUELOS_NPM_COMMAND") or ("npm.cmd" if os.name == "nt" else "npm")
    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            npm, "run", "--silent", command, "--", *arguments,
            cwd=_midnight_dir(),
            start_new_session=os.name != "nt",
            stdin=asyncio.subprocess.PIPE if private_input is not None else asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(
            process.communicate(json.dumps(private_input).encode() if private_input is not None else None),
            timeout=360 if private_input is not None else 40,
        )
        if process.returncode != 0:
            raise PreviewHandoffError("Midnight Preview operation failed")
        output = json.loads(stdout.decode())
        if not isinstance(output, dict):
            raise PreviewHandoffError("Invalid Midnight Preview response")
        return output
    except asyncio.TimeoutError as exc:
        if process is not None and process.returncode is None:
            if os.name == "nt":
                process.kill()
            else:
                os.killpg(process.pid, signal.SIGKILL)
            await process.wait()
        raise PreviewHandoffError("Midnight Preview operation timed out") from exc
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PreviewHandoffError("Midnight Preview operation failed") from exc


async def prepare_preview_transaction(request: dict) -> dict:
    response = await _node("prepare:shift", private_input=request)
    tx_hex = response.get("txHex")
    if (not isinstance(tx_hex, str) or len(tx_hex) < 200 or len(tx_hex) % 2
        or not re.fullmatch(r"[0-9a-f]+", tx_hex)):
        raise PreviewHandoffError("Invalid proven transaction")
    for field in ("contractAddress", "publicClass", "toleranceKurus", "contextDigest", "financialCommitment"):
        if response.get(field) != request.get(field):
            raise PreviewHandoffError("Prepared public statement mismatch")
    return {"tx_hex": tx_hex}


async def inspect_preview_transaction(tx_id: str, context_digest: str) -> dict:
    if not TX_ID.fullmatch(tx_id) or not re.fullmatch(r"^fuelos:shift:v1:[0-9a-f]{64}$", context_digest):
        raise PreviewHandoffError("Invalid Preview receipt identifier")
    response = await _node("inspect:preview", arguments=(tx_id, context_digest.split(":")[-1]))
    if response.get("txId") != tx_id or response.get("transactionAttributed") is not True:
        raise PreviewHandoffError("Preview transaction attribution failed")
    if response.get("verifierKeyMatchesLocalArtifact") is not True:
        raise PreviewHandoffError("Preview verifier key mismatch")
    return response
