$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
Write-Host "Initializing MSVC Environment and launching Tauri..." -ForegroundColor Cyan

$vcvars = "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
cmd /c "`"$vcvars`" && npm run tauri dev"
