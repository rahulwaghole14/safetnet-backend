import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

emails = ['officer001@safetnet.com', 'testuser@safetnet.com']

for email in emails:
    try:
        u = User.objects.get(email=email)
        print(f"--- {email} ---")
        print(f"Role: {u.role}")
        print(f"Org: {u.organization.name if u.organization else 'None'}")
        print(f"Active: {u.is_active}")
        print(f"Tokens: {u.fcm_tokens}")
    except Exception as e:
        print(f"Error for {email}: {e}")
