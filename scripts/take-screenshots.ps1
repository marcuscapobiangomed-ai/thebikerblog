$baseUrl = "https://blog.thebiker.com.br"
$screenshotDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "screenshots"
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"

if (!(Test-Path $screenshotDir)) {
    New-Item -ItemType Directory -Force -Path $screenshotDir | Out-Null
}

$pages = @(
    @{ Name = "01-home"; Url = "$baseUrl/" },
    @{ Name = "02-bikes"; Url = "$baseUrl/bikes.html" },
    @{ Name = "03-comparar"; Url = "$baseUrl/comparar.html" },
    @{ Name = "04-calculadora-tamanho"; Url = "$baseUrl/calculadora-tamanho.html" },
    @{ Name = "05-calculadora-marchas"; Url = "$baseUrl/calculadora-marchas.html" },
    @{ Name = "06-newsletter"; Url = "$baseUrl/newsletter.html" },
    @{ Name = "07-search"; Url = "$baseUrl/search.html" },
    @{ Name = "08-sobre"; Url = "$baseUrl/sobre/" },
    @{ Name = "09-categorias"; Url = "$baseUrl/categorias/" },
    @{ Name = "10-404"; Url = "$baseUrl/404.html" }
)

$bikes = @(
    "trek/madone-sl6-2026",
    "trek/emonda-sl5-2026",
    "trek/domane-sl5-2026",
    "cervelo/soloist-105-2026",
    "cervelo/s5-2026",
    "cervelo/caledonia-105-2026",
    "specialized/tarmac-sl8-2026",
    "specialized/tarmac-sl7-2026",
    "specialized/roubaix-sl8-2026",
    "specialized/allez-2026",
    "cannondale/supersix-evo-ultegra-2026",
    "cannondale/supersix-evo-105-2026",
    "cannondale/caad13-105-2026",
    "cannondale/caad-optimo-2026",
    "scott/foil-40-2026",
    "scott/foil-30-2026",
    "scott/addict-30-2026",
    "scott/addict-20-2026",
    "scott/addict-10-2026",
    "caloi/strada-sport-2026",
    "caloi/strada-race-2026",
    "caloi/strada-100-2026",
    "oggi/veloce-2026",
    "oggi/sport-2026",
    "oggi/giro-carbon-2026",
    "oggi/giro-2026",
    "oggi/bike-7-2026",
    "sense/gravel-v1-2026",
    "sense/carbon-v2-pro-2026",
    "sense/carbon-v2-2026"
)

foreach ($bike in $bikes) {
    $bikeName = $bike -replace "/", "-"
    $pages += @{ Name = "bike-$bikeName"; Url = "$baseUrl/bikes/$bike/" }
}

