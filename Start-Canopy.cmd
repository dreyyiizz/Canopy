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
  python -m venv .venv
  if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -c "import serial" >nul 2>nul
if errorlevel 1 (
  ".venv\Scripts\python.exe" -m pip install --no-index --find-links bridge\vendor -r bridge\requirements.txt
  if errorlevel 1 goto failed
)
echo.
echo CANOPY - PLANT ROOF GROUP PROJECT
echo.
".venv\Scripts\python.exe" bridge\server.py --list-ports
echo.
set /p "canopyPort=Enter Arduino port (example COM3), or DEMO: "
if /i "%canopyPort%"=="DEMO" (
  ".venv\Scripts\python.exe" bridge\server.py --demo
) else (
  ".venv\Scripts\python.exe" bridge\server.py --port "%canopyPort%"
)
pause
exit /b
:failed
echo Setup failed. Check your Python installation and the bridge\vendor folder.
pause
exit /b 1
