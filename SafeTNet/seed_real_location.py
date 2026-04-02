import os
import django
from django.utils import timezone

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.contrib.auth import get_user_model
from security_app.models import UserLocation, Geofence

User = get_user_model()

def seed():
    # 1. Get a geofence (Jay Ganesh Vision - ID 9)
    try:
        geo = Geofence.objects.get(id=9)
    except Geofence.DoesNotExist:
        geo = Geofence.objects.filter(name__icontains="Jay Ganesh").first()
    
    if not geo:
        print("Required geofence not found. Please create one first.")
        return

    # 2. Get or create test users
    users_data = [
        ("user_beta", "user_beta@test.com", 18.647, 73.785),
        ("user_gamma", "user_gamma@test.com", 18.646, 73.784),
        ("user_delta", "user_delta@test.com", 18.645, 73.783)
    ]

    print(f"Seeding users into geofence: {geo.name} (Center: {geo.center_latitude}, {geo.center_longitude})")

    for username, email, lat, lon in users_data:
        user, created = User.objects.get_or_create(
            username=username,
            defaults={'email': email, 'is_active': True, 'role': 'USER'}
        )
        
        # Update or create location
        UserLocation.objects.update_or_create(
            user=user,
            defaults={
                'latitude': lat,
                'longitude': lon,
                'location_timestamp': timezone.now() # Fresh location (today)
            }
        )
        print(f"Placed {username} at [{lat}, {lon}]")

if __name__ == "__main__":
    seed()
