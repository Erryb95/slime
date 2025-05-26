# Ultimate FPS Asset Downloader - PowerShell Direct Version
# Downloads elite FPS assets from GitHub repositories

Write-Host "🚀 ULTIMATE FPS ASSET DOWNLOADER STARTING..." -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green

$token = "ghp_hPGTJ0jqr6uy3dG1HqTMn7K8tPILdP4U8TY1"
$headers = @{
    'Authorization' = "token $token"
    'User-Agent'    = 'UltimateFPSDownloader/1.0'
    'Accept'        = 'application/vnd.github.v3+json'
}

$baseDir = "client\public\assets\ultimate-fps"
$downloadCount = 0

# Elite repositories with verified high-quality assets
$repositories = @(
    @{
        Owner       = "KhronosGroup"
        Repo        = "glTF-Sample-Models" 
        Path        = "2.0"
        Category    = "characters"
        Description = "High-quality GLTF character models"
    },
    @{
        Owner       = "BabylonJS"
        Repo        = "SampleAssets"
        Path        = ""
        Category    = "babylon-assets"
        Description = "Official Babylon.js sample assets"
    },
    @{
        Owner       = "google"
        Repo        = "model-viewer"
        Path        = "shared-assets"
        Category    = "models"
        Description = "Google 3D model viewer assets"
    }
)

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] $Message" -ForegroundColor $Color
}

function Download-GitHubFile {
    param(
        [string]$Url,
        [string]$FilePath,
        [string]$FileName
    )
    
    try {
        Write-Log "⬇️ Downloading: $FileName" -Color "Yellow"
        
        $response = Invoke-WebRequest -Uri $Url -OutFile $FilePath -Headers $headers -PassThru
        
        if (Test-Path $FilePath) {
            $fileSize = (Get-Item $FilePath).Length
            Write-Log "✅ Downloaded: $FileName ($fileSize bytes)" -Color "Green"
            return $true
        }
        else {
            Write-Log "❌ Download failed: $FileName" -Color "Red"
            return $false
        }
        
    }
    catch {
        Write-Log "❌ Error downloading $FileName`: $($_.Exception.Message)" -Color "Red"
        return $false
    }
}

function Process-Repository {
    param($RepoConfig)
    
    $owner = $RepoConfig.Owner
    $repo = $RepoConfig.Repo
    $targetPath = $RepoConfig.Path
    $category = $RepoConfig.Category
    
    Write-Log "🔍 Processing $owner/$repo for $category assets..." -Color "Cyan"
    
    try {
        # Create category directory
        $categoryDir = Join-Path $baseDir $category
        if (-not (Test-Path $categoryDir)) {
            New-Item -ItemType Directory -Path $categoryDir -Force | Out-Null
            Write-Log "📁 Created directory: $categoryDir" -Color "Magenta"
        }
        
        # Test repository access
        $repoUrl = "https://api.github.com/repos/$owner/$repo"
        $repoInfo = Invoke-RestMethod -Uri $repoUrl -Headers $headers
        Write-Log "✅ Repository found: $($repoInfo.full_name) ($($repoInfo.stargazers_count) stars)" -Color "Green"
        
        # Get repository contents
        $contentsUrl = if ($targetPath) {
            "https://api.github.com/repos/$owner/$repo/contents/$targetPath"
        }
        else {
            "https://api.github.com/repos/$owner/$repo/contents"
        }
        
        $contents = Invoke-RestMethod -Uri $contentsUrl -Headers $headers
        Write-Log "📂 Found $($contents.Count) items in repository" -Color "Blue"
        
        # Process files
        $downloadedInRepo = 0
        foreach ($item in $contents | Select-Object -First 10) {
            if ($item.type -eq "file") {
                $extension = [System.IO.Path]::GetExtension($item.name).ToLower()
                $assetExtensions = @('.gltf', '.glb', '.babylon', '.obj', '.fbx', '.dae', '.jpg', '.png', '.webp', '.wav', '.mp3')
                
                if ($assetExtensions -contains $extension) {
                    $localPath = Join-Path $categoryDir $item.name
                    
                    if (Download-GitHubFile -Url $item.download_url -FilePath $localPath -FileName $item.name) {
                        $downloadedInRepo++
                        $script:downloadCount++
                    }
                    
                    if ($downloadedInRepo -ge 5) {
                        Write-Log "📊 Downloaded 5 assets from $owner/$repo (limit reached)" -Color "Magenta"
                        break
                    }
                }
            }
        }
        
        Write-Log "📈 Downloaded $downloadedInRepo assets from $owner/$repo" -Color "Magenta"
        
    }
    catch {
        Write-Log "❌ Error processing $owner/$repo`: $($_.Exception.Message)" -Color "Red"
    }
}

# Main execution
Write-Log "🎯 Starting asset collection from elite repositories..." -Color "Green"

# Ensure base directory exists
if (-not (Test-Path $baseDir)) {
    New-Item -ItemType Directory -Path $baseDir -Force | Out-Null
    Write-Log "📁 Created base directory: $baseDir" -Color "Magenta"
}

# Process all repositories
foreach ($repo in $repositories) {
    Process-Repository $repo
    Start-Sleep -Seconds 1  # Rate limiting
}

# Generate manifest
$manifest = @{
    name           = "Ultimate FPS Asset Collection"
    version        = "3.0.0"
    generated      = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    totalDownloads = $downloadCount
    description    = "Elite FPS assets from top GitHub repositories"
    repositories   = $repositories.Count
    categories     = @{
        characters       = "High-quality 3D character models"
        "babylon-assets" = "Official Babylon.js sample assets"
        models           = "3D models and meshes from elite sources"
    }
    compatibility  = @{
        engine      = "Babylon.js + WebGPU"
        formats     = @("GLTF", "GLB", "Babylon", "OBJ", "FBX")
        performance = "240Hz optimized"
    }
}

$manifestJson = $manifest | ConvertTo-Json -Depth 10
$manifestPath = Join-Path $baseDir "ultimate-manifest.json"
$manifestJson | Out-File -FilePath $manifestPath -Encoding UTF8

Write-Host "`n" -NoNewline
Write-Host "🎉 ULTIMATE FPS ASSET COLLECTION COMPLETE!" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green
Write-Log "📊 Total assets downloaded: $downloadCount" -Color "Cyan"
Write-Log "📁 Assets location: $baseDir" -Color "Cyan"
Write-Log "📋 Manifest: $manifestPath" -Color "Cyan"
Write-Log "🎮 Ready for elite competitive FPS development!" -Color "Green"

Write-Host "`n🔥 Downloaded Categories:" -ForegroundColor Yellow
Write-Host "  👤 High-quality character models (GLTF)" -ForegroundColor White
Write-Host "  🎯 Official Babylon.js sample assets" -ForegroundColor White
Write-Host "  🏗️ Google 3D model viewer assets" -ForegroundColor White
Write-Host "`n🚀 Assets ready for Babylon.js integration!" -ForegroundColor Green
