import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

print("--- SECURITY OFFICER TOKEN CHECK ---")
officers = User.objects.filter(role='security_officer')
for o in officers:
    tokens = getattr(o, 'fcm_tokens', [])
    print(f"Officer: {o.username} (Active: {o.is_active})")
    print(f"  Tokens: {tokens}")
    print("-" * 20)
