param(
    [string]$BaseUrl = "https://blog.thebiker.com.br",
    [string]$SitemapUrl = "https://blog.thebiker.com.br/sitemap.xml",
    [string]$OutputDir = "C:\Users\marcu\Downloads\Blog - APRENDA!\medblog-full\screenshots-v2",
    [int]$Width = 1440,
    [int]$Height = 900
)

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"

if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

Write-Host "[1/4] Buscando sitemap.xml..." -ForegroundColor Cyan
$sitemapContent = Invoke-WebRequest -Uri $SitemapUrl -UseBasicParsing -TimeoutSec 30
$xml = [xml]$sitemapContent.Content
$ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
$ns.AddNamespace("ns", "http://www.sitemaps.org/schemas/sitemap/0.9")

$nodes = $xml.SelectNodes("//ns:loc", $ns)
$totalFromSitemap = $nodes.Count
Write-Host ("  URLs encontradas: " + $totalFromSitemap) -ForegroundColor Cyan

Write-Host "[2/4] Preparando lista de URLs..." -ForegroundColor Cyan

$capturePages = @{}
$pages = @()

foreach ($node in $nodes) {
    $url = $node.InnerText.Trim()
    $relative = $url.Substring($BaseUrl.Length).Trim('/')
    if ([string]::IsNullOrEmpty($relative)) { $relative = "home" }
    $name = $relative -replace '[/:]', '-'
    $name = $name.Substring(0, [math]::Min($name.Length, 100))
    if (!$capturePages.ContainsKey($url)) {
        $capturePages[$url] = $true
        $pages += @{ Name = $name; Url = $url }
    }
}

# Extra pages
$extra = @(
    @{ Url = "$BaseUrl/"; Name = "home" },
    @{ Url = "$BaseUrl/bikes/"; Name = "bikes-listing" },
    @{ Url = "$BaseUrl/comparar/"; Name = "comparar" },
    @{ Url = "$BaseUrl/calculadoras/tamanho-road-bike/"; Name = "calculadora-tamanho" },
    @{ Url = "$BaseUrl/calculadoras/relacao-marchas/"; Name = "calculadora-marchas" },
    @{ Url = "$BaseUrl/newsletter/"; Name = "newsletter" },
    @{ Url = "$BaseUrl/search/"; Name = "search" },
    @{ Url = "$BaseUrl/sobre/"; Name = "sobre" },
    @{ Url = "$BaseUrl/categorias/"; Name = "categorias" }
)

foreach ($e in $extra) {
    if (!$capturePages.ContainsKey($e.Url)) {
        $capturePages[$e.Url] = $true
        $pages += @{ Name = $e.Name; Url = $e.Url }
    }
}

$total = $pages.Count
$current = 0
$okCount = 0
$failCount = 0

Write-Host ("[3/4] Capturando " + $total + " paginas...") -ForegroundColor Cyan

foreach ($page in $pages) {
    $current++
    $pct = [math]::Round(($current / $total) * 100)
    $outputFile = Join-Path $OutputDir ($page.Name + ".png")

    if (Test-Path -LiteralPath $outputFile) {
        Write-Host ("  [" + $current + "/" + $total + "] " + $pct + "% SKIP " + $page.Name) -ForegroundColor DarkGray
        continue
    }

    Write-Host ("[" + $current + "/" + $total + "] " + $pct + "% " + $page.Url) -ForegroundColor Cyan

    try {
        & $chromePath --headless --disable-gpu --no-sandbox --window-size=$Width,$Height --screenshot=$outputFile --virtual-time-budget=15000 $page.Url 2>&1 | Out-Null
        Start-Sleep -Milliseconds 500

        if (Test-Path -LiteralPath $outputFile) {
            $size = (Get-Item -LiteralPath $outputFile).Length
            $sizeKb = [math]::Round($size / 1KB)
            Write-Host ("  OK " + $sizeKb + "KB") -ForegroundColor Green
            $okCount++
        } else {
            Write-Host "  FALHOU (arquivo nao criado)" -ForegroundColor Red
            $failCount++
        }
    } catch {
        Write-Host ("  ERRO: " + $_.Exception.Message) -ForegroundColor Red
        $failCount++
    }
}

Write-Host ""
Write-Host ("=== RELATORIO ===") -ForegroundColor Yellow
Write-Host ("Total URLs sitemap: " + $totalFromSitemap) -ForegroundColor White
Write-Host ("Total capturadas: " + $total) -ForegroundColor White
Write-Host ("OK: " + $okCount) -ForegroundColor Green
Write-Host ("Falhas: " + $failCount) -ForegroundColor $(if($failCount -eq 0){"Green"}else{"Red"})
Write-Host ("Diretorio: " + $OutputDir) -ForegroundColor White

$smallPages = @()
foreach ($page in $pages) {
    $outFile = Join-Path $OutputDir ($page.Name + ".png")
    if (Test-Path -LiteralPath $outFile) {
        $sz = (Get-Item -LiteralPath $outFile).Length
        if ($sz -eq 43290) {
            $smallPages += $page.Name
        }
    }
}

if ($smallPages.Count -gt 0) {
    Write-Host ""
    Write-Host ("AVISO: " + $smallPages.Count + " paginas com 42KB (possivel 404):") -ForegroundColor Yellow
    foreach ($sp in $smallPages) {
        Write-Host ("  " + $sp) -ForegroundColor Yellow
    }
}
