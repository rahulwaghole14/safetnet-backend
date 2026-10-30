#!/usr/bin/env python
import requests
import json

print('Testing Security Officer Login Endpoint...')
print('URL: http://localhost:8000/api/security/login/')
print()

data = {'username': 'officer001', 'password': 'test123'}

try:
    response = requests.post('http://localhost:8000/api/security/login/', json=data, timeout=10)
    print(f'Status Code: {response.status_code}')
    print(f'Response Time: {response.elapsed.total_seconds():.1f}s')
    print()

    if response.status_code == 200:
        result = response.json()
        print('SUCCESS: Security officer login works!')
        access_token = result.get('access', 'MISSING')
        refresh_token = result.get('refresh', 'MISSING')
        user = result.get('user', {})

        print(f'Access Token: {access_token[:20]}... (length: {len(access_token)})')
        print(f'Refresh Token: {refresh_token[:20]}... (length: {len(refresh_token)})')
        print(f'User: {user.get("username", "MISSING")}')
        print(f'Role: {user.get("role", "MISSING")}')
        print()
        print('✅ Security Officer App can now receive access tokens!')
    else:
        print('FAILED: Login failed')
        try:
            error = response.json()
            print(f'Error: {error}')
        except:
            print(f'Raw response: {response.text[:200]}...')

except Exception as e:
    print(f'ERROR: {e}')