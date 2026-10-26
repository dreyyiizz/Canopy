@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python is missing. Install Python 3 from python.org and enable Add Python to PATH.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo Creating Python virtual environment...
  python -m venv .venv
  if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -c "import serial" >nul 2>nul
if errorlevel 1 (
  echo Installing required USB library...
  ".venv\Scripts\python.exe" -m pip install --no-index --find-links bridge\vendor -r bridge\requirements.txt
  if errorlevel 1 goto failed
)
cls
echo.
echo ==============================================================
echo CANOPY - PLANT ROOF WEB CONTROL
echo ==============================================================
echo.
echo Available Arduino ports:
echo.
".venv\Scripts\python.exe" bridge\server.py --list-ports
echo.
set /p "canopyPort=Enter Arduino COM port (e.g., COM3), or type DEMO: "
echo.
if /i "%canopyPort%"=="DEMO" (
  echo Starting in DEMO mode - no hardware will move
  echo Your browser will open automatically at http://127.0.0.1:8765
  echo.
  ".venv\Scripts\python.exe" bridge\server.py --demo
) else (
  echo Starting web server with Arduino on %canopyPort%
  echo Your browser will open automatically at http://127.0.0.1:8765
  echo.
  ".venv\Scripts\python.exe" bridge\server.py --port "%canopyPort%"
)
pause
exit /b
:failed
echo.
echo Setup failed. Check your Python installation and the bridge\vendor folder.
pause
exit /b 1
