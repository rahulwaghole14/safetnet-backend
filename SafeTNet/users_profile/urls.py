"""
URL configuration for users app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import views_new_apis
from users import views as views_user

app_name = 'users'

urlpatterns = [
    # User registration and authentication
    path('', views.UserRegistrationView.as_view(), name='user-registration'),
    path('login/', views.UserLoginView.as_view(), name='user-login'),
    
    # User profile management
    path('profile/', views.UserProfileView.as_view(), name='user-profile-current'),
    path('profile/update-fcm-token/', views_user.UpdateFCMTokenView.as_view(), name='user-update-fcm-token'),
    path('<int:user_id>/', views.UserProfileView.as_view(), name='user-profile'),
    path('<int:user_id>/location/', views.UserLocationUpdateView.as_view(), name='user-location-update'),
    path('<int:user_id>/stats/', views.user_stats, name='user-stats'),
    
    # Family contacts management
    path('<int:user_id>/family_contacts/', views.FamilyContactListView.as_view(), name='family-contacts-list'),
    path('<int:user_id>/family_contacts/<int:contact_id>/', views.FamilyContactDetailView.as_view(), name='family-contact-detail'),
    
    # SOS functionality
    path('<int:user_id>/sos/', views.SOSTriggerView.as_view(), name='sos-trigger'),
    path('<int:user_id>/sos_events/', views.SOSEventListView.as_view(), name='sos-events-list'),
    path('<int:user_id>/sos_events/<int:sos_event_id>/mark_read/', views.SOSEventMarkReadView.as_view(), name='sos-event-mark-read'),
    
    # Subscription/Billing
    path('subscribe/', views.SubscriptionView.as_view(), name='subscribe'),
    path('subscribe/cancel/', views.CancelSubscriptionView.as_view(), name='cancel-subscription'),
    path('validate-promocode/', views.ValidatePromoCodeView.as_view(), name='validate-promocode'),
    
    # Geofencing (Premium only)
    path('<int:user_id>/geofences/', views.GeofenceListView.as_view(), name='geofences'),
    path('<int:user_id>/geofence_event/', views.GeofenceEventView.as_view(), name='geofence-event'),
    
    # Live location sharing
    path('<int:user_id>/live_location/start/', views.LiveLocationShareView.as_view(), name='live-location-start'),
    path('<int:user_id>/live_location/', views.LiveLocationShareView.as_view(), name='live-location-sessions'),
    path('<int:user_id>/live_location/<int:session_id>/', views.LiveLocationShareDetailView.as_view(), name='live-location-detail'),
    
    # Community Alerts
    path('<int:user_id>/community_alert/', views.CommunityAlertView.as_view(), name='community-alert'),
    path('<int:user_id>/community_alerts/', views.CommunityAlertListView.as_view(), name='community-alerts-list'),
    
    # Nearby Help (for map view)
    path('nearby_help/', views_new_apis.nearby_help_map, name='nearby-help'),
    path('security_officers/', views_new_apis.security_officer_locations, name='security-officers'),
    path('alerts/', views_user.AlertViewSet.as_view({'get': 'list'}), name='user-alerts'),
    path('public/live_location/<uuid:share_token>/', views_new_apis.PublicLiveLocationShareView.as_view(), name='public-live-location'),
    path('public/security_officers/', views_new_apis.public_security_officer_locations, name='public-security-officers'),
    
    # Safety Tips
    path('safety_tips/', views_new_apis.safety_tips_feed, name='safety-tips'),
    
    # Chat Groups
    path('<int:user_id>/chat_groups/', views.ChatGroupListView.as_view(), name='chat-groups-list'),
    path('<int:user_id>/chat_groups/<int:group_id>/', views.ChatGroupDetailView.as_view(), name='chat-group-detail'),
    path('<int:user_id>/chat_groups/<int:group_id>/members/', views.ChatGroupMemberView.as_view(), name='chat-group-members'),
    path('<int:user_id>/chat_groups/<int:group_id>/members/<int:member_id>/', views.ChatGroupMemberView.as_view(), name='chat-group-remove-member'),
    path('<int:user_id>/chat_groups/<int:group_id>/leave/', views.ChatGroupMemberView.as_view(), name='chat-group-leave'),
    
    # Chat Messages
    path('<int:user_id>/chat_groups/<int:group_id>/messages/', views.ChatMessageListView.as_view(), name='chat-messages-list'),
    path('<int:user_id>/chat_groups/<int:group_id>/messages/<int:message_id>/', views.ChatMessageDetailView.as_view(), name='chat-message-detail'),
    
    # Get users for group creation
    path('available_users/', views.AvailableUsersListView.as_view(), name='available-users-list'),
]
