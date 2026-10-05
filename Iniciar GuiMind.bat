@echo off
title GuiMind
rem Levanta el sitio en local leyendo el vault configurado en .env
rem y abre el navegador. Los cambios hechos en Obsidian se ven al guardar.
rem Para cerrarlo, cerra esta ventana.
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install || goto :error
)
call npm run dev -- --open || goto :error
exit /b 0

:error
echo.
echo No se pudo iniciar GuiMind. Revisa el mensaje de arriba.
pause
