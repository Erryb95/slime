# Corvo - MODULO 9: disinstallazione (utente corrente, senza amministratore).
#   doppio clic su uninstall.cmd  (oppure: powershell -ExecutionPolicy Bypass -File uninstall.ps1 [-Target dir])
# Toglie solo una cartella che contiene davvero Corvo; NON tocca l'installazione di sviluppo (junction).
# Licenza e data della prova restano in %APPDATA%\Corvo (reinstallando si ritrovano).
param(
    [string]$Target = (Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.corvo.nesting')
)
$ErrorActionPreference = 'Stop'
function Fail([string]$msg, [int]$code = 1) { Write-Host ""; Write-Host "ERRORE: $msg" -ForegroundColor Red; exit $code }

if (-not (Test-Path -LiteralPath $Target)) { Write-Host "Corvo non e' installato in $Target."; exit 0 }
$item = Get-Item -LiteralPath $Target -Force
if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    Fail ("$Target e' l'installazione di SVILUPPO (junction -> $(@($item.Target)[0])): non la tocco.`n" +
          "Se vuoi toglierla: cmd /c rmdir `"$Target`"  (rimuove solo il collegamento).") 2
}
$man = Join-Path $Target 'CSXS\manifest.xml'
$id = $null
if (Test-Path $man) { try { $id = ([xml](Get-Content -Raw -Encoding UTF8 $man)).ExtensionManifest.ExtensionBundleId } catch { $id = $null } }
if ($id -ne 'com.corvo.nesting') { Fail "$Target non sembra Corvo: non lo cancello." }
Remove-Item -Recurse -Force -LiteralPath $Target
Write-Host "Corvo rimosso da $Target." -ForegroundColor Green
Write-Host "Licenza e prova restano in $(Join-Path $env:APPDATA 'Corvo')."
exit 0
