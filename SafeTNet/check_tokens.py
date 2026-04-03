import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

print("--- SafeTNet FCM Token Diagnostic ---")
users = User.objects.filter(is_active=True).exclude(fcm_tokens=[])
count = 0
for user in users:
    tokens = getattr(user, 'fcm_tokens', [])
    if tokens:
        count += 1
        print(f"User: {user.username} ({user.role})")
        print(f"  Tokens: {tokens}")
        print("-" * 20)

if count == 0:
    print("NO ACTIVE TOKENS FOUND.")
else:
    print(f"Found {count} users with tokens.")
