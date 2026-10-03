@echo off
setlocal
set /p "PROJECT_NODE_VERSION=" < "%~dp0.nvmrc"
if not defined NVM_HOME (
  echo Error: NVM_HOME is not set. Install nvm-windows first. 1>&2
  exit /b 1
)
set "PROJECT_NODE_DIR=%NVM_HOME%\v%PROJECT_NODE_VERSION%"
if not exist "%PROJECT_NODE_DIR%\node.exe" (
  echo Error: Node.js %PROJECT_NODE_VERSION% is not installed. 1>&2
  echo Run: nvm install %PROJECT_NODE_VERSION% 1>&2
  exit /b 1
)
set "PATH=%PROJECT_NODE_DIR%;%PATH%"
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
pushd "%~dp0"
call "%PROJECT_NODE_DIR%\npm.cmd" %*
set "PROJECT_NPM_EXIT=%ERRORLEVEL%"
popd
exit /b %PROJECT_NPM_EXIT%
