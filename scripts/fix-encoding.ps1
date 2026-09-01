$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$patterns = @("*.md", "*.html", "*.yml", "*.json")
$fixedCount = 0
$fileCount = 0

# Detecta double-encoding: bytes UTF-8 interpretados como Latin-1 e salvos como UTF-8
# Ex: "é" (C3 A9) -> lido como Latin-1 -> "Ã©" -> salvo como UTF-8 (C3 83 C2 A9)
$detect = @("Ã©", "Ã¡", "Ã£", "Ã¢", "Ã§", "Ãµ", "Ãº", "Ã´", "Ãª", "Ã¼", "Ã­", "Ã³", "Ã­")

function Is-Corrupt($text) {
    foreach ($p in $detect) { if ($text.Contains($p)) { return $true } }
    return $false
}

function Fix-Corrupt($text) {
    try {
        # Converte string UTF-8 para bytes Latin-1 (ISO-8859-1)
        $latin1 = [System.Text.Encoding]::GetEncoding("ISO-8859-1")
        $bytes = $latin1.GetBytes($text)
        # Decodifica os bytes como UTF-8
        return [System.Text.Encoding]::UTF8.GetString($bytes)
    } catch {
        return $text
    }
}

Get-ChildItem -Path $root -Recurse -Include $patterns | ForEach-Object {
    $file = $_.FullName
    $relative = $file.Substring($root.Length + 1)
    
    if ($relative -match "^\.git" -or $relative -match "^screenshots" -or $relative -match "^node_modules" -or $relative -match "^\.github") { return }
    
    try {
        $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
        
        if (Is-Corrupt $content) {
            $fileCount++
            $fixed = Fix-Corrupt $content
            
            if ($fixed -ne $content -and !$fixed.Contains([char]0xFFFD)) {
                [System.IO.File]::WriteAllText($file, $fixed, [System.Text.Encoding]::UTF8)
                $fixedCount++
                Write-Host ("OK: " + $relative) -ForegroundColor Green
            } else {
                Write-Host ("--: " + $relative + " (sem melhoria)") -ForegroundColor DarkGray
            }
        }
    } catch {
        Write-Host ("ERRO: " + $relative + " - " + $_.Exception.Message) -ForegroundColor Red
    }
}

Write-Host ""
Write-Host ("Arquivos com double-encoding: " + $fileCount) -ForegroundColor Yellow
Write-Host ("Arquivos corrigidos: " + $fixedCount) -ForegroundColor Green

# Verificação final
$rem = 0
Get-ChildItem -Path $root -Recurse -Include $patterns | ForEach-Object {
    $r = $_.FullName.Substring($root.Length + 1)
    if ($r -notmatch "^\.git" -and $r -notmatch "^screenshots" -and $r -notmatch "^node_modules" -and $r -notmatch "^\.github") {
        $c = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
        if (Is-Corrupt $c) { $rem++ }
    }
}
if ($rem -eq 0) {
    Write-Host "Double-encoding eliminado!" -ForegroundColor Green
} else {
    Write-Host ("RESTAM " + $rem + " arquivos corrompidos!") -ForegroundColor Red
}
