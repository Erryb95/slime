# Installazione di sviluppo di Corvo (idempotente):
#  1) junction %APPDATA%\Adobe\CEP\extensions\com.corvo.nesting -> cartella plugin
#  2) PlayerDebugMode=1 per CSXS.9 .. CSXS.13 (estensioni non firmate)
# Uso: powershell -ExecutionPolicy Bypass -File tools\install-dev.ps1
$ErrorActionPreference = 'Stop'
$pluginDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$extRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$link = Join-Path $extRoot 'com.corvo.nesting'

if (-not (Test-Path $extRoot)) { New-Item -ItemType Directory -Force $extRoot | Out-Null }

if (Test-Path $link) {
    $item = Get-Item $link -Force
    if ($item.LinkType -eq 'Junction' -or $item.LinkType -eq 'SymbolicLink') {
        $target = @($item.Target)[0]
        if ($target -and ((Resolve-Path $target).Path.TrimEnd('\') -ieq $pluginDir.TrimEnd('\'))) {
            Write-Output "Junction gia' presente: $link -> $target"
        } else {
            Write-Output "Junction esistente punta altrove ($target): la ricreo"
            cmd /c rmdir "$link" | Out-Null
            cmd /c mklink /J "$link" "$pluginDir" | Out-Null
            Write-Output "Junction creata: $link -> $pluginDir"
        }
    } else {
        throw "$link esiste ed e' una cartella vera: rimuovila a mano se vuoi usare la junction."
    }
} else {
    cmd /c mklink /J "$link" "$pluginDir" | Out-Null
    Write-Output "Junction creata: $link -> $pluginDir"
}

foreach ($v in 9..13) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    $cur = (Get-ItemProperty -Path $key -Name PlayerDebugMode -ErrorAction SilentlyContinue).PlayerDebugMode
    if ($cur -ne '1') {
        Set-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -Type String
        Write-Output "CSXS.$v PlayerDebugMode=1 (era: $cur)"
    } else {
        Write-Output "CSXS.$v PlayerDebugMode gia' 1"
    }
}
Write-Output "Fatto. Riavvia Illustrator per vedere Finestra > Estensioni > Corvo Nesting."
