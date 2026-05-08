param(
    [string]$SaltoBase = "https://127.0.0.1:5001",
    [string]$FutbolBase = "https://127.0.0.1:5002"
)

$ErrorActionPreference = "Stop"

# Permite pruebas locales con certificados autofirmados de Flask dev server.
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

$script:results = @()

function Add-Result {
    param(
        [string]$Name,
        [bool]$Ok,
        [string]$Detail
    )

    $script:results += [PSCustomObject]@{
        test = $Name
        ok = $Ok
        detail = $Detail
    }

    if ($Ok) {
        Write-Host "[PASS] $Name - $Detail" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $Name - $Detail" -ForegroundColor Red
    }
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Url,
        [object]$Body = $null
    )

    $tmpFile = $null
    $curlArgs = @("-k", "-s", "-X", $Method, "-w", "`n###STATUS###%{http_code}")
    if ($null -ne $Body) {
        $jsonBody = $Body | ConvertTo-Json -Depth 8 -Compress
        $tmpFile = [System.IO.Path]::GetTempFileName()
        [System.IO.File]::WriteAllText($tmpFile, $jsonBody, [System.Text.Encoding]::UTF8)
        $curlArgs += @("-H", "Content-Type: application/json", "-d", "@$tmpFile")
    }
    $curlArgs += $Url

    $raw = & curl.exe @curlArgs 2>&1
    if ($tmpFile -and (Test-Path $tmpFile)) { Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue }
    $parts = ($raw -join "`n") -split "`n###STATUS###"
    $status = $parts[-1].Trim()
    $body = ($parts[0..($parts.Count-2)] -join "`n").Trim()

    if ($status -notmatch '^\d+$' -or [int]$status -ge 400) {
        $msg = if ($body) { $body | ConvertFrom-Json -ErrorAction SilentlyContinue | Select-Object -ExpandProperty error -ErrorAction SilentlyContinue } else { "HTTP $status" }
        if (-not $msg) { $msg = "HTTP ${status}: ${body}" }
        throw $msg
    }

    if ($body) {
        try { return $body | ConvertFrom-Json } catch { return $body }
    }
    return $null
}

function Test-HealthLike {
    param(
        [string]$Name,
        [string]$Base,
        [string]$UsersPath
    )

    try {
        $url = "{0}{1}?paginado=1&limit=1&offset=0" -f $Base, $UsersPath
        $resp = Invoke-Api -Method "GET" -Url $url
        Add-Result -Name $Name -Ok $true -Detail "Servicio responde y lista usuarios"
        return $resp
    } catch {
        Add-Result -Name $Name -Ok $false -Detail $_.Exception.Message
        return $null
    }
}

Write-Host "\n=== Smoke test paridad Futbol vs Salto ===" -ForegroundColor Cyan
Write-Host "Salto:  $SaltoBase" -ForegroundColor DarkCyan
Write-Host "Futbol: $FutbolBase\n" -ForegroundColor DarkCyan

# 1) Salud basica
$null = Test-HealthLike -Name "Salto listado usuarios" -Base $SaltoBase -UsersPath "/api/usuarios"

$futbolUsersPath = "/api/usuarios"
$futbolHealth = Test-HealthLike -Name "Futbol listado usuarios (canonico)" -Base $FutbolBase -UsersPath $futbolUsersPath
if ($null -eq $futbolHealth) {
    $futbolUsersPath = "/api/usuarios_futbol"
    $futbolHealth = Test-HealthLike -Name "Futbol listado usuarios (legacy)" -Base $FutbolBase -UsersPath $futbolUsersPath
}

if ($results.Where({ -not $_.ok }).Count -gt 0 -and $results.Count -le 2) {
    Write-Host "\nNo se puede continuar: al menos un backend no responde." -ForegroundColor Yellow
    exit 1
}

# 2) CRUD cruzado de usuario
$stamp = Get-Date -Format "yyyyMMddHHmmss"
$alias = "smoke_$stamp"
$nombre = "Smoke Test $stamp"
$altura = 1.78
$peso = 72
$idUser = $null

try {
    $created = Invoke-Api -Method "POST" -Url ("{0}/api/usuarios" -f $SaltoBase) -Body @{
        alias = $alias
        nombre_completo = $nombre
        altura_m = $altura
        peso_kg = $peso
    }

    $idUser = [int]$created.id_usuario
    if ($idUser -gt 0) {
        Add-Result -Name "Crear usuario en salto" -Ok $true -Detail "id_usuario=$idUser"
    } else {
        Add-Result -Name "Crear usuario en salto" -Ok $false -Detail "id_usuario invalido"
    }
} catch {
    Add-Result -Name "Crear usuario en salto" -Ok $false -Detail $_.Exception.Message
}

