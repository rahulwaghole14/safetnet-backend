
import os
import django
from django.conf import settings

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.db import connections

def verify_db():
    try:
        db_conn = connections['default']
        host = db_conn.settings_dict.get('HOST', 'Unknown')
        name = db_conn.settings_dict.get('NAME', 'Unknown')
        
        print("\n--- Active Database Connection Verification ---")
        print(f"Active Host: {host}")
        print(f"Active DB Name: {name}")
        
        # Test actual connection
        with db_conn.cursor() as cursor:
            cursor.execute("SELECT 1")
            print("Database Connection: SUCCESS")
        print("-----------------------------------------------\n")
        
    except Exception as e:
        print(f"Database Connection: FAILED - {str(e)}")

if __name__ == "__main__":
    verify_db()
