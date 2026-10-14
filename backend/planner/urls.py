from django.urls import path

from planner import views

urlpatterns = [
    path("health", views.HealthView.as_view(), name="health"),
]
