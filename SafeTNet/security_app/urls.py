from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'sos', views.SOSAlertViewSet, basename='security-sos')
router.register(r'case', views.CaseViewSet, basename='security-case')
router.register(r'live-locations', views.LiveLocationViewSet, basename='live-locations')
router.register(r'user/alerts', views.UserAlertViewSet, basename='user-alerts')

urlpatterns = [
    path('', include(router.urls)),
    path('navigation/', views.NavigationView.as_view(), name='security-navigation'),#http://localhost:8000/api/security/navigation/?from_lat=18.5204&from_lng=73.8567&to_lat=18.5310&to_lng=73.8440
    path('incidents/', views.IncidentsView.as_view(), name='security-incidents'),
    path('login/', views.OfficerLoginView.as_view(), name='security-login'),
    path('profile/', views.OfficerProfileView.as_view(), name='security-profile'),
    path('profile/update-fcm-token/', __import__('users.views').views.UpdateFCMTokenView.as_view(), name='security-update-fcm-token'),
    path('geofence/', views.GeofenceCurrentView.as_view(), name='security-geofence-current'),
    path('geofence/<int:geofence_id>/', views.GeofenceDetailView.as_view(), name='security-geofence-detail'),
    path('notifications/', views.NotificationView.as_view(), name='security-notifications'),
    path('notifications/acknowledge/', views.NotificationAcknowledgeView.as_view(), name='security-notifications-acknowledge'),
    path('dashboard/', views.DashboardView.as_view(), name='security-dashboard'),
    path('live_location/', views.OfficerLiveLocationShareView.as_view(), name='security-live-location'),
    path('live_location/<int:session_id>/', views.OfficerLiveLocationShareDetailView.as_view(), name='security-live-location-detail'),
    path('geofence/', views.GeofenceCurrentView.as_view(), name='security-geofence-current'),
    path('geofence/<int:geofence_id>/', views.GeofenceDetailView.as_view(), name='security-geofence-detail'),
]

