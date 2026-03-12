import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from security_app.models import SOSAlert
from security_app.signals import send_sos_alert_notification
from users.models import Alert

# Get the most recent officer alert
oa = SOSAlert.objects.filter(created_by_role='OFFICER').order_by('-id').first()

if not oa:
    print("No officer alert found to test with.")
else:
    print(f"Testing sync for SOSAlert {oa.id} (Type: {oa.alert_type}, User: {oa.user.email})")
    
    # Check if Alert already exists
    if Alert.objects.filter(metadata__sos_alert_id=oa.id).exists():
        print("Alert already exists. Deleting it for clean test...")
        Alert.objects.filter(metadata__sos_alert_id=oa.id).delete()
    
    print("Manually triggering signal...")
    try:
        # Trigger the signal manually
        send_sos_alert_notification(sender=SOSAlert, instance=oa, created=True)
        
        # Check if Alert was created
        synced_alert = Alert.objects.filter(metadata__sos_alert_id=oa.id).first()
        if synced_alert:
            print(f"SUCCESS: Alert {synced_alert.id} created for user {synced_alert.user.email}")
        else:
            print("FAILURE: Alert was not created.")
            
    except Exception as e:
        print(f"CRASH: Signal raised an exception: {e}")
        import traceback
        traceback.print_exc()
