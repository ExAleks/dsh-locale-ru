@echo off
rem Apply or revert the Russian desktop-shell patch of DeepSeek Harness.
rem
rem The Electron shell keeps its own menu/dialog dictionaries inside app.asar, so
rem the patch has to replace that file. The application must be closed: this script
rem waits for it, keeps a one-time backup and relaunches the app when it is done.
rem
rem   tools\apply-desktop-menu.cmd apply  ["<install dir>"] ["<patched app.asar>"]
rem   tools\apply-desktop-menu.cmd revert ["<install dir>"]
setlocal
set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=apply"
set "INSTALL=%~2"
if "%INSTALL%"=="" set "INSTALL=%LOCALAPPDATA%\Programs\DeepSeek Harness"
set "PATCHED=%~3"
if "%PATCHED%"=="" set "PATCHED=%~dp0..\..\ref\app.asar.patched"
set "ASAR=%INSTALL%\resources\app.asar"
set "BACKUP=%ASAR%.backup"
set "EXE=%INSTALL%\DeepSeek Harness.exe"

if /i "%ACTION%"=="apply" goto apply
if /i "%ACTION%"=="revert" goto revert
echo usage: apply-desktop-menu.cmd [apply^|revert] ["install dir"] ["patched app.asar"]
exit /b 2

:waitclosed
tasklist /FI "IMAGENAME eq DeepSeek Harness.exe" 2>nul | find /I "DeepSeek Harness.exe" >nul
if errorlevel 1 exit /b 0
echo Waiting for DeepSeek Harness to close...
timeout /t 3 /nobreak >nul
goto waitclosed

:apply
if not exist "%ASAR%" (
  echo Cannot find "%ASAR%"
  exit /b 1
)
if not exist "%PATCHED%" (
  echo Cannot find the patched archive "%PATCHED%"
  echo Build it first:  node tools\patch-desktop-locale.mjs --asar "%ASAR%"
  exit /b 1
)
echo Close DeepSeek Harness to apply the patch.
call :waitclosed
if not exist "%BACKUP%" (
  echo Backing up the original app.asar to "%BACKUP%" ...
  copy /y "%ASAR%" "%BACKUP%" >nul
  if errorlevel 1 (
    echo Backup failed. Nothing was changed.
    exit /b 1
  )
)
echo Applying the Russian shell patch ...
copy /y "%PATCHED%" "%ASAR%" >nul
if errorlevel 1 (
  echo Replacing app.asar failed. The backup is kept at "%BACKUP%".
  exit /b 1
)
echo Done.
call :relaunch
exit /b 0

:revert
if not exist "%ASAR%" (
  echo Cannot find "%ASAR%"
  exit /b 1
)
if not exist "%BACKUP%" (
  echo No backup at "%BACKUP%" - nothing to revert.
  exit /b 1
)
echo Close DeepSeek Harness to revert the patch.
call :waitclosed
echo Restoring the original app.asar ...
copy /y "%BACKUP%" "%ASAR%" >nul
if errorlevel 1 (
  echo Restore failed.
  exit /b 1
)
echo Done.
call :relaunch
exit /b 0

:relaunch
rem Deliberately no automatic start. Any process launched from this console is
rem attached to it, and Windows terminates every attached process when the console
rem window closes - that is exactly how the app was killed after the first run.
rem A launch from Explorer or the Start menu belongs to the shell, so the app is
rem never tied to this window.
echo.
echo The patch is applied. Start DeepSeek Harness yourself - its shortcut or the
echo Start menu - so the app is not tied to this window:
echo   "%EXE%"
echo You can close this window at any time.
exit /b 0
