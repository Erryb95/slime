# Elite FPS Asset Puller - Fixed Version
# Downloads best-in-class FPS assets from elite GitHub repositories

param(
    [string]$BaseDir = "client/public/assets/elite-fps"
)

# Check for GitHub token
if (-not $env:GITHUB_TOKEN) {
    Write-Host "❌ GITHUB_TOKEN environment variable not set!" -ForegroundColor Red
    Write-Host "Please set your GitHub token: `$env:GITHUB_TOKEN = 'your_token_here'" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    'Authorization' = "token $env:GITHUB_TOKEN"
    'User-Agent'    = 'EliteFPSAssetPuller/1.0'
}

# Create base directory
$baseDir = Join-Path (Get-Location) $BaseDir
if (-not (Test-Path $baseDir)) {
    New-Item -ItemType Directory -Path $baseDir -Force | Out-Null
}

# Elite repositories with high-quality FPS assets
$eliteRepos = @(
    @{ Owner = "KhronosGroup"; Repo = "glTF-Sample-Models"; Category = "characters"; Priority = @("2.0") },
    @{ Owner = "microsoft"; Repo = "MixedRealityToolkit-Unity"; Category = "systems"; Priority = @("Assets", "Examples") },
    @{ Owner = "Unity-Technologies"; Repo = "FPSSample"; Category = "weapons"; Priority = @("Assets", "Packages") },
    @{ Owner = "UnityTechnologies"; Repo = "3d-game-kit"; Category = "environments"; Priority = @("3DGamekit", "Assets") },
    @{ Owner = "EpicGames"; Repo = "UnrealEngine"; Category = "maps"; Priority = @("Templates", "Engine") },
    @{ Owner = "id-Software"; Repo = "DOOM-3-BFG"; Category = "maps"; Priority = @("base", "d3xp") },
    @{ Owner = "google"; Repo = "model-viewer"; Category = "characters"; Priority = @("packages", "shared-assets") },
    @{ Owner = "BabylonJS"; Repo = "Babylon.js"; Category = "systems"; Priority = @("assets", "Playground") },
    @{ Owner = "mrdoob"; Repo = "three.js"; Category = "environments"; Priority = @("examples", "editor") },
    @{ Owner = "pmndrs"; Repo = "react-three-fiber"; Category = "systems"; Priority = @("examples", "docs") }
)

function Get-EliteAssets {
    param(
        [string]$Owner,
        [string]$Repo,
        [string]$Category,
        [array]$Priority,
        [int]$MaxAssets = 5
    )
    
    Write-Host "🔍 Scanning $Owner/$Repo for $Category assets..." -ForegroundColor Yellow
    
    try {
        # Get repository contents
        $repoUrl = "https://api.github.com/repos/$Owner/$Repo/contents"
        $response = Invoke-RestMethod -Uri $repoUrl -Headers $headers
        
        $downloadCount = 0
        $targetExtensions = @('.gltf', '.glb', '.fbx', '.obj', '.dae', '.babylon', '.blend')
        
        # Create category directory
        $categoryDir = Join-Path $baseDir $Category
        if (-not (Test-Path $categoryDir)) {
            New-Item -ItemType Directory -Path $categoryDir -Force | Out-Null
        }
        
        # Process priority directories
        foreach ($priorityPath in $Priority) {
            if ($downloadCount -ge $MaxAssets) { break }
            
            $priorityItems = $response | Where-Object { $_.name -eq $priorityPath -and $_.type -eq "dir" }
            
            foreach ($priorityItem in $priorityItems) {
                Write-Host "📂 Exploring: $($priorityItem.name)" -ForegroundColor Cyan
                
                try {
                    $dirResponse = Invoke-RestMethod -Uri $priorityItem.url -Headers $headers
                    
                    foreach ($item in $dirResponse) {
                        if ($downloadCount -ge $MaxAssets) { break }
                        
                        if ($item.type -eq "file") {
                            $extension = [System.IO.Path]::GetExtension($item.name).ToLower()
                            
                            if ($targetExtensions -contains $extension) {
                                $localPath = Join-Path $categoryDir $item.name
                                
                                Write-Host "⬇️ Downloading: $($item.name)" -ForegroundColor Green
                                Invoke-WebRequest -Uri $item.download_url -OutFile $localPath
                                $downloadCount++
                                
                                Write-Host "✅ Saved: $localPath" -ForegroundColor Green
                            }
                        }
                    }
                }
                catch {
                    Write-Host "⚠️ Could not access: $priorityPath" -ForegroundColor Yellow
                }
            }
        }
        
        Write-Host "📊 Downloaded $downloadCount assets from $Owner/$Repo" -ForegroundColor Magenta
        return $downloadCount
        
    }
    catch {
        Write-Host "❌ Error accessing $Owner/$Repo`: $($_.Exception.Message)" -ForegroundColor Red
        return 0
    }
}

# Main execution
Write-Host "🚀 Starting Elite FPS Asset Collection..." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green

$totalAssets = 0
foreach ($repo in $eliteRepos) {
    $downloaded = Get-EliteAssets -Owner $repo.Owner -Repo $repo.Repo -Category $repo.Category -Priority $repo.Priority -MaxAssets 3
    $totalAssets += $downloaded
    
    # Rate limiting
    Start-Sleep -Seconds 1
}

# Create manifest
$manifest = @{
    name          = "Elite FPS Asset Collection"
    version       = "2.0.0"
    pullDate      = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    totalAssets   = $totalAssets
    categories    = @{
        characters   = "High-quality 3D character models and animations"
        maps         = "Elite competitive map layouts and geometry"
        weapons      = "Professional weapon models and effects"
        environments = "Immersive environment assets and textures"
        systems      = "Advanced FPS systems and frameworks"
    }
    compatibility = @{
        engine      = "Babylon.js + WebGPU"
        physics     = "Rapier.js"
        networking  = "Colyseus"
        performance = "240Hz optimized"
    }
}

$manifestJson = $manifest | ConvertTo-Json -Depth 10
$manifestPath = Join-Path $baseDir "elite-manifest.json"
$manifestJson | Out-File -FilePath $manifestPath -Encoding UTF8

Write-Host "`n🎉 ELITE FPS ASSET COLLECTION COMPLETE!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host "📊 Total Assets Downloaded: $totalAssets" -ForegroundColor Cyan
Write-Host "📁 Assets Location: $baseDir" -ForegroundColor Cyan
Write-Host "📋 Manifest: $manifestPath" -ForegroundColor Cyan
Write-Host "`n🔥 Ready for competitive FPS development!" -ForegroundColor Green
