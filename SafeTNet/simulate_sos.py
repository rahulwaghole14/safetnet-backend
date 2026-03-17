import os
import django
import time

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.contrib.auth import get_user_model
from users_profile.models import SOSEvent

User = get_user_model()

# Find the test user
try:
    user = User.objects.get(email='testuser@safetnet.com')
except Exception:
    user = User.objects.first()

print(f"Triggering SOS for user: {user.email}")

# Create SOSEvent which triggers the signal chain
sos_event = SOSEvent.objects.create(
    user=user,
    location={'latitude': 18.12345, 'longitude': 73.12345},
    notes="AUTOMETED TEST TRIGGER"
)

print(f"SOSEvent created with ID: {sos_event.id}")
print("Waiting for signals to process...")
time.sleep(5)

print("\n--- CHECKING LOGS ---")
# I'll let the assistant read the logs from the file system
