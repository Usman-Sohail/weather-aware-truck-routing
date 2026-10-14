from django.urls import path

from planner import views

urlpatterns = [
    path("health", views.HealthView.as_view(), name="health"),
    path("geocode", views.GeocodeView.as_view(), name="geocode"),
    path("routes", views.RoutesView.as_view(), name="routes"),
    path("assess", views.AssessView.as_view(), name="assess"),
]
