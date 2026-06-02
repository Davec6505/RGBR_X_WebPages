<#
.SYNOPSIS
    Regenerates the HTTPS TLS certificate embedded in the firmware.

.DESCRIPTION
    Run this when the device IP address changes or the cert is near expiry.
    The private key (device.key) is reused — only the cert changes.
    After running, rebuild and reflash the firmware:
        make build
    Then re-import device.crt into your browser/OS trust store.

.PARAMETER IP
    The device IP address to embed in the cert SAN. Default: 10.0.0.49

.EXAMPLE
    .\Regenerate-DeviceCert.ps1
    .\Regenerate-DeviceCert.ps1 -IP 192.168.1.50
#>
param(
    [string]$IP = "10.0.0.49"
)

$RepoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $RepoRoot

try {
    if (-not (Test-Path "device.key")) {
        Write-Error "device.key not found in repo root. Cannot regenerate without the private key."
        exit 1
    }

    Write-Host "Generating cert for CN=led-o SAN=DNS:led-o,DNS:led-o.local,IP:$IP ..."

    openssl req -new -x509 -key device.key -out device.crt -days 3650 `
        -subj "/CN=led-o/O=LED-O/C=AU" `
        -addext "subjectAltName=DNS:led-o,DNS:led-o.local,IP:$IP"

    if ($LASTEXITCODE -ne 0) { Write-Error "openssl failed"; exit 1 }

    openssl x509 -in device.crt -out device.der -outform DER
    Write-Host "Cert DER: $((Get-Item device.der).Length) bytes"

    # Convert DER to C arrays
    $certBytes = [System.IO.File]::ReadAllBytes("device.der")
    $keyBytes  = [System.IO.File]::ReadAllBytes("device_key.der")
    $certLen   = $certBytes.Length
    $keyLen    = $keyBytes.Length

    function To-CArray($bytes, $name) {
        $lines = @()
        for ($i = 0; $i -lt $bytes.Length; $i += 16) {
            $end   = [Math]::Min($i + 15, $bytes.Length - 1)
            $chunk = $bytes[$i..$end]
            $lines += "    " + (($chunk | ForEach-Object { "0x{0:X2}" -f $_ }) -join ", ") + ","
        }
        return "static const unsigned char $name[] = {`n" + ($lines -join "`n") + "`n};"
    }

    $header = @"
/* Device self-signed cert - CN=led-o, SAN=DNS:led-o,DNS:led-o.local,IP:$IP
 * Generated $(Get-Date -Format 'yyyy-MM-dd') with key device.key (RSA-2048, SHA-256, valid 10yr)
 * Re-generate if IP changes: run scripts\Regenerate-DeviceCert.ps1 -IP <NEW_IP>
 */
$(To-CArray $certBytes "device_cert_der_2048")
static const int sizeof_device_cert_der_2048 = $certLen;

$(To-CArray $keyBytes "device_key_der_2048")
static const int sizeof_device_key_der_2048 = $keyLen;
"@

    $outPath = "incs\config\default\net_pres\pres\device_cert_arrays.h"
    [System.IO.File]::WriteAllText($outPath, $header)
    Write-Host "Updated $outPath"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. make build"
    Write-Host "  2. Flash bins/RGBR_MZ_X.hex"
    Write-Host "  3. Re-import device.crt into your OS/browser trust store"
}
finally {
    Pop-Location
}
