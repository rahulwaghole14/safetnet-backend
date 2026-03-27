import os
import django
import sys

# Set up Django environment
sys.path.append('c:\\Safetnet\\SafeTNet')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from security_app.models import UserLocation
from users.models import Geofence, User
from django.utils import timezone

def check_data():
    print("--- Geofences ---")
    for g in Geofence.objects.all():
        center = g.get_center_point()
        print(f"ID: {g.id}, Name: {g.name}, Active: {g.active}, Type: {g.geofence_type}, Center: {center}")

    print("\n--- User Locations ---")
    for loc in UserLocation.objects.all():
        print(f"User: {loc.user.username}, Lat: {loc.latitude}, Lon: {loc.longitude}, Time: {loc.location_timestamp}")

    print("\n--- Security Officers ---")
    for officer in User.objects.filter(role='security_officer'):
        geofences = list(officer.geofences.all())
        print(f"ID: {officer.id}, Username: {officer.username}, Geofences: {[g.name for g in geofences]}")

if __name__ == "__main__":
    check_data()
