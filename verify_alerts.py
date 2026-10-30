import requests
import json

base_url = "http://127.0.0.1:8000"
login_url = f"{base_url}/api/auth/login/"
alerts_url = f"{base_url}/api/security/user/alerts/"

payload = {
    "username": "testuser",
    "password": "testpass123"
}

print(f"Logging in to {login_url}...")
res = requests.post(login_url, json=payload)
print(f"Status: {res.status_code}")

if res.status_code == 200:
    tokens = res.json().get('tokens', res.json())
    access_token = tokens.get('access')
    print("Login successful.")
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    print(f"Fetching alerts from {alerts_url}...")
    res = requests.get(alerts_url, headers=headers)
    print(f"Status: {res.status_code}")
    print("Response Data (truncated):")
    print(json.dumps(res.json(), indent=2)[:500])
    
    unread_url = f"{base_url}/api/security/user/alerts/unread/"
    print(f"Fetching unread alerts from {unread_url}...")
    res = requests.get(unread_url, headers=headers)
    print(f"Status: {res.status_code}")
    if res.status_code == 200:
        print("Unread alerts response (truncated):")
        print(json.dumps(res.json(), indent=2)[:500])
    else:
        print("Unread alerts fetch failed.")
        print(res.text)
else:
    print("Login failed.")
    print(res.text)
