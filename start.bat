@echo off
echo.
echo  ============================
echo   NEO - AI nel Browser
echo  ============================
echo.
echo  Avvio server locale...
echo  Apri http://localhost:8080
echo.
python -m http.server 8080 --directory "%~dp0"
pause
