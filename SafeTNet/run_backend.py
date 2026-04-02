import subprocess
import codecs
import sys
import os

env_path = r'c:\Safetnet\SafeTNet\.env'
try:
    with codecs.open(env_path, 'r', 'utf-16') as f:
        content = f.read()
    with open(env_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("✅ .env re-encoded to UTF-8")
except Exception as e:
    print(f"ℹ️ Note: .env re-encoding skipped: {e}")

# Start the Django server
cmd = [sys.executable, 'manage.py', 'runserver', '0.0.0.0:8000']
subprocess.run(cmd, cwd=r'c:\Safetnet\SafeTNet')
