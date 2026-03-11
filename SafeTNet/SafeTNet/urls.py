"""
URL configuration for SafeTNet project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from core import views as core_views

urlpatterns = [
    path("", core_views.root_view, name="root"),
    path("admin/", admin.site.urls),
    path("live-share/<uuid:share_token>/", core_views.live_share_view, name="live-share"),
    path("live-share/<uuid:share_token>", core_views.live_share_view),
    path("api/auth/", include("users.urls")),
    path("api/security/", include("security_app.urls")),
    path("api/user/", include("users_profile.urls")),
    path("api/create-test-alert/", core_views.create_test_alert, name="create-test-alert"),
    path("api/", include("core.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
