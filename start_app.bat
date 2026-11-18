@echo off
setlocal enabledelayedexpansion

title Sentinel-X Industrial AI Ecosystem Launcher
echo ==============================================================================
echo                 SENTINEL-X: INDUSTRIAL IoT ECOSYSTEM LAUNCHER
echo         Real-Time Predictive Maintenance and Unsupervised Anomaly Detection
echo                   Architect and Developer: Paul Gallagher
echo ==============================================================================
echo.

:: Detect virtual environment if present
if exist ".venv\Scripts\activate.bat" (
    echo [INFO] Activating virtual environment: .venv...
    call .venv\Scripts\activate.bat
) else if exist "venv\Scripts\activate.bat" (
    echo [INFO] Activating virtual environment: venv...
    call venv\Scripts\activate.bat
)

:: Verify model artifacts exist, otherwise run pipeline
if not exist "models\artifacts\rul_regressor.joblib" (
    echo [WARN] Model artifacts not detected in models/artifacts/
    echo [INFO] Triggering autonomous ML training pipeline: run_pipeline.py...
    python run_pipeline.py
    if errorlevel 1 (
        echo [ERROR] Pipeline execution encountered an issue. Exiting launcher.
        pause
        exit /b 1
    )
)

echo.
echo [1/2] Launching Sentinel-X FastAPI Gateway on http://127.0.0.1:18000 ...
start "Sentinel-X FastAPI Port 18000" cmd /k "python -m uvicorn src.api.main:app --host 127.0.0.1 --port 18000 --reload"

echo [INFO] Waiting for FastAPI Gateway to initialize...
timeout /t 3 /nobreak >nul 2>&1 || ping 127.0.0.1 -n 4 >nul

echo [2/2] Launching Sentinel-X React Modern Dashboard on http://localhost:5175 ...
start "Sentinel-X React Frontend Port 5175" cmd /k "npm run dev --prefix frontend -- --port 5175"

echo.
echo ==============================================================================
echo SENTINEL-X IS NOW OPERATIONAL:
echo   - React Modern UI Dashboard: http://localhost:5175
echo   - Interactive Swagger Docs:  http://127.0.0.1:18000/docs
echo   - ReDoc API Specification:   http://127.0.0.1:18000/redoc
echo   - Backend Health Gateway:    http://127.0.0.1:18000/health
echo ==============================================================================
echo.
echo Opening Sentinel-X React Dashboard in your default browser...
timeout /t 2 /nobreak >nul 2>&1 || ping 127.0.0.1 -n 3 >nul

start http://localhost:5175
