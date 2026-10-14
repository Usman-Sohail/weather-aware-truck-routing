from django.urls import include, path

urlpatterns = [
    path("api/", include("planner.urls")),
]

handler404 = "planner.errors.not_found_view"
handler500 = "planner.errors.server_error_view"
