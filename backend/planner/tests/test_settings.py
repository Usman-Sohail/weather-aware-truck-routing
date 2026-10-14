import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
LOAD_SETTINGS = (
    "import os; os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'; "
    "from django.conf import settings; print(settings.SECRET_KEY)"
)


def _load_settings(**env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", LOAD_SETTINGS],
        cwd=BACKEND_DIR,
        env={**os.environ, **env},
        capture_output=True,
        text=True,
        check=False,
    )


def test_production_settings_require_a_secret_key() -> None:
    # An explicitly empty variable also overrides any value in a local .env file.
    result = _load_settings(DJANGO_DEBUG="false", DJANGO_SECRET_KEY="")

    assert result.returncode != 0
    assert "DJANGO_SECRET_KEY must be set" in result.stderr


def test_debug_settings_fall_back_to_a_local_key() -> None:
    result = _load_settings(DJANGO_DEBUG="true", DJANGO_SECRET_KEY="")

    assert result.returncode == 0
    assert result.stdout.strip() == "insecure-local-development-key"
