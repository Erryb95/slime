# Corvo - MODULO 9: pacchetto ZXP firmato per Windows.
#   powershell -ExecutionPolicy Bypass -File plugin\tools\release\build-zxp.ps1 [-NoTimestamp] [-ConfigDir <dir>]
#
# 1) copia plugin\ in una cartella di staging SENZA i file di sviluppo (.debug, tools\, test, mappe, .DS_Store...)
# 2) controlla che nello staging non ci siano link simbolici/junction ne' .DS_Store/__MACOSX (rompono la firma, vedi
#    Adobe-CEP/CEP-Resources ZXPSignCMD/KnownIssue2024.md)
# 3) firma con ZXPSignCmd (+ marca temporale -tsa http://timestamp.digicert.com) -> dist\Corvo-<versione>.zxp
# 4) verifica con ZXPSignCmd -verify, e prepara dist\Corvo-<versione>-win\ (zxp + install.cmd/ps1 + uninstall)
#
# Segreti FUORI dal repo, in -ConfigDir (default %USERPROFILE%\.config\corvo):
#   bin\ZXPSignCmd.exe   (Adobe, CEP-Resources/ZXPSignCMD/4.1.3/x64)
#   corvo-cert.p12       certificato autofirmato
#   cert.txt             riga "password=<...>" (ed eventualmente "p12=<file>")
param(
    [string]$ConfigDir = (Join-Path $env:USERPROFILE '.config\corvo'),
    [string]$Tsa = 'http://timestamp.digicert.com',
    [switch]$NoTimestamp
)
$ErrorActionPreference = 'Stop'

$pluginDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$repoDir = (Resolve-Path (Join-Path $pluginDir '..')).Path
$dist = Join-Path $repoDir 'dist'

# ---------------------------------------------------------------- versione dal manifest (0.9.0.beta -> 0.9.0-beta)
[xml]$man = Get-Content -Raw -Encoding UTF8 (Join-Path $pluginDir 'CSXS\manifest.xml')
$bundleVer = $man.ExtensionManifest.ExtensionBundleVersion
$bundleId = $man.ExtensionManifest.ExtensionBundleId
$version = $bundleVer -replace '^(\d+\.\d+\.\d+)\.(.+)$', '$1-$2'
$licJs = Get-Content -Raw -Encoding UTF8 (Join-Path $pluginDir 'client\js\license.js')
if ($licJs -notmatch "var VERSION = '$([regex]::Escape($version))'") { throw "Versione diversa tra manifest ($version) e client/js/license.js" }
Write-Output "Corvo $version ($bundleId)"

# ---------------------------------------------------------------- strumenti e certificato
$zxpSign = Join-Path $ConfigDir 'bin\ZXPSignCmd.exe'
$certTxt = Join-Path $ConfigDir 'cert.txt'
if (-not (Test-Path $zxpSign)) { throw "ZXPSignCmd mancante: $zxpSign (vedi docs/release.md)" }
if (-not (Test-Path $certTxt)) { throw "cert.txt mancante: $certTxt (vedi docs/release.md)" }
$cfg = @{}
foreach ($line in Get-Content $certTxt) { if ($line -match '^\s*([^=#]+?)\s*=\s*(.*)$') { $cfg[$Matches[1]] = $Matches[2] } }
$password = $cfg['password']
$p12 = Join-Path $ConfigDir $(if ($cfg['p12']) { $cfg['p12'] } else { 'corvo-cert.p12' })
if (-not $password) { throw "cert.txt senza riga password=..." }
if (-not (Test-Path $p12)) { throw "Certificato mancante: $p12" }

