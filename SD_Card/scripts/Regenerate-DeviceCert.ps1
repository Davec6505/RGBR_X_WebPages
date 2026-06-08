<#
.SYNOPSIS
    Regenerates the HTTPS TLS certificate embedded in the firmware (cert only, reuses key).

.DESCRIPTION
    Run this when the cert is near expiry or the CN/SAN needs updating.
    Requires device.key and device_key.der to already exist (run ECDSA-P-256-DeviceCert.ps1
    once to generate them).

    The SAN contains DNS names only (led-o, led-o.local) — no IP address.
    This means the cert remains valid even if the device IP changes via SD CONFIG.txt.
    Access via https://led-o (add the device IP to hosts file) or https://led-o.local.
    Direct https://<IP> will always show a browser warning — this is intentional.

    After running, rebuild and reflash the firmware:
        make build
    Then re-import device.crt into your browser/OS trust store.

.EXAMPLE
    .\Regenerate-DeviceCert.ps1
#>
param()

$RepoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $RepoRoot

try {
    if (-not (Test-Path "device.key")) {
        Write-Error "device.key not found in repo root. Run scripts\ECDSA-P-256-DeviceCert.ps1 first to generate key and cert."
        exit 1
    }
    if (-not (Test-Path "device_key.der")) {
        Write-Error "device_key.der not found. Run scripts\ECDSA-P-256-DeviceCert.ps1 first."
        exit 1
    }

    Write-Host "Generating cert for CN=led-o SAN=DNS:led-o,DNS:led-o.local (no IP) ..."

    openssl req -new -x509 -key device.key -out device.crt -days 3650 `
        -subj "/CN=led-o/O=Milands Electronic Solutions/C=AU" `
        -addext "subjectAltName=DNS:led-o,DNS:led-o.local"

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
/* Device self-signed cert — ECDSA P-256, SHA-256
 * CN=led-o, O=Milands Electronic Solutions, SAN=DNS:led-o,DNS:led-o.local
 * No IP SAN — cert remains valid when device IP changes via SD CONFIG.txt.
 * Generated $(Get-Date -Format 'yyyy-MM-dd') (valid 10 years)
 * Re-generate: run scripts\Regenerate-DeviceCert.ps1 (cert only) or ECDSA-P-256-DeviceCert.ps1 (full)
 */
$(To-CArray $certBytes "device_cert_der_ecc")
static const int sizeof_device_cert_der_ecc = $certLen;

$(To-CArray $keyBytes "device_key_der_ecc")
static const int sizeof_device_key_der_ecc = $keyLen;
"@

    $outPath = "incs\config\default\net_pres\pres\device_cert_arrays.h"
    [System.IO.File]::WriteAllText($outPath, $header)
    Write-Host "Updated $outPath"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. make build"
    Write-Host "  2. Flash bins/RGBR_MZ_X.hex"
    Write-Host "  3. Re-import device.crt into your OS/browser trust store"
    Write-Host ""
    Write-Host "Access via: https://led-o  (add device IP to hosts file)"
    Write-Host "Note: https://<IP> will always show a browser warning (no IP SAN)."
}
finally {
    Pop-Location
}
