# Test PowerShell script functionality
Write-Host "=== PowerShell Test Script ===" -ForegroundColor Cyan

# Test GitHub API connection
$headers = @{
    'Authorization' = "token $env:GITHUB_TOKEN"
    'User-Agent'    = 'Elite-FPS-Asset-Puller'
    'Accept'        = 'application/vnd.github.v3+json'
}

Write-Host "Testing GitHub API connection..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/KhronosGroup/glTF-Sample-Models" -Headers $headers
    Write-Host "✓ GitHub API connection successful!" -ForegroundColor Green
    Write-Host "Repository: $($response.full_name)" -ForegroundColor White
    Write-Host "Stars: $($response.stargazers_count)" -ForegroundColor White
}
catch {
    Write-Host "✗ GitHub API connection failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test simple file download
Write-Host "`nTesting file download..." -ForegroundColor Yellow

$testUrl = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/AnimatedCube/glTF/AnimatedCube.gltf"
$testPath = "C:\Users\erryb\Desktop\SLIME\client\public\assets\elite-fps\test-download.gltf"

try {
    Invoke-WebRequest -Uri $testUrl -OutFile $testPath -Headers $headers
    if (Test-Path $testPath) {
        $fileSize = (Get-Item $testPath).Length
        Write-Host "✓ File downloaded successfully! Size: $fileSize bytes" -ForegroundColor Green
        Remove-Item $testPath -Force
    }
    else {
        Write-Host "✗ File was not created" -ForegroundColor Red
    }
}
catch {
    Write-Host "✗ Download failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
