import os
import django
from django.utils import timezone

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.contrib.auth import get_user_model
from security_app.models import UserLocation, Geofence, NotificationLog
from users_profile.models import SOSEvent
from security_app.geo_utils import get_geofences_for_point

User = get_user_model()

def test_sos_filtering():
    # 1. Setup user_a outside of officer001's geofences
    user_a = User.objects.get(username="user_a")
    # A position somewhere far away (e.g. Mumbai center-ish but definitely not Jay Ganesh)
    target_lat, target_lon = 19.0760, 72.8777 
    
    # Check if this location is in ANY geofence
    geofences = get_geofences_for_point(target_lat, target_lon)
    print(f"Location [{target_lat}, {target_lon}] is in geofences: {[g.name for g in geofences]}")
    
    # Update user_a location
    UserLocation.objects.update_or_create(
        user=user_a,
        defaults={
            'latitude': target_lat,
            'longitude': target_lon,
            'location_timestamp': timezone.now()
        }
    )
    print(f"Moved user_a to [{target_lat}, {target_lon}]")

    # 2. Identify officer001 and their geofences
    officer = User.objects.get(username="officer001")
    from security_app.models import OfficerGeofenceAssignment
    officer_geos = OfficerGeofenceAssignment.objects.filter(officer=officer)
    print(f"Officer001 is assigned to: {[a.geofence.name for a in officer_geos]}")

    # 3. Create SOS for user_a
    # This will trigger the signal in signals.py
    print("\n--- Triggering SOS ---")
    sos = SOSEvent.objects.create(
        user=user_a,
        location={"latitude": target_lat, "longitude": target_lon},
        triggered_at=timezone.now(),
        status="active"
    )
    print(f"SOS triggered for user_a (ID: {sos.id})")

    # 4. Check for notifications
    # We should wait a moment for the logic to process (although signals are synchronous in Django)
    logs = NotificationLog.objects.filter(
        notification_type="SOS_ALERT",
        user=officer,
        created_at__gte=timezone.now().replace(second=0, microsecond=0)
    )
    
    if logs.exists():
        print(f"FAILURE: Officer001 RECEIVED a notification! IDs: {[l.id for l in logs]}")
    else:
        print("SUCCESS: Officer001 did NOT receive the notification as expected (filtered by geofence).")

if __name__ == "__main__":
    test_sos_filtering()
