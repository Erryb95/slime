# Corvo - MODULO 9: installazione per l'utente corrente, SENZA diritti di amministratore.
#   doppio clic su install.cmd  (oppure: powershell -ExecutionPolicy Bypass -File install.ps1 [-Zxp file.zxp] [-Target dir])
#
# Il file .zxp e' uno zip firmato: lo estrae in %APPDATA%\Adobe\CEP\extensions\com.corvo.nesting.
# Un'estensione firmata si carica senza PlayerDebugMode. Se al suo posto c'e' l'installazione di SVILUPPO (junction
# creata da plugin\tools\install-dev.ps1) si ferma: non la tocca, va tolta a mano prima.
# -Target: cartella di destinazione alternativa (test), stessa logica.
param(
    [string]$Zxp,
    [string]$Target = (Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.corvo.nesting')
)
$ErrorActionPreference = 'Stop'
$BundleId = 'com.corvo.nesting'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Fail([string]$msg, [int]$code = 1) { Write-Host ""; Write-Host "ERRORE: $msg" -ForegroundColor Red; exit $code }
function Get-BundleId([string]$manifestXml) {
    try { return ([xml]$manifestXml).ExtensionManifest.ExtensionBundleId } catch { return $null }
}

# ---------------------------------------------------------------- quale zxp
if (-not $Zxp) {
    $cands = @(Get-ChildItem -Path $PSScriptRoot -Filter 'Corvo-*.zxp' -File -ErrorAction SilentlyContinue)
    if (-not $cands.Count) {
        $dist = Join-Path $PSScriptRoot '..\..\..\dist'
        if (Test-Path $dist) { $cands = @(Get-ChildItem -Path $dist -Filter 'Corvo-*.zxp' -File) }
    }
    if (-not $cands.Count) { Fail "Nessun file Corvo-*.zxp accanto a install.ps1. Usa -Zxp <file>." }
    $Zxp = ($cands | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}
if (-not (Test-Path -LiteralPath $Zxp)) { Fail "File non trovato: $Zxp" }
$Zxp = (Resolve-Path -LiteralPath $Zxp).Path

# ---------------------------------------------------------------- controlli sul pacchetto
$zip = [IO.Compression.ZipFile]::OpenRead($Zxp)
try {
    $names = @($zip.Entries | ForEach-Object { $_.FullName })
    $manEntry = $zip.Entries | Where-Object { $_.FullName -eq 'CSXS/manifest.xml' } | Select-Object -First 1
    if (-not $manEntry) { Fail "$Zxp non e' un'estensione CEP (manca CSXS/manifest.xml)." }
    $sr = New-Object IO.StreamReader($manEntry.Open())
    $manXml = $sr.ReadToEnd(); $sr.Close()
    if ((Get-BundleId $manXml) -ne $BundleId) { Fail "Il pacchetto non e' Corvo ($BundleId)." }
    if (-not ($names -contains 'META-INF/signatures.xml')) { Fail "Il pacchetto non e' firmato (manca META-INF/signatures.xml)." }
    $version = ([xml]$manXml).ExtensionManifest.ExtensionBundleVersion
} finally { $zip.Dispose() }

Write-Host "Corvo $version"
Write-Host "  pacchetto : $Zxp"
Write-Host "  cartella  : $Target"

# ---------------------------------------------------------------- cosa c'e' gia' nella destinazione
if (Test-Path -LiteralPath $Target) {
    $item = Get-Item -LiteralPath $Target -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        $dest = @($item.Target)[0]
        Fail ("In $Target c'e' l'installazione di SVILUPPO di Corvo (junction -> $dest).`n" +
              "Non la tocco. Per passare alla versione firmata rimuovi prima il collegamento (la cartella del progetto resta intatta):`n" +
              "    cmd /c rmdir `"$Target`"`n" +
              "poi rilancia l'installazione.") 2
    }
    if (-not $item.PSIsContainer) { Fail "$Target esiste ed e' un file, non una cartella." }
    $oldMan = Join-Path $Target 'CSXS\manifest.xml'
    $oldId = if (Test-Path $oldMan) { Get-BundleId (Get-Content -Raw -Encoding UTF8 $oldMan) } else { $null }
    $empty = -not (Get-ChildItem -LiteralPath $Target -Force | Select-Object -First 1)
    if ($oldId -ne $BundleId -and -not $empty) { Fail "$Target contiene qualcosa che non e' Corvo: non lo sovrascrivo." }
}

# ---------------------------------------------------------------- estrazione (prima accanto, poi scambio)
$parent = Split-Path -Parent $Target
New-Item -ItemType Directory -Force $parent | Out-Null
$tag = [guid]::NewGuid().ToString('N').Substring(0, 8)
$staging = "$Target.new-$tag"
$backup = "$Target.old-$tag"
try {
    [IO.Compression.ZipFile]::ExtractToDirectory($Zxp, $staging)   # .NET rifiuta i percorsi che escono dalla cartella
    if (-not (Test-Path (Join-Path $staging 'CSXS\manifest.xml'))) { throw "estrazione incompleta" }
    if (Test-Path -LiteralPath $Target) { Rename-Item -LiteralPath $Target -NewName (Split-Path -Leaf $backup) }
    Rename-Item -LiteralPath $staging -NewName (Split-Path -Leaf $Target)
    if (Test-Path -LiteralPath $backup) { Remove-Item -Recurse -Force -LiteralPath $backup }
} catch {
    if (Test-Path -LiteralPath $staging) { Remove-Item -Recurse -Force -LiteralPath $staging }
    if ((Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $Target)) { Rename-Item -LiteralPath $backup -NewName (Split-Path -Leaf $Target) }
    Fail ("Installazione non riuscita: " + $_.Exception.Message)
}

$n = @(Get-ChildItem -LiteralPath $Target -Recurse -File -Force).Count
Write-Host ""
Write-Host "Installato: $n file in $Target" -ForegroundColor Green
if (Get-Process -Name 'Illustrator' -ErrorAction SilentlyContinue) {
    Write-Host "Illustrator e' aperto: chiudilo e riaprilo per caricare la nuova versione." -ForegroundColor Yellow
}
Write-Host "In Illustrator: Finestra > Estensioni > Corvo Nesting."
exit 0
