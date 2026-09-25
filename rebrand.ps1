# rebrand.ps1 — YouTube Personal de Daniel (ejecutar dentro de la carpeta del proyecto)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path 'logo.png')) {
  Write-Host 'ERROR: copia tu imagen como logo.png en esta carpeta y vuelve a ejecutar.' -ForegroundColor Red
  exit 1
}

# --- index.html: logo, nombre y title ---
$h = Get-Content 'index.html' -Raw -Encoding UTF8
$h = [regex]::Replace($h, '(?s)<span class="brand-logo".*?</span>',
      '<img class="brand-logo-img" src="logo.png" alt="Logo de Daniel" width="34" height="34">')
$h = [regex]::Replace($h, '(?s)<h1 class="brand">.*?</h1>',
      '<h1 class="brand">YouTube <span>Personal</span> de Daniel</h1>')
$h = [regex]::Replace($h, '(?s)<title>.*?</title>', '<title>YouTube Personal de Daniel</title>')
$h = $h.Replace('rel="icon" href="icon.svg" type="image/svg+xml"', 'rel="icon" href="logo.png" type="image/png"')
$h = $h.Replace('rel="apple-touch-icon" href="icon.svg"', 'rel="apple-touch-icon" href="logo.png"')
Set-Content 'index.html' -Value $h -Encoding UTF8 -NoNewline

# --- manifest.webmanifest: nombre + tu logo como icono principal ---
@'
{
  "name": "YouTube Personal de Daniel",
  "short_name": "YT Daniel",
  "description": "El YouTube personal de Daniel: glassmorphism, verde neon y YouTube Data API v3.",
  "lang": "es",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#050806",
  "theme_color": "#050806",
  "categories": ["music", "entertainment"],
  "icons": [
    { "src": "logo.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" },
    { "src": "icon.svg", "sizes": "512x512", "type": "image/svg+xml", "purpose": "any" }
  ]
}
'@ | Set-Content 'manifest.webmanifest' -Encoding UTF8

# --- styles.css: clase del logo de la barra (una sola vez) ---
$css = Get-Content 'styles.css' -Raw -Encoding UTF8
if ($css -notmatch 'brand-logo-img') {
  Add-Content 'styles.css' -Value "`n.brand-logo-img{width:34px;height:34px;border-radius:10px;object-fit:cover;border:1px solid var(--stroke);box-shadow:var(--neon-glow)}" -Encoding UTF8
}

# --- sw.js: sube el cache para que el icono nuevo se vea ya ---
$s = Get-Content 'sw.js' -Raw -Encoding UTF8
$s = [regex]::Replace($s, 'neontube-shell-v\d+', 'neontube-shell-v5')
Set-Content 'sw.js' -Value $s -Encoding UTF8 -NoNewline

Write-Host 'LISTO: rebranding aplicado. Siguiente paso: git add -A && git commit -m "rebrand" && git push' -ForegroundColor Green