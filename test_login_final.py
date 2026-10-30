#!/usr/bin/env python
import requests
import json

print('Testing Security Officer Login Endpoint...')
print('URL: http://localhost:8000/api/security/login/')
print()

data = {'username': 'officer001', 'password': 'test123'}

try:
    response = requests.post('http://localhost:8000/api/security/login/', json=data, timeout=10)
    print(f'Status: {response.status_code}')
    print(f'Response Time: {response.elapsed.total_seconds():.1f}s')

    if response.status_code == 200:
        result = response.json()
        access_token = result.get('access', 'MISSING')
        user = result.get('user', {})

        print('SUCCESS: Login works!')
        print(f'Access Token: RECEIVED ({len(access_token)} chars)')
        print(f'User: {user.get("username", "MISSING")}')
        print(f'Role: {user.get("role", "MISSING")}')
        print()
        print('The React Native app should now be able to connect!')
    else:
        print('FAILED: Login failed')
        try:
            error = response.json()
            print(f'Error: {error}')
        except:
            print(f'Raw response: {response.text[:200]}...')

except Exception as e:
    print(f'CONNECTION ERROR: {e}')