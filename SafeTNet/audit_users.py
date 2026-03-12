import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from users.models import User, Organization

print("--- User & Organization Audit ---")
for user in User.objects.all():
    org_name = user.organization.name if user.organization else "None"
    print(f"User: {user.email}, Role: {user.role}, Org: {org_name}, ID: {user.id}")

print("\n--- Organization List ---")
for org in Organization.objects.all():
    print(f"Org: {org.name}, ID: {org.id}")
