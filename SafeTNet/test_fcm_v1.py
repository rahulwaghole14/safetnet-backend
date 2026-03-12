
import os
import django
import firebase_admin
from firebase_admin import credentials, messaging

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.conf import settings

def test_fcm_v1():
    firebase_config = getattr(settings, 'FIREBASE_CONFIG', None)
    if not firebase_config or not firebase_config.get('project_id'):
        print("ERROR: FIREBASE_CONFIG not found in settings")
        return

    print("Initializing Firebase Admin SDK with Environment Configuration")
    # Debug private key format (careful not to print the whole secret in production logs)
    pk = firebase_config.get('private_key', '')
    print(f"Private Key starts with: {pk[:30]}")
    print(f"Private Key ends with: {pk[-30:]}")
    print(f"Contains literal '\\n': {'\\n' in pk}")
    print(f"Contains actual newline: {'\n' in pk}")
    
    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(firebase_config)
            firebase_admin.initialize_app(cred)
        
        # We don't have real tokens yet, so we just test the initialization and 
        # try to send a dry-run message to a dummy token to verify credentials
        message = messaging.Message(
            notification=messaging.Notification(
                title='Test Title',
                body='Test Body',
            ),
            token='dummy-token-for-dry-run',
        )
        
        try:
            # Dry run to verify everything except the token itself
            response = messaging.send(message, dry_run=True)
            print('Successfully sent dry-run message:', response)
        except firebase_admin.exceptions.InvalidArgumentError as e:
            # This is expected for a 'dummy-token' but confirms API connectivity
            print('FCM API reached! (Expected token error):', str(e))
        except Exception as e:
            print('FCM API Error:', str(e))
            
    except Exception as e:
        print(f"Initialization Failed: {str(e)}")

if __name__ == "__main__":
    test_fcm_v1()
