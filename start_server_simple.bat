@echo off
cd C:\Users\ADMIN\Desktop\SafeTNet\safetnet\SafeTNet
call venv\Scripts\activate.bat
python manage.py runserver 0.0.0.0:8000
pause