if ($idUser) {
    try {
        $urlListado = "{0}{1}?paginado=1&search={2}&limit=20&offset=0" -f $FutbolBase, $futbolUsersPath, $alias
        $listed = Invoke-Api -Method "GET" -Url $urlListado
        $items = @()

        if ($listed.PSObject.Properties.Name -contains "items") {
            $items = @($listed.items)
        } elseif ($listed.PSObject.Properties.Name -contains "usuarios") {
            $items = @($listed.usuarios)
        }

        $found = $items | Where-Object { [int]$_.id_usuario -eq $idUser }
        Add-Result -Name "Usuario visible en futbol" -Ok ($null -ne $found) -Detail "search=$alias"
    } catch {
        Add-Result -Name "Usuario visible en futbol" -Ok $false -Detail $_.Exception.Message
    }

    try {
        $nuevoNombre = "$nombre EDIT"
        $urlUpdate = "{0}{1}/{2}" -f $FutbolBase, $futbolUsersPath, $idUser
        $null = Invoke-Api -Method "PUT" -Url $urlUpdate -Body @{
            alias = $alias
            nombre_completo = $nuevoNombre
            altura_m = $altura
            peso_kg = $peso
        }
        Add-Result -Name "Editar usuario en futbol" -Ok $true -Detail "id_usuario=$idUser"

        $check = Invoke-Api -Method "GET" -Url ("{0}/api/usuarios/{1}" -f $SaltoBase, $idUser)
        $okName = ($check.nombre_completo -eq $nuevoNombre)
        Add-Result -Name "Cambio visible en salto" -Ok $okName -Detail "nombre_completo actualizado"
    } catch {
        Add-Result -Name "Editar/validar usuario cruzado" -Ok $false -Detail $_.Exception.Message
    }

    # 3) Endpoints de analitica de futbol (smoke de disponibilidad)
    $analytics = @(
        "/api/usuarios/$idUser/fatiga",
        "/api/usuarios/$idUser/tendencia",
        "/api/usuarios/$idUser/comparativa",
        "/api/usuarios/$idUser/alertas_tendencia",
        "/api/usuarios/$idUser/analitica_avanzada"
    )

    foreach ($ep in $analytics) {
        try {
            $null = Invoke-Api -Method "GET" -Url ("{0}{1}" -f $FutbolBase, $ep)
            Add-Result -Name "Analitica disponible $ep" -Ok $true -Detail "200/empty-ok"
        } catch {
            Add-Result -Name "Analitica disponible $ep" -Ok $false -Detail $_.Exception.Message
        }
    }

    try {
        $null = Invoke-Api -Method "DELETE" -Url ("{0}/api/usuarios/{1}" -f $SaltoBase, $idUser)
        Add-Result -Name "Eliminar usuario en salto" -Ok $true -Detail "id_usuario=$idUser"

        $existsInFut = $false
        try {
            $x = Invoke-Api -Method "GET" -Url ("{0}{1}/{2}" -f $FutbolBase, $futbolUsersPath, $idUser)
            if ($null -ne $x) {
                $existsInFut = $true
            }
        } catch {
            $existsInFut = $false
        }

        Add-Result -Name "Usuario eliminado en futbol" -Ok (-not $existsInFut) -Detail "sin residuo cruzado"
    } catch {
        Add-Result -Name "Eliminar usuario en salto" -Ok $false -Detail $_.Exception.Message
    }
}

# 4) Caso negativo basico
try {
    $null = Invoke-Api -Method "GET" -Url ("{0}/api/usuarios/999999999/analitica_avanzada" -f $FutbolBase)
    Add-Result -Name "Negativo id invalido" -Ok $false -Detail "Deberia fallar 404/400"
} catch {
    $msg = $_.Exception.Message
    $ok = ($msg -match "400|404|Not Found|Bad Request")
    Add-Result -Name "Negativo id invalido" -Ok $ok -Detail $msg
}

# Resumen
$total = $script:results.Count
$failed = ($script:results | Where-Object { -not $_.ok }).Count
$passed = $total - $failed

Write-Host "\n=== Resumen ===" -ForegroundColor Cyan
Write-Host "Total: $total | PASS: $passed | FAIL: $failed"

if ($failed -gt 0) {
    Write-Host "\nTests con fallo:" -ForegroundColor Yellow
    $script:results | Where-Object { -not $_.ok } | ForEach-Object {
        Write-Host "- $($_.test): $($_.detail)" -ForegroundColor Yellow
    }
    exit 1
}

Write-Host "\nSmoke test completado OK." -ForegroundColor Green
exit 0
