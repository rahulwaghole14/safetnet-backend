#!/usr/bin/env python
import requests
import json
import time

def test_endpoint(name, url, method='GET', data=None, headers=None, auth_token=None):
    """Test an API endpoint"""
    print(f"\n🧪 Testing {name}...")

    try:
        if auth_token:
            if not headers:
                headers = {}
            headers['Authorization'] = f'Bearer {auth_token}'

        if method == 'GET':
            response = requests.get(url, headers=headers, timeout=10)
        elif method == 'POST':
            response = requests.post(url, json=data, headers=headers, timeout=10)
        else:
            print(f"❌ Unsupported method: {method}")
            return False

        print(f"   Status: {response.status_code}")
        print(f"   Time: {response.elapsed.total_seconds():.1f}s")

        if response.status_code == 200:
            print("   ✅ SUCCESS")
            try:
                result = response.json()
                if 'access' in result:
                    print(f"   🔑 Access token received (length: {len(result['access'])})")
                    return result['access']
                elif 'results' in result:
                    print(f"   📊 Data returned: {len(result['results'])} items")
                elif isinstance(result, list):
                    print(f"   📋 List returned: {len(result)} items")
                else:
                    print(f"   📝 Response: {str(result)[:100]}...")
            except:
                print(f"   📄 Raw response: {response.text[:100]}...")
            return True
        else:
            print("   ❌ FAILED")
            try:
                error = response.json()
                print(f"   Error: {error}")
            except:
                print(f"   Raw error: {response.text[:100]}...")
            return False

    except Exception as e:
        print(f"   ❌ ERROR: {e}")
        return False

def main():
    print("🚀 SafeTNet Server Multi-App Testing")
    print("=" * 50)

    BASE_URL = "http://localhost:8000"

    # Test 1: Root API
    test_endpoint("Root API", f"{BASE_URL}/")

    # Test 2: API Schema
    test_endpoint("API Schema", f"{BASE_URL}/api/schema/")

    # Test 3: API Docs
    test_endpoint("API Docs", f"{BASE_URL}/api/docs/")

    # Test 4: Security Officer Login
    print(f"\n🔐 Testing Security Officer Login...")
    login_data = {'username': 'officer001', 'password': 'test123'}
    login_response = requests.post(f"{BASE_URL}/api/auth/login/", json=login_data, timeout=10)

    if login_response.status_code == 200:
        login_data = login_response.json()
        access_token = login_data.get('access')
        refresh_token = login_data.get('refresh')
        user_data = login_data.get('user')

        print("   ✅ Login SUCCESSFUL")
        print(f"   👤 User: {user_data.get('username')} ({user_data.get('role')})")
        print(f"   🔑 Access Token: {access_token[:20]}... (length: {len(access_token)})")
        print(f"   🔄 Refresh Token: {refresh_token[:20]}... (length: {len(refresh_token)})")

        # Test 5: Dashboard API (Security Officer)
        test_endpoint("Dashboard API", f"{BASE_URL}/api/security/dashboard/", headers={'Authorization': f'Bearer {access_token}'})

        # Test 6: Alerts API (Security Officer)
        test_endpoint("Alerts API", f"{BASE_URL}/api/security/alerts/", headers={'Authorization': f'Bearer {access_token}'})

        # Test 7: Profile API (Security Officer)
        test_endpoint("Profile API", f"{BASE_URL}/api/auth/profile/", headers={'Authorization': f'Bearer {access_token}'})

        # Test 8: Active Alerts (Security Officer)
        test_endpoint("Active Alerts", f"{BASE_URL}/api/security/alerts/active/", headers={'Authorization': f'Bearer {access_token}'})

        # Test 9: Test Auth Endpoint
        test_endpoint("Test Auth", f"{BASE_URL}/api/auth/test-auth/", headers={'Authorization': f'Bearer {access_token}'})

    else:
        print("   ❌ Login FAILED - Cannot test protected endpoints")
        try:
            error = login_response.json()
            print(f"   Error: {error}")
        except:
            print(f"   Raw response: {login_response.text[:200]}...")

    # Test 10: CORS Headers (simulate different origins)
    print(f"\n🌐 Testing CORS Configuration...")
    headers = {'Origin': 'http://localhost:3000'}  # Simulate React app
    cors_response = requests.options(f"{BASE_URL}/api/auth/login/", headers=headers, timeout=10)
    if 'access-control-allow-origin' in cors_response.headers:
        print("   ✅ CORS configured properly")
    else:
        print("   ⚠️  CORS headers not found - may need configuration")
    print(f"   Headers: {dict(cors_response.headers)}")

    # Test 11: Static Files (if web interfaces are served)
    print(f"\n📁 Testing Static File Serving...")
    static_response = requests.get(f"{BASE_URL}/static/admin/css/base.css", timeout=10)
    if static_response.status_code == 200:
        print("   ✅ Static files served properly")
    else:
        print(f"   ⚠️  Static files not accessible (Status: {static_response.status_code})")

    print(f"\n" + "=" * 50)
    print("🏁 Server Multi-App Testing Complete!")
    print("\n📱 Frontend Applications that should work:")
    print("   • securityapp (React Native) - ✅ Login tested")
    print("   • userapp (React Native) - 🔄 API endpoints ready")
    print("   • admin-ui (Web) - 🔄 Static files configured")
    print("   • subadmin-ui (Web) - 🔄 Static files configured")
    print("   • safe-fleet-admin (Web) - 🔄 Static files configured")

if __name__ == '__main__':
    main()