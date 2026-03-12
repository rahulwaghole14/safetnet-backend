import os
import django
import dj_database_url

def check_db(db_url, name):
    print(f"\n--- Checking DB: {name} ---")
    try:
        db_config = dj_database_url.parse(db_url)
        # Manually set the engine and other required Django DB settings
        db_config['ENGINE'] = 'django.db.backends.postgresql'
        
        # We need to temporarily override the DATABASES setting
        from django.conf import settings
        orig_databases = settings.DATABASES
        settings.DATABASES = {'default': db_config}
        
        from security_app.models import SOSAlert
        from users.models import Alert
        
        print(f"URL hostname: {db_config.get('HOST')}")
        print(f"SOSAlert count: {SOSAlert.objects.count()}")
        print(f"users.Alert count: {Alert.objects.count()}")
        
        recent = SOSAlert.objects.all().order_by('-id')[:3]
        for r in recent:
            print(f"  Recent SOSAlert: ID={r.id}, Type={r.alert_type}, User={r.user.email}")
            
        # Restore
        settings.DATABASES = orig_databases
    except Exception as e:
        print(f"Error checking {name}: {e}")

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

url1 = "postgresql://neondb_owner:npg_DtBfwy8OA4Ur@ep-calm-cell-aiejxb6u-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
url2 = "postgresql://neondb_owner:npg_Q6V0LwCybNvY@ep-red-queen-ahjbhshv-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

check_db(url1, "URL 1 (current .env)")
check_db(url2, "URL 2 (settings.py fallback)")