# ---------------------------------------------------------------- staging
$stageRoot = Join-Path $env:TEMP ("corvo-zxp-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$stage = Join-Path $stageRoot $bundleId
New-Item -ItemType Directory -Force $stage | Out-Null
try {
    # solo quello che serve in esecuzione; tutto il resto (tools\, .debug, test) resta fuori
    $include = @('CSXS', 'client', 'host')
    foreach ($d in $include) {
        $src = Join-Path $pluginDir $d
        if (-not (Test-Path $src)) { throw "Manca $src" }
        $srcItem = Get-Item $src -Force
        if ($srcItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "$src e' un link: copia la cartella vera" }
        # robocopy: /E sottocartelle, /XJ niente junction, /XF /XD esclusioni; codici 0-7 = ok
        $null = robocopy $src (Join-Path $stage $d) /E /XJ /NFL /NDL /NJH /NJS /NP `
            /XF .debug .DS_Store Thumbs.db desktop.ini '*.map' '*.log' 'test_*' '*.test.js' '*.orig' '*.bak' '*~' `
            /XD .git node_modules __MACOSX tests test '.vscode' '.idea'
        if ($LASTEXITCODE -ge 8) { throw "robocopy $d fallito (codice $LASTEXITCODE)" }
    }
    $global:LASTEXITCODE = 0

    # controlli: niente link, niente file di sviluppo o di sistema
    $all = Get-ChildItem -LiteralPath $stage -Recurse -Force
    $links = $all | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
    if ($links) { throw ("Link simbolici/junction nello staging: " + ($links.FullName -join ', ')) }
    $junk = $all | Where-Object { $_.Name -in @('.DS_Store', '__MACOSX', '.debug', 'Thumbs.db') -or $_.Name -like '._*' }
    if ($junk) { throw ("File da escludere nello staging: " + ($junk.FullName -join ', ')) }
    if (-not (Test-Path (Join-Path $stage 'CSXS\manifest.xml'))) { throw "manifest mancante nello staging" }
    if (-not (Test-Path (Join-Path $stage 'client\lib\corvo_bg.wasm'))) { throw "motore wasm mancante (plugin/tools/build.sh)" }
    $files = @($all | Where-Object { -not $_.PSIsContainer })
    $bytes = ($files | Measure-Object Length -Sum).Sum
    Write-Output ("Staging: {0} file, {1:N0} KB -> {2}" -f $files.Count, ($bytes / 1KB), $stage)

    # ---------------------------------------------------------------- firma
    New-Item -ItemType Directory -Force $dist | Out-Null
    $zxp = Join-Path $dist "Corvo-$version.zxp"
    if (Test-Path $zxp) { Remove-Item -Force $zxp }
    $signArgs = @('-sign', $stage, $zxp, $p12, $password)
    if (-not $NoTimestamp) { $signArgs += @('-tsa', $Tsa) }
    $out = & $zxpSign @signArgs 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $zxp)) {
        throw ("Firma fallita (codice $LASTEXITCODE): " + (($out | Out-String) -replace [regex]::Escape($password), '***'))
    }
    Write-Output ("Firmato: $zxp" + $(if ($NoTimestamp) { ' (senza marca temporale)' } else { " (marca temporale $Tsa)" }))

    # ---------------------------------------------------------------- verifica
    $ver = & $zxpSign -verify $zxp -certInfo -skipOnlineRevocationChecks 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or $ver -notmatch 'Signature verified successfully') { throw "Verifica fallita:`n$ver" }
    Write-Output "Verifica ZXPSignCmd: OK"
    $ver.Trim().Split("`n") | Where-Object { $_ -match 'Timestamp|Signing Certificate|Valid|Signature' } | ForEach-Object { Write-Output ("  " + $_.Trim()) }

    # ---------------------------------------------------------------- cartella di distribuzione (zxp + installer)
    $pkg = Join-Path $dist "Corvo-$version-win"
    if (Test-Path $pkg) { Remove-Item -Recurse -Force $pkg }
    New-Item -ItemType Directory -Force $pkg | Out-Null
    Copy-Item $zxp $pkg
    foreach ($f in @('install.ps1', 'install.cmd', 'uninstall.ps1', 'uninstall.cmd')) { Copy-Item (Join-Path $PSScriptRoot $f) $pkg }
    $zipOut = Join-Path $dist "Corvo-$version-win.zip"
    if (Test-Path $zipOut) { Remove-Item -Force $zipOut }
    Compress-Archive -Path (Join-Path $pkg '*') -DestinationPath $zipOut
    $hash = (Get-FileHash -Algorithm SHA256 $zxp).Hash.ToLower()
    Set-Content -Encoding ASCII -Path "$zxp.sha256" -Value "$hash  Corvo-$version.zxp"
    Write-Output "Pacchetto: $pkg  (+ $zipOut)"
    Write-Output "SHA-256 zxp: $hash"
}
finally {
    if (Test-Path $stageRoot) { Remove-Item -Recurse -Force $stageRoot }
}
