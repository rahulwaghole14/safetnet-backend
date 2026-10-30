#!/usr/bin/env python
import requests
import json

print("Testing SecurityApp Login with Local Server")
print("=" * 50)

BASE_URL = "http://localhost:8000"

def test_security_login():
    print("\n[TEST] Security Officer Login")
    print(f"URL: {BASE_URL}/api/security/login/")

    data = {
        'username': 'officer001',
        'password': 'test123'
    }

    try:
        response = requests.post(f"{BASE_URL}/api/security/login/", json=data, timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Response Time: {response.elapsed.total_seconds():.1f}s")

        if response.status_code == 200:
            result = response.json()
            access_token = result.get('access', '')
            refresh_token = result.get('refresh', '')
            user = result.get('user', {})

            print("✅ SUCCESS: Login successful!")
            print(f"Access Token: {len(access_token)} characters")
            print(f"Refresh Token: {len(refresh_token)} characters")
            print(f"User: {user.get('username')} ({user.get('role')})")

            # Test token storage simulation
            print("\n[STORAGE SIMULATION]")
            print("Token would be stored in AsyncStorage:")
            print(f"  'token': '{access_token[:20]}...'")
            print(f"  'refresh_token': '{refresh_token[:20]}...'")

            return True
        else:
            print("❌ FAILED: Login failed")
            print(f"Response: {response.text[:200]}...")
            return False

    except requests.exceptions.ConnectionError:
        print("❌ FAILED: Cannot connect to server")
        print("Make sure Django server is running:")
        print("  cd safetnet/SafeTNet && python manage.py runserver")
        return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

def test_dashboard_access(access_token):
    print("\n[TEST] Dashboard Access with Token")
    headers = {'Authorization': f'Bearer {access_token}'}

    try:
        response = requests.get(f"{BASE_URL}/api/security/dashboard/", headers=headers, timeout=10)
        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            print("✅ SUCCESS: Dashboard accessible")
            return True
        else:
            print("❌ FAILED: Dashboard not accessible")
            return False
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False

if __name__ == '__main__':
    success = test_security_login()

    if success:
        print("\n🎉 SecurityApp Login Test PASSED!")
        print("The React Native app should now work correctly.")
        print("\nNext Steps:")
        print("1. Run: npx react-native start --reset-cache")
        print("2. Run: npx react-native run-android")
        print("3. Login with: officer001 / test123")
    else:
        print("\n❌ SecurityApp Login Test FAILED!")
        print("Check that the Django server is running.")