import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

def set_passwords():
    users = ["user_beta", "user_gamma", "user_delta"]
    password = "Test@123"
    
    for username in users:
        try:
            user = User.objects.get(username=username)
            user.set_password(password)
            user.save()
            print(f"✅ Password set for {username}")
        except User.DoesNotExist:
            print(f"❌ User {username} not found")

if __name__ == "__main__":
    set_passwords()
