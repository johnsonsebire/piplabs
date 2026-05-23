@echo off
:: ============================================================================
:: Deriv AI Trader — Start Script (Windows)
:: Double-click this file or run it from a terminal to launch all services.
:: ============================================================================

pushd "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1"
popd
