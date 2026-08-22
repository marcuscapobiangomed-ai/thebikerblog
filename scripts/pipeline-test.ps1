# Verificacao completa e somente leitura do pipeline editorial.
# Este entrypoint legado nao fabrica mais exemplos dentro de _posts nem cria
# fichas incompletas. A homologacao usa exatamente os gates executados no CI.

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

Write-Host "Executando os gates editoriais e de publicacao..." -ForegroundColor Cyan
Push-Location $ROOT
try {
    npm run validate:ci
    if ($LASTEXITCODE -ne 0) {
        throw "validate:ci falhou com codigo $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

Write-Host "Pipeline homologado sem criar ou publicar conteudo de teste." -ForegroundColor Green
