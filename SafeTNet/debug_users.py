import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.contrib.auth import get_user_model, authenticate
User = get_user_model()

def debug():
    usernames = ["user_beta", "user_gamma", "user_delta"]
    password = "Test@123"
    
    print(f"{'Username':<15} {'Email':<25} {'Active':<8} {'Auth Status'}")
    print("-" * 65)
    
    for username in usernames:
        try:
            user = User.objects.get(username=username)
            auth_user = authenticate(username=username, password=password)
            auth_status = "OK: Authenticated" if auth_user else "FAILED: Auth Failed"
            print(f"{user.username:<15} {user.email:<25} {str(user.is_active):<8} {auth_status}")
            
            # If auth failed, let's reset it one more time explicitly
            if not auth_user:
                user.set_password(password)
                user.is_active = True
                user.save()
                auth_user_retry = authenticate(username=username, password=password)
                if auth_user_retry:
                    print(f"   -> Fixed! Password reset and user activated.")
                else:
                    print(f"   -> Still failing after reset. Check AUTHENTICATION_BACKENDS.")
        except User.DoesNotExist:
            print(f"{username:<15} {'NOT FOUND':<25}")

if __name__ == "__main__":
    debug()
