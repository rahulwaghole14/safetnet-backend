#!/usr/bin/env python
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'SafeTNet.settings')
django.setup()

from django.db import connection
cursor = connection.cursor()

# Get all tables
cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public';")
tables = cursor.fetchall()

print('Tables in Neon database:')
print('=' * 40)
for table in tables:
    print(f'  - {table[0]}')

print(f'\nTotal tables: {len(tables)}')

# Check if key tables exist
required_tables = ['users_user', 'auth_user', 'security_app_sosalert', 'users_organization']
print('\nKey tables check:')
for table in required_tables:
    exists = any(table in t[0] for t in tables)
    status = 'EXISTS' if exists else 'MISSING'
    print(f'  - {table}: {status}')