# Elite FPS Asset Puller - PowerShell Version
# Downloads elite FPS assets from GitHub repositories

Write-Host "🚀 Elite FPS Asset Puller - PowerShell Edition" -ForegroundColor Green

# Check if GitHub token is set
if (-not $env:GITHUB_TOKEN) {
    Write-Host "❌ GITHUB_TOKEN environment variable not set!" -ForegroundColor Red
    Write-Host "💡 Set it with: `$env:GITHUB_TOKEN = 'your_token_here'" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ GitHub token found" -ForegroundColor Green

# Base directory for elite assets
$eliteDir = "client\public\assets\elite-fps"

# Create headers for GitHub API
$headers = @{
    "Authorization" = "token $env:GITHUB_TOKEN"
    "User-Agent"    = "SLIME-FPS-Asset-Puller"
    "Accept"        = "application/vnd.github.v3+json"
}

# Elite repositories to pull from
$eliteRepos = @(
    @{
        owner    = "BabylonJS"
        repo     = "SampleAssets" 
        category = "characters"
        paths    = @("models")
    },
    @{
        owner    = "KhronosGroup"
        repo     = "glTF-Sample-Models"
        category = "characters" 
        paths    = @("2.0")
    }
)

function Download-Asset {
    param(
        [string]$url,
        [string]$localPath
    )
    
    try {
        Write-Host "⬇️ Downloading: $(Split-Path $localPath -Leaf)" -ForegroundColor Cyan
        Invoke-WebRequest -Uri $url -OutFile $localPath -Headers $headers
        Write-Host "✅ Downloaded: $localPath" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "❌ Failed to download $localPath : $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Explore-Repository {
    param(
        [string]$owner,
        [string]$repo,
        [string]$category
    )
    
    try {
        Write-Host "🔍 Exploring $owner/$repo for $category..." -ForegroundColor Yellow
        
        # Get repository contents
        $apiUrl = "https://api.github.com/repos/$owner/$repo/contents"
        $response = Invoke-RestMethod -Uri $apiUrl -Headers $headers
        
        Write-Host "📊 Found $($response.Count) items in $owner/$repo" -ForegroundColor Blue
        
        # Asset file extensions to look for
        $assetExtensions = @('.gltf', '.glb', '.babylon', '.fbx', '.obj', '.dae')
        $downloadCount = 0
        
        foreach ($item in $response) {
            if ($item.type -eq "file") {
                $extension = [System.IO.Path]::GetExtension($item.name).ToLower()
                if ($assetExtensions -contains $extension) {
                    $localPath = Join-Path "$eliteDir\$category" $item.name
                    $success = Download-Asset -url $item.download_url -localPath $localPath
                    if ($success) { $downloadCount++ }
                    
                    # Limit downloads for testing
                    if ($downloadCount -ge 3) { break }
                }
            }
        }
        
        Write-Host "✅ Downloaded $downloadCount assets from $owner/$repo" -ForegroundColor Green
        
    }
    catch {
        Write-Host "❌ Error exploring $owner/$repo : $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Main execution
Write-Host "📁 Elite FPS directory structure already created" -ForegroundColor Blue

foreach ($repo in $eliteRepos) {
    Explore-Repository -owner $repo.owner -repo $repo.repo -category $repo.category
}

# Create manifest
$manifest = @{
    pullDate     = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    repositories = $eliteRepos | ForEach-Object { "$($_.owner)/$($_.repo)" }
    categories   = @("characters", "maps", "physics", "animations", "systems")
    puller       = "PowerShell"
} | ConvertTo-Json -Depth 3

$manifestPath = Join-Path $eliteDir "manifest.json"
$manifest | Out-File -FilePath $manifestPath -Encoding UTF8

Write-Host "🎉 Elite FPS asset pull completed!" -ForegroundColor Green
Write-Host "📁 Assets saved to: $eliteDir" -ForegroundColor Cyan
Write-Host "📄 Manifest created: $manifestPath" -ForegroundColor Cyan
