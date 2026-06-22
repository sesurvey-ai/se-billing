@echo off
REM extenBoard - daily pull + upload to VPS (called by Task Scheduler ~06:00)
REM Logs go to run.log next to this file. Full python path is baked in so the
REM scheduled task does not depend on PATH.
cd /d "%~dp0"
echo ============================================================ >> run.log
echo [%date% %time%] start --daily >> run.log
"C:\Users\i9\AppData\Local\Programs\Python\Python313\python.exe" pull_data.py --daily >> run.log 2>&1
echo [%date% %time%] done (exit %errorlevel%) >> run.log
