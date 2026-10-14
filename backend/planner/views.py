from typing import Any

from django.utils.cache import add_never_cache_headers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class ApiView(APIView):
    """Base view: responses are uncacheable unless a view sets its own Cache-Control."""

    def finalize_response(
        self, request: Request, response: Response, *args: Any, **kwargs: Any
    ) -> Response:
        response = super().finalize_response(request, response, *args, **kwargs)
        if not response.has_header("Cache-Control"):
            add_never_cache_headers(response)
        return response


class HealthView(ApiView):
    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})
