import os
import django
from django.utils import timezone

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from security_app.models import SOSAlert
from users.models import Alert, User, Organization
from security_app.signals import send_sos_alert_notification

# Setup test data
officer_email = "officer001@safetnet.com"
user_email = "testuser@safetnet.com"

officer = User.objects.get(email=officer_email)
test_user = User.objects.get(email=user_email)

print(f"Creating test alert from Officer: {officer.email}")
print(f"Test User: {test_user.email}, Org: {test_user.organization}")

# 1. Create SOSAlert (Officer Side)
new_alert = SOSAlert.objects.create(
    user=officer,
    created_by_role='OFFICER',
    alert_type='security',
    message="TEST BROADCAST ALERT FROM SCRIPT",
    location_lat=18.5204,
    location_long=73.8567,
    status='pending',
    priority='high'
)

print(f"Created SOSAlert ID: {new_alert.id}")

# 2. Trigger Signal (this should sync to users.Alert)
print("Triggering synchronization signal...")
send_sos_alert_notification(sender=SOSAlert, instance=new_alert, created=True)

# 3. Verify Sync
synced_alert = Alert.objects.filter(metadata__sos_alert_id=new_alert.id).first()
if synced_alert:
    print(f"SUCCESS: Alert synced to users.Alert ID: {synced_alert.id}")
    print(f"Alert Type: {synced_alert.alert_type}, User: {synced_alert.user.email}")
else:
    print("FAILURE: Alert not synced to users.Alert")

# 4. Check Visibility Query (Simulate AlertsScreen fetching)
print("\n--- Simulating User App Query ---")
# This matches the logic in AlertViewSet.get_queryset
from django.db.models import Q
geofence_ids = list(test_user.geofences.filter(active=True).values_list('id', flat=True))

visibility_query = Q(geofence_id__in=geofence_ids) | Q(user=test_user)
if test_user.organization:
    visibility_query |= Q(alert_type='OFFICER_ALERT', user__organization=test_user.organization)
else:
    # This is the path the current user follows
    visibility_query |= Q(alert_type='OFFICER_ALERT')

visible_alerts = Alert.objects.filter(visibility_query).distinct()
if synced_alert in visible_alerts:
    print("SUCCESS: Alert IS visible to testuser")
else:
    print("FAILURE: Alert IS NOT visible to testuser")
    print(f"Visibility criteria: Geofences={geofence_ids}, Org={test_user.organization}")
