"""
diag_api.py - DIAGNÓSTICO TEMPORÁRIO do SMTP na Vercel (24/11/2026)
=================================================================
O e-mail de redefinição não chegava e os Logs da Vercel não mostravam
nada. Esta rota testa o login SMTP de dentro da Vercel e devolve o
resultado, para dar para diagnosticar de fora. REMOVER depois de
resolver (junto com o registro em factory.py e check_smtp_login()).

Protegida por token: sem o cabeçalho X-Diag-Token certo, responde 404,
como se a rota não existisse. Nunca devolve senha, usuário ou chave.
"""

import hashlib
import hmac
import os

from flask import Blueprint, abort, jsonify, request

from backend.db import query_one
from backend.email_utils import _smtp_settings, check_smtp_login

diag_api = Blueprint("diag_api", __name__, url_prefix="/api")

SMTP_VARS = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM")


def _expected_tokens():
    tokens = []
    key = (os.environ.get("TOTP_ENCRYPTION_KEY") or "").strip()
    if key:
        tokens.append(hmac.new(key.encode(), b"smtp-diag", hashlib.sha256).hexdigest()[:32])
    extra = (os.environ.get("DIAG_TOKEN") or "").strip()
    if len(extra) >= 16:
        tokens.append(extra)
    return tokens


def _authorized():
    given = (request.headers.get("X-Diag-Token") or "").encode()
    return bool(given) and any(hmac.compare_digest(given, t.encode()) for t in _expected_tokens())


def _raw_shape(name):
    """Formato do valor cru (como foi colado), sem revelar o conteúdo."""
    raw = os.environ.get(name)
    if raw is None:
        return {"set": False}
    return {
        "set": True,
        "len": len(raw),
        "edge_whitespace": raw != raw.strip(),
        "quoted": len(raw.strip()) >= 2 and raw.strip()[0] in "\"'" and raw.strip()[0] == raw.strip()[-1],
    }


@diag_api.route("/_diag/smtp", methods=["GET"])
def smtp_diag():
    if not _authorized():
        abort(404)

    result = {
        "commit": (os.environ.get("VERCEL_GIT_COMMIT_SHA") or "")[:7],
        "vercel_env": os.environ.get("VERCEL_ENV"),
        "frontend_origin": os.environ.get("FRONTEND_ORIGIN"),
        "raw": {name: _raw_shape(name) for name in SMTP_VARS},
    }

    try:
        s = _smtp_settings()
        result["settings"] = {
            "host": s["host"],
            "port": s["port"],
            "user_domain": s["user"].rpartition("@")[2],
            "from_equals_user": s["from"] == s["user"],
            "password_len": len(s["password"]),
            # 8 caracteres do SHA-256: dá para conferir se é a senha nova
            # sem expor a senha.
            "password_sha256_8": hashlib.sha256(s["password"].encode()).hexdigest()[:8],
        }
    except Exception as e:
        result["settings"] = {"error": f"{type(e).__name__}: {e}"[:300]}

    result["smtp_login"] = check_smtp_login()

    email = (request.args.get("email") or "").strip().lower()
    if email:
        try:
            result["account_exists"] = query_one("SELECT 1 AS ok FROM users WHERE email = %s", (email,)) is not None
        except Exception as e:
            result["account_exists"] = f"erro: {type(e).__name__}"

    response = jsonify(result)
    response.headers["Cache-Control"] = "no-store"
    return response
