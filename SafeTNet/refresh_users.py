import os
import django
from django.utils import timezone
from datetime import timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.contrib.auth import get_user_model
from security_app.models import UserLocation, Geofence

User = get_user_model()

def refresh():
    # 1. Get geofence
    geo = Geofence.objects.filter(name__icontains="Jay Ganesh").first()
    if not geo:
        print("Geofence not found")
        return

    # 2. Users to refresh
    targets = [
        ("testuser", 18.648, 73.784),
        ("user_beta", 18.647, 73.785),
        ("user_gamma", 18.646, 73.784),
        ("user_delta", 18.645, 73.783),
        ("user_a", 18.6465, 73.7842) # Move user_a into the area too!
    ]

    print(f"Refreshing {len(targets)} users into {geo.name} area...")

    for username, lat, lon in targets:
        try:
            user = User.objects.get(username=username)
            UserLocation.objects.update_or_create(
                user=user,
                defaults={
                    'latitude': lat,
                    'longitude': lon,
                    'location_timestamp': timezone.now()
                }
            )
            print(f"✅ Refreshed {username} at [{lat}, {lon}]")
        except User.DoesNotExist:
            print(f"❌ User {username} not found, skipping.")

if __name__ == "__main__":
    refresh()
