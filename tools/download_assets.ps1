# Downloads all external assets for SpaceSim (Three.js r128 + planet textures).
# Run: powershell -ExecutionPolicy Bypass -File tools/download_assets.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$tex = Join-Path $root "textures"
$lib = Join-Path $root "lib"
New-Item -ItemType Directory -Force -Path $tex | Out-Null
New-Item -ItemType Directory -Force -Path $lib | Out-Null

function Download($url, $dest) {
    $exists = (Test-Path $dest) -and ((Get-Item $dest).Length -gt 1000)
    if ($exists) { Write-Host "SKIP (exists)  $dest"; return }
    Write-Host "GET  $url"
    curl.exe -sL --retry 3 -o $dest $url
    if (-not (Test-Path $dest) -or (Get-Item $dest).Length -lt 1000) {
        throw "Download failed or too small: $dest"
    }
    Write-Host ("  -> {0:N0} bytes" -f (Get-Item $dest).Length)
}

$base = "https://www.solarsystemscope.com/textures/download"

Download "https://unpkg.com/three@0.128.0/build/three.min.js" (Join-Path $lib "three.min.js")
Download "https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js" (Join-Path $lib "OrbitControls.js")

Download "$base/2k_sun.jpg"               (Join-Path $tex "sun.jpg")
Download "$base/2k_mercury.jpg"           (Join-Path $tex "mercury.jpg")
Download "$base/2k_venus_surface.jpg"     (Join-Path $tex "venus.jpg")
Download "$base/2k_earth_daymap.jpg"      (Join-Path $tex "earth.jpg")
Download "$base/2k_earth_nightmap.jpg"    (Join-Path $tex "earth_night.jpg")
Download "$base/2k_earth_clouds.jpg"      (Join-Path $tex "earth_clouds.jpg")
Download "$base/2k_moon.jpg"              (Join-Path $tex "moon.jpg")
Download "$base/2k_mars.jpg"              (Join-Path $tex "mars.jpg")
Download "$base/2k_jupiter.jpg"           (Join-Path $tex "jupiter.jpg")
Download "$base/2k_saturn.jpg"            (Join-Path $tex "saturn.jpg")
Download "$base/2k_saturn_ring_alpha.png" (Join-Path $tex "saturn_ring.png")
Download "$base/2k_uranus.jpg"            (Join-Path $tex "uranus.jpg")
Download "$base/2k_neptune.jpg"           (Join-Path $tex "neptune.jpg")
Download "$base/2k_stars_milky_way.jpg"   (Join-Path $tex "stars_milky_way.jpg")

Write-Host "All assets ready."
