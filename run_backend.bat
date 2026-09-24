@echo off
title FuelOS Backend
echo ==============================================
echo FuelOS Backend Sunucusu Baslatiliyor...
echo FastAPI: http://127.0.0.1:8000
echo Swagger Dokumantasyonu: http://127.0.0.1:8000/docs
echo ==============================================
cd backend
.\venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
pause
