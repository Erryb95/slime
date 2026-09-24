# Corvo - MODULO 9: test di install.ps1 / uninstall.ps1 su una cartella TEMPORANEA (mai quella vera di CEP,
# dove c'e' la junction di sviluppo). Richiede dist\Corvo-<versione>.zxp (build-zxp.ps1).
#   powershell -ExecutionPolicy Bypass -File plugin\tools\release\test-install.ps1
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$zxp = Get-ChildItem (Join-Path $repo 'dist') -Filter 'Corvo-*.zxp' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $zxp) { throw "Manca dist\Corvo-*.zxp: lancia prima build-zxp.ps1" }
$zxpSign = Join-Path $env:USERPROFILE '.config\corvo\bin\ZXPSignCmd.exe'
$install = Join-Path $PSScriptRoot 'install.ps1'
$uninstall = Join-Path $PSScriptRoot 'uninstall.ps1'
$realExt = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.corvo.nesting'

$script:fails = 0; $script:passes = 0
function Check([bool]$ok, [string]$msg) { if ($ok) { $script:passes++ } else { $script:fails++; Write-Output "  FAIL: $msg" } }
function Run([string]$ps1, [string[]]$a) {
    $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ps1 @a 2>&1 | Out-String
    return @{ code = $LASTEXITCODE; out = $out }
}
function LinkState([string]$p) {
    if (-not (Test-Path -LiteralPath $p)) { return 'assente' }
    $i = Get-Item -LiteralPath $p -Force
    if ($i.Attributes -band [IO.FileAttributes]::ReparsePoint) { return "junction->" + @($i.Target)[0] }
    return 'cartella'
}

$before = LinkState $realExt
$root = Join-Path $env:TEMP ("corvo-inst-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $root | Out-Null
try {
    $target = Join-Path $root 'extensions\com.corvo.nesting'

    # 1) installazione pulita
    $r = Run $install @('-Zxp', $zxp.FullName, '-Target', $target)
    Check ($r.code -eq 0) "installazione pulita: codice $($r.code) $($r.out)"
    Check (Test-Path (Join-Path $target 'CSXS\manifest.xml')) 'manifest installato'
    Check (Test-Path (Join-Path $target 'META-INF\signatures.xml')) 'firma installata'
    Check (Test-Path (Join-Path $target 'client\lib\corvo_bg.wasm')) 'motore wasm installato'
    Check (-not (Test-Path (Join-Path $target 'tools'))) 'niente tools/ nel pacchetto'
    Check (-not (Test-Path (Join-Path $target '.debug'))) 'niente .debug nel pacchetto'
    if (Test-Path $zxpSign) {
        $v = & $zxpSign -verify $target 2>&1 | Out-String
        Check ($LASTEXITCODE -eq 0 -and $v -match 'Signature verified successfully') "firma valida sulla cartella installata: $v"
    }
    Check (-not (Get-ChildItem (Split-Path $target) -Force | Where-Object { $_.Name -match '\.(new|old)-' })) 'nessuna cartella temporanea .new/.old rimasta'

    # 2) aggiornamento sopra un'installazione esistente
    Set-Content -Path (Join-Path $target 'client\js\vecchio.js') -Value '// file di una versione precedente'
    $r = Run $install @('-Zxp', $zxp.FullName, '-Target', $target)
    Check ($r.code -eq 0) "aggiornamento: codice $($r.code)"
    Check (-not (Test-Path (Join-Path $target 'client\js\vecchio.js'))) 'aggiornamento: file vecchi tolti (firma resta valida)'

    # 3) junction di sviluppo al posto della cartella -> si ferma e non la tocca
    $devDir = Join-Path $root 'dev-plugin'
    New-Item -ItemType Directory -Force (Join-Path $devDir 'CSXS') | Out-Null
    Set-Content -Path (Join-Path $devDir 'CSXS\manifest.xml') -Value '<ExtensionManifest ExtensionBundleId="com.corvo.nesting"/>'
    $jTarget = Join-Path $root 'ext2\com.corvo.nesting'
    New-Item -ItemType Directory -Force (Split-Path $jTarget) | Out-Null
    cmd /c mklink /J "$jTarget" "$devDir" | Out-Null
    $r = Run $install @('-Zxp', $zxp.FullName, '-Target', $jTarget)
    Check ($r.code -eq 2) "junction: install deve fermarsi con codice 2 (avuto $($r.code))"
    Check ($r.out -match 'SVILUPPO' -and $r.out -match 'rmdir') 'junction: messaggio con istruzioni'
    Check ((LinkState $jTarget) -like 'junction->*') 'junction intatta dopo install'
    Check (@(Get-ChildItem $devDir -Recurse -File).Count -eq 1) 'cartella di sviluppo intatta'
    $r = Run $uninstall @('-Target', $jTarget)
    Check ($r.code -eq 2 -and (LinkState $jTarget) -like 'junction->*') 'uninstall rifiuta la junction'
    cmd /c rmdir "$jTarget" | Out-Null

    # 4) cartella con altro contenuto -> non sovrascrive
    $foreign = Join-Path $root 'ext3\com.corvo.nesting'
    New-Item -ItemType Directory -Force $foreign | Out-Null
    Set-Content -Path (Join-Path $foreign 'altro.txt') -Value 'x'
    $r = Run $install @('-Zxp', $zxp.FullName, '-Target', $foreign)
    Check ($r.code -ne 0 -and (Test-Path (Join-Path $foreign 'altro.txt'))) 'cartella estranea non sovrascritta'
    $r = Run $uninstall @('-Target', $foreign)
    Check ($r.code -ne 0 -and (Test-Path (Join-Path $foreign 'altro.txt'))) 'uninstall non cancella una cartella estranea'

    # 5) pacchetto non firmato -> rifiutato
    $unsigned = Join-Path $root 'nonfirmato.zxp'
    $tmpU = Join-Path $root 'u'; New-Item -ItemType Directory -Force (Join-Path $tmpU 'CSXS') | Out-Null
    Copy-Item (Join-Path $target 'CSXS\manifest.xml') (Join-Path $tmpU 'CSXS')
    Compress-Archive -Path (Join-Path $tmpU '*') -DestinationPath ($unsigned -replace '\.zxp$', '.zip')
    Move-Item ($unsigned -replace '\.zxp$', '.zip') $unsigned
    $r = Run $install @('-Zxp', $unsigned, '-Target', (Join-Path $root 'ext4\com.corvo.nesting'))
    Check ($r.code -ne 0 -and $r.out -match 'firmato') 'pacchetto non firmato rifiutato'

    # 6) disinstallazione
    $r = Run $uninstall @('-Target', $target)
    Check ($r.code -eq 0 -and -not (Test-Path $target)) 'disinstallazione'
    $r = Run $uninstall @('-Target', $target)
    Check ($r.code -eq 0) 'disinstallazione ripetuta: nessun errore'
}
finally {
    Get-ChildItem $root -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint } |
        ForEach-Object { cmd /c rmdir "$($_.FullName)" | Out-Null }
    Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
}
$after = LinkState $realExt
Check ($before -eq $after) "installazione vera di CEP non toccata ($before -> $after)"
Write-Output "test-install: $script:passes ok, $script:fails falliti (estensione vera: $after)"
exit $(if ($script:fails) { 1 } else { 0 })
