import os
import django
from django.utils import timezone

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from security_app.models import SOSAlert
from users.models import Alert
from django.contrib.auth import get_user_model

User = get_user_model()

print("--- Detailed Alert Audit ---")
print(f"Current Time: {timezone.now()}")

print(f"\n[SOSAlert Table - security_app]")
print(f"Total records: {SOSAlert.objects.count()}")
recent_sos = SOSAlert.objects.all().order_by('-id')[:10]
for a in recent_sos:
    print(f"ID: {a.id}, Created: {a.created_at}, User: {a.user.email}, Role: {a.created_by_role}, Type: {a.alert_type}, Status: {a.status}")

print(f"\n[Alert Table - users]")
print(f"Total records: {Alert.objects.count()}")
recent_unified = Alert.objects.all().order_by('-id')[:10]
for a in recent_unified:
    sos_id = a.metadata.get('sos_alert_id') if a.metadata else 'None'
    print(f"ID: {a.id}, Created: {a.created_at}, User: {a.user.email}, Type: {a.alert_type}, Status: {a.status}, SOS_ID: {sos_id}")

# Specifically check for any OFFICER alerts that DID NOT sync
print(f"\n[Sync Check]")
officer_alerts = SOSAlert.objects.filter(created_by_role='OFFICER').order_by('-id')[:5]
for oa in officer_alerts:
    synced = Alert.objects.filter(metadata__sos_alert_id=oa.id).exists()
    print(f"Officer Alert {oa.id} ({oa.alert_type}) - Synced to users.Alert: {synced}")
