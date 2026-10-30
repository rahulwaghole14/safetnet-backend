import requests

base_url = "http://127.0.0.1:8000"

print("Logging in...")
try:
    # Use a dummy test user or see if there's a quick way to test.
    # We will just hit the endpoint without auth to see what happens.
    print("Testing /api/security/user/alerts/ without auth:")
    res = requests.get(f"{base_url}/api/security/user/alerts/")
    print("Status:", res.status_code)
    print("Response:", res.text)
except Exception as e:
    print("Exception:", str(e))
