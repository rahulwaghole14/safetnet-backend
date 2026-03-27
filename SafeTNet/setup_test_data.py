import os
import django
import sys
from decimal import Decimal

# Set up Django environment
sys.path.append('c:\\Safetnet\\SafeTNet')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from users.models import Organization, User, Geofence
from security_app.models import UserLocation, OfficerGeofenceAssignment
from django.utils import timezone

def setup():
    # 1. Create Organization
    org, _ = Organization.objects.get_or_create(name='Test Org', defaults={'description': 'Test Org Description'})

    # 2. Create Security Officer
    officer, created = User.objects.get_or_create(
        username='officer_test',
        defaults={'email': 'officer@test.com', 'role': 'security_officer', 'organization': org}
    )
    if created: 
        officer.set_password('testpass123!')
        officer.save()

    # 3. Create Geofence (Circle around 40.7128, -74.0060)
    geofence, _ = Geofence.objects.get_or_create(
        name='Test Geofence',
        defaults={
            'geofence_type': 'circle',
            'center_latitude': Decimal('40.71280000'),
            'center_longitude': Decimal('-74.00600000'),
            'radius': 1000, # 1km
            'organization': org,
            'active': True
        }
    )

    # 4. Assign Geofence to Officer
    officer.geofences.add(geofence)
    OfficerGeofenceAssignment.objects.get_or_create(officer=officer, geofence=geofence, is_active=True)

    # 5. Create User Inside (at 40.7130, -74.0062)
    user_in, created = User.objects.get_or_create(username='user_inside', defaults={'email': 'in@test.com', 'role': 'USER'})
    UserLocation.objects.update_or_create(
        user=user_in,
        defaults={'latitude': Decimal('40.71300000'), 'longitude': Decimal('-74.00620000'), 'location_timestamp': timezone.now()}
    )

    # 6. Create User Outside (at 40.8000, -74.1000)
    user_out, created = User.objects.get_or_create(username='user_outside', defaults={'email': 'out@test.com', 'role': 'USER'})
    UserLocation.objects.update_or_create(
        user=user_out,
        defaults={'latitude': Decimal('40.80000000'), 'longitude': Decimal('-74.10000000'), 'location_timestamp': timezone.now()}
    )

    print(f'✅ Setup complete: Geofence ID={geofence.id}, Officer={officer.username}')

if __name__ == "__main__":
    setup()