$posts = @(
    "2026/07/16/bem-vindo",
    "2026/07/19/melhores-bikes-de-estrada-ate-5-mil",
    "2026/07/19/melhores-bikes-de-estrada-ate-10-mil",
    "2026/07/19/guia-completo-melhor-bike-de-estrada-para-iniciantes",
    "2026/07/19/grupos-mais-comuns-bikes-estrada-brasil-2026",
    "2026/07/19/evolucao-geometria-endurance-vs-race-2026",
    "2026/07/19/custo-por-quilo-bike-estrada-2026",
    "2026/07/19/comparativo-endurance-vs-race-dados-2026",
    "2026/07/19/cannondale-supersix-evo-2026-review",
    "2026/07/19/guia-importacao-bike-estrada-brasil-2026",
    "2026/07/19/melhores-capacetes-ciclismo-estrada-2026",
    "2026/07/19/melhores-pedais-clipless",
    "2026/07/19/melhores-rodas-de-carbono",
    "2026/07/19/peso-medio-bikes-carbono-vs-aluminio-brasil-2026",
    "2026/07/19/scott-addict-2026-guia-completo",
    "2026/07/19/scott-addict-vs-cervelo-caledonia-2026",
    "2026/07/19/scott-foil-rc-2026-review-completo",
    "2026/07/19/sensores-de-potencia",
    "2026/07/19/specialized-tarmac-sl8-2026-review-completo",
    "2026/07/19/trek-emonda-vs-specialized-tarmac-escalada",
    "2026/07/19/trek-madone-vs-emonda-2026-diferencas",
    "2026/07/21/29-melhores-estradas-e-rotas-para-ciclismo-de-estrada-no-brasil-guia-por-regiao",
    "2026/07/23/30-bicicletarias-especializadas-em-bike-de-estrada-como-encontrar-a-melhor-perto-de-voce",
    "2026/07/28/6-quadro-de-carbono-vs-aluminio-em-bikes-de-estrada-vale-a-pena-pagar-mais",
    "2026/07/29/7-shimano-105-vs-ultegra-a-diferenca-de-preco-justifica",
    "2026/07/31/8-como-escolher-o-tamanho-certo-de-bike-de-estrada-guia-completo-com-tabela-de-medidas",
    "2026/07/02/13-cervelo-a-preferida-dos-profissionais-do-worldtour",
    "2026/07/08/18-tendencias-em-bikes-de-estrada-2026-aero-esta-vencendo-as-leves",
    "2026/07/10/19-o-que-as-equipes-do-worldtour-estao-usando-em-2026-equipamentos-bikes-e-componentes",
    "2026/07/12/20-inovacoes-em-componentes-de-bike-2026-grupos-eletronicos-rodas-de-carbono-e-sensores-de-potencia",
    "2026/07/13/21-melhores-rodas-de-carbono-custo-beneficio-para-bike-de-estrada-em-2026-guia-completo",
    "2026/07/14/22-melhores-pedais-clipless-para-iniciantes-em-ciclismo-de-estrada-qual-escolher-em-2026",
    "2026/07/16/24-sensores-de-potencia-para-bike-vale-a-pena-para-ciclista-amador-guia-completo-2026",
    "2026/07/17/25-melhores-apps-de-treino-para-ciclismo-2026-comparativo-entre-zwift-trainerroad-trainingpeaks-e-mywhoosh",
    "2026/07/18/26-guia-de-manutencao-basica-para-bike-de-estrada-o-que-todo-ciclista-precisa-saber",
    "2026/07/19/27-onde-comprar-bike-de-estrada-importada-no-brasil-em-2026-lojas-sites-e-cuidados",
    "2026/07/04/14-specialized-tarmac-sl8-vale-o-investimento-review-completo",
    "2026/07/05/15-trek-madone-vs-trek-emonda-diferencas-entre-as-linhas-aero-e-leve-da-trek",
    "2026/07/06/16-cannondale-supersix-evo-vs-systemsix-qual-escolher-em-2026",
    "2026/07/07/17-lancamentos-de-bikes-de-estrada-2026-o-que-esperar-das-principais-marcas",
    "2026/07/11/2-comparativo-5-melhores-bikes-de-estrada-ate-r-5-000-em-2026",
    "2026/07/15/23-melhores-capacetes-de-ciclismo-de-estrada-2026-de-r-200-a-r-2-000",
    "2026/07/20/28-quanto-custa-importar-uma-bike-de-estrada-em-2026-impostos-frete-e-burocracia",
    "2026/07/22/3-comparativo-5-melhores-bikes-de-estrada-ate-r-10-000-em-2026",
    "2026/07/25/4-scott-addict-vs-cervelo-caledonia-comparativo-completo-para-ciclistas-em-2026",
    "2026/07/26/5-trek-emonda-vs-specialized-tarmac-qual-a-melhor-bike-de-escalada",
    "2026/08/02/9-bicicleta-de-estrada-nova-vs-usada-pros-e-contras-e-precos-no-brasil",
    "2026/08/03/quanto-custa-importar-uma-scott-addict-para-o-brasil-em-2026"
)

foreach ($post in $posts) {
    $postName = $post -replace "/", "-"
    $pages += @{ Name = "post-$postName"; Url = "$baseUrl/$post/" }
}

$total = $pages.Count
$current = 0
$failed = @()

foreach ($page in $pages) {
    $current++
    $pct = [math]::Round(($current / $total) * 100)
    Write-Host "[$current/$total] ($pct%) $($page.Name)..." -ForegroundColor Cyan

    $outputFile = Join-Path $screenshotDir "$($page.Name).png"
    
    try {
        $proc = Start-Process -FilePath $chromePath -ArgumentList @(
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--window-size=1440,900",
            "--screenshot=`"$outputFile`"",
            "--virtual-time-budget=10000",
            $page.Url
        ) -Wait -PassThru -NoNewWindow -ErrorAction Stop

        if (Test-Path $outputFile) {
            $size = (Get-Item $outputFile).Length
            Write-Host "  OK ($([math]::Round($size/1KB))KB)" -ForegroundColor Green
        } else {
            Write-Host "  FALHOU (arquivo nao criado)" -ForegroundColor Red
            $failed += $page.Name
        }
    } catch {
        Write-Host "  ERRO: $($_.Exception.Message)" -ForegroundColor Red
        $failed += $page.Name
    }
}

Write-Host ""
Write-Host "=== CONCLUIDO ===" -ForegroundColor Yellow
Write-Host "Total: $total paginas" -ForegroundColor White
Write-Host "Sucesso: $($total - $failed.Count)" -ForegroundColor Green
Write-Host "Falhas: $($failed.Count)" -ForegroundColor Red

if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "Paginas que falharam:" -ForegroundColor Red
    foreach ($f in $failed) {
        Write-Host "  - $f" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Screenshots salvos em: $screenshotDir" -ForegroundColor Yellow
