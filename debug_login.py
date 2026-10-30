#!/usr/bin/env python
import requests
import json

print('=== Detailed Login Test ===')
print()

url = 'http://localhost:8000/api/security/login/'
data = {'username': 'officer001', 'password': 'test123'}

try:
    response = requests.post(url, json=data, timeout=10)
    print(f'Status Code: {response.status_code}')
    print(f'Response Time: {response.elapsed.total_seconds():.1f}s')
    print(f'Content-Type: {response.headers.get("Content-Type", "Not set")}')
    print()

    if response.status_code == 200:
        try:
            result = response.json()
            print('Response JSON:')
            for key, value in result.items():
                if 'token' in key.lower() or 'access' in key.lower() or 'refresh' in key.lower():
                    if isinstance(value, str) and len(value) > 20:
                        print(f'  {key}: {value[:20]}... (length: {len(value)})')
                    else:
                        print(f'  {key}: {value}')
                else:
                    print(f'  {key}: {value}')

            print()
            print('Token Analysis:')
            print(f'  access token present: {"access" in result}')
            print(f'  refresh token present: {"refresh" in result}')
            if 'access' in result:
                print(f'  access token length: {len(result["access"])}')
            if 'refresh' in result:
                print(f'  refresh token length: {len(result["refresh"])}')

        except json.JSONDecodeError as e:
            print(f'JSON decode error: {e}')
            print('Raw response:', response.text[:500])
    else:
        print('Login failed!')
        try:
            error = response.json()
            print(f'Error response: {error}')
        except:
            print(f'Raw error response: {response.text[:500]}')

except Exception as e:
    print(f'Request failed: {e}')

print()
print('=== Test Complete ===')