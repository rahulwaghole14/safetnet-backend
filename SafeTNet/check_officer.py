import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

try:
    u = User.objects.get(email='officer001@safetnet.com')
    print(f"Email: {u.email}")
    print(f"Role: {u.role}")
    print(f"Org: {u.organization.name if u.organization else 'None'}")
    print(f"Active: {u.is_active}")
    print(f"Tokens: {u.fcm_tokens}")
except Exception as e:
    print(f"Error: {e}")
