"""Local development launcher; a generated bearer secret stays in ignored backend/var/."""

import os
import secrets
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
os.chdir(root)
sys.path.insert(0, str(root))

import uvicorn  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

from app.config import Settings  # noqa: E402

settings = Settings()
Path("var").mkdir(exist_ok=True)
if not settings.admin_token:
    token_file = Path("var/dev-access-token.txt")
    if not token_file.exists():
        token_file.write_text(secrets.token_urlsafe(32), encoding="utf-8")
    os.environ["EVALUATION_ADMIN_TOKEN"] = token_file.read_text(encoding="utf-8").strip()
    print("Local authorization token: backend/var/dev-access-token.txt (not printed or committed).")
command.upgrade(Config("alembic.ini"), "head")
uvicorn.run("app.main:app", host="127.0.0.1", port=8000, workers=1, access_log=False)
