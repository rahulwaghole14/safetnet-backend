#!/usr/bin/env python
import requests

print('Testing API Endpoints...')
print('=' * 50)

# Test 1: Security Officer Login
print('\n[TEST 1] Security Officer Login')
print('POST http://localhost:8000/api/security/login/')

data = {'username': 'officer001', 'password': 'test123'}
try:
    response = requests.post('http://localhost:8000/api/security/login/', json=data, timeout=10)
    print(f'Status: {response.status_code}')
    print(f'Response Time: {response.elapsed.total_seconds():.1f}s')

    if response.status_code == 200:
        result = response.json()
        access_token = result.get('access', '')
        user = result.get('user', {})
        print('✅ SUCCESS: Security officer login works!')
        print(f'Access Token: {len(access_token)} characters')
        print(f'User: {user.get("username")} ({user.get("role")})')
    else:
        print('❌ FAILED: Security officer login failed')
        print(f'Response: {response.text[:200]}...')

except Exception as e:
    print(f'❌ ERROR: {e}')

# Test 2: Admin Login
print('\n[TEST 2] Admin Login')
print('POST http://localhost:8000/api/auth/login/')

admin_data = {'username': 'admin', 'password': 'admin123'}
try:
    response = requests.post('http://localhost:8000/api/auth/login/', json=admin_data, timeout=10)
    print(f'Status: {response.status_code}')
    print(f'Response Time: {response.elapsed.total_seconds():.1f}s')

    if response.status_code == 200:
        result = response.json()
        access_token = result.get('access', '')
        user = result.get('user', {})
        print('✅ SUCCESS: Admin login works!')
        print(f'Access Token: {len(access_token)} characters')
        print(f'User: {user.get("username")}')
    else:
        print('❌ FAILED: Admin login failed')
        print(f'Response: {response.text[:200]}...')

except Exception as e:
    print(f'❌ ERROR: {e}')

print('\n' + '=' * 50)
print('API Testing Complete!')