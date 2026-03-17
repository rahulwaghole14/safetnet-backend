import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.contrib.auth import get_user_model
from users_profile.models import SOSEvent
from security_app.models import SOSAlert, Notification
from users.models import Geofence, Organization

User = get_user_model()

def get_email(user):
    if not user: return "None"
    return getattr(user, 'email', 'No Email')

def get_org_name(user):
    if not user or not user.organization: return "None"
    return user.organization.name

print("--- USER INSPECTION ---")
users = User.objects.all()
for u in users:
    geofences = list(u.geofences.all().values_list('name', flat=True))
    print(f"ID: {u.id} | Email: {get_email(u)} | Role: {u.role} | Org: {get_org_name(u)} | Geofences: {geofences}")
    print(f"  Tokens: {getattr(u, 'fcm_tokens', [])}")
    print("-" * 20)

print("\n--- RECENT SOS EVENTS & ALERTS ---")
events = SOSEvent.objects.all().order_by('-triggered_at')[:5]
for e in events:
    print(f"Event ID: {e.id} | User: {get_email(e.user)} | Org: {get_org_name(e.user)} | Status: {e.status} | Triggered: {e.triggered_at}")
    alert = SOSAlert.objects.filter(source_sos_event=e).first()
    if alert:
        print(f"  Mapped SOSAlert ID: {alert.id} | Status: {alert.status} | Priority: {alert.priority} | User: {get_email(alert.user)}")
        # Check if any officers match this org
        if e.user and e.user.organization:
            matching_officers = User.objects.filter(role='security_officer', organization=e.user.organization, is_active=True)
            print(f"  Officers in same Org ({e.user.organization.name}): {[get_email(o) for o in matching_officers]}")
        else:
            print("  User has NO Organization - searching for fallback officers (all active security officers)")
            fallback_officers = User.objects.filter(role='security_officer', is_active=True)
            print(f"  Active Security Officers: {[get_email(o) for o in fallback_officers]}")
    else:
        print("  Mapped SOSAlert: NOT FOUND")

print("\n--- RECENT NOTIFICATIONS ---")
notifs = Notification.objects.all().order_by('-created_at')[:10]
for n in notifs:
    print(f"Notif ID: {n.id} | Officer: {get_email(n.officer)} | SOS ID: {n.sos_alert_id if n.sos_alert else 'N/A'} | Created: {n.created_at}")
