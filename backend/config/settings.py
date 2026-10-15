"""Django settings, configured entirely from environment variables.

A ``backend/.env`` file, if present, provides defaults for local development.
Variables already set in the environment always take precedence.
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str]) -> list[str]:
    value = os.environ.get(name)
    if value is None:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


_load_env_file(BASE_DIR / ".env")

DEBUG = _env_bool("DJANGO_DEBUG", default=False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is false.")
    SECRET_KEY = "insecure-local-development-key"

ALLOWED_HOSTS = _env_list(
    "DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"] if DEBUG else []
)

INSTALLED_APPS = [
    "rest_framework",
    "planner",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# The service is stateless: no models, no sessions, no database.
DATABASES: dict[str, dict[str, str]] = {}

CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
}

APPEND_SLASH = False
USE_TZ = True
TIME_ZONE = "UTC"
LANGUAGE_CODE = "en-us"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    # The hosting platform appends the caller's address to X-Forwarded-For, so throttles
    # count the caller rather than the whole chain, which a client could vary at will.
    "NUM_PROXIES": int(os.environ.get("API_NUM_PROXIES", "1")),
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
    "EXCEPTION_HANDLER": "planner.errors.api_exception_handler",
    # Best-effort protection per server instance; each viewer's own Open-Meteo limit and
    # the per-plan location budget are what keep the external services within quota.
    "DEFAULT_THROTTLE_RATES": {
        "plan": os.environ.get("API_THROTTLE_PLANS", "20/min"),
        "assess": os.environ.get("API_THROTTLE_ASSESSMENTS", "60/min"),
        "geocode": os.environ.get("API_THROTTLE_GEOCODES", "60/min"),
    },
}

# Routing and geocoding. Without a key the planning endpoints report SERVICE_NOT_CONFIGURED.
TOMTOM_API_KEY = os.environ.get("TOMTOM_API_KEY", "")

if not DEBUG:
    # TLS is terminated by the hosting platform, which forwards the original scheme.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30

SILENCED_SYSTEM_CHECKS = [
    # No cookies or sessions are used, so requests carry no ambient credentials to forge.
    "security.W003",
    # The API is served from a platform subdomain whose sibling subdomains it does not control.
    "security.W005",
    "security.W021",
]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
