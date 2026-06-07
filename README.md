# RGBR_X_WebPages

Web pages for the RGBR_X firmware (PIC32MZ LED matrix controller). Content is compiled into an MPFS2 image and stored in device NVM, served via the Microchip `TCPIP_HTTP_NET` stack.

## Repository Structure

```
web_pages/          Active web content — edit these files, then regenerate MPFS image
  index.htm         Landing page
  forms.htm         Shape / text / bitmap control UI
  upload.htm        SD card BMP upload
  auth.htm          Authentication page
  dynvars.htm       Dynamic variable reference
  modbus.htm        Modbus register map reference
  header.htm        Shared site header (includes PLC banner)
  footer.htm        Shared site footer
  mchp.css          Site stylesheet
  mchp.js           Site JavaScript (AJAX polling, PLC guard, reconnect overlay)
  status.xml        Dynamic status endpoint polled by mchp.js
  get_bmp.xml       BMP list endpoint
  get_bmps.cgi      BMP list CGI
  leds.cgi          LED status CGI
  snmp.bib          SNMP object definitions
new_web/            Staging area for regenerated output files
  http_net_print.c  Regenerated dynamic variable callbacks (copy to srcs/src/)
  http_net_print.h  Regenerated header (copy to incs/src/)
  http_net_print.idx  MPFS index
  mpfs_net_img.c    Regenerated MPFS image C source (copy to srcs/src/)
SD_Card/            Files to place on the device SD card
  protect/          Protected config files (CONFIG.txt, certs, etc.)
  scripts/          Helper scripts
  Temp/             Scratch area
```

## MPFS Regeneration Workflow

The MPFS2 utility compiles `web_pages/` into a C source array that is linked into the firmware and served from NVM. **Any change to a file in `web_pages/` requires regeneration before the next flash.**

1. Open the MPFS2 utility (part of the Harmony 2 Framework tools).
2. Point the project at `web_pages/`.
3. Generate output to `new_web/` (or directly to the target paths below).
4. Copy generated files to the firmware repo:
   - `mpfs_net_img.c` → `RGBR_MZ_X_VS/srcs/src/mpfs_net_img.c`
   - `http_net_print.c` → `RGBR_MZ_X_VS/srcs/src/http_net_print.c`
   - `http_net_print.h` → `RGBR_MZ_X_VS/incs/src/http_net_print.h`
5. Run `make build` in `RGBR_MZ_X_VS`.

> **Tip:** `http_net_print.c` is treated as generated content in the firmware repo. Any manual edits to it (e.g. adding a new dynamic variable registration) will be overwritten on the next regeneration — add new `TCPIP_HTTP_Print_*` function registrations in the `HTTP_APP_DynVarTbl[]` array in `srcs/src/http_net_print.c` (the hand-maintained copy), not in the generated file.

## Dynamic Variables (`status.xml`)

`status.xml` is polled by `mchp.js` every 3 seconds. All fields use MPFS `~variable~` substitution:

| Field | Variable | Description |
|-------|----------|-------------|
| `<pot1>` | `~pot1~` | Analog input 1 |
| `<pot2>` | `~pot2~` | Analog input 2 |
| `<plc_mode>` | `~plc_mode~` | `1` = Modbus/PLC has ownership; `0` = web control active |

The `plc_mode` variable is implemented in `srcs/src/custom_http_net_app.c` as `TCPIP_HTTP_Print_plc_mode()` and registered in `HTTP_APP_DynVarTbl[]`.

## upload.htm — Bitmap Upload

`upload.htm` allows uploading `.bmp` files to the SD card at `/mnt/mchpSite2/`.

**Skip-if-exists policy:** If the target filename already exists on the SD card the upload is silently ignored. This is intentional — it prevents accidental overwrites during a live show. The user must use the Remove BMP button to delete a file before uploading a replacement.

The form uses `onsubmit="return confirmUpload(this);"` which shows a confirmation dialog explaining this policy and requiring explicit user confirmation before the POST is sent.

**Server-side PLC guard:** When the Modbus/PLC client owns the display (`APP_TCPIP_SERVING_CONNECTION`), the firmware's `ConnectionPostExecute` handler rejects the POST immediately and returns without processing the upload. This is separate from the client-side disabling.

## header.htm — PLC Banner

`header.htm` is included on every page via SSI. It contains a hidden amber banner:

```html
<div id="plc-banner" style="display:none; background:#b85c00; color:#fff; ...">
  ⚠ PLC IN CONTROL — Web commands and file uploads are disabled. Pages are read-only.
</div>
```

`mchp.js` shows or hides this banner based on the `plc_mode` value in `status.xml`. Do not remove this element — it is managed programmatically.

## mchp.js — PLC Guard Poller

A self-executing function at the end of `mchp.js` polls `/status.xml` every 3 seconds:

- **`plc_mode = "1"`**: Every interactive element (`input`, `select`, `button`, `textarea`) is tagged `data-plc-disabled="1"` and set to `disabled`. The `#plc-banner` is shown.
- **`plc_mode = "0"`**: Only elements tagged `data-plc-disabled` are re-enabled. Elements that were disabled before PLC mode was entered remain disabled. The `#plc-banner` is hidden.

This "only re-enable tagged elements" rule is intentional — it prevents the poller from accidentally re-enabling controls that were legitimately disabled by the page's own logic before PLC mode was entered.

## SD Card Layout

Files expected on the device SD card at `/mnt/mchpSite2/`:

```
protect/
  CONFIG.txt        Network and runtime configuration (IP, orientation, etc.)
*.bmp               Bitmap files for display (24-bit BMP, max dimensions per firmware config)
```

`CONFIG.txt` format (one key=value per line, `\r\n` line endings):

```
ip=10.0.0.49
gateway=10.0.0.1
subnet=255.255.255.0
orientation_180=0
```

The `orientation_180` line is written in-place by `save_orientation_setting()` in the firmware on every rotation change. Use `SD_Card/protect/CONFIG.txt` as the template when provisioning a new SD card.

## Related Repositories

| Repo | Role |
|------|------|
| `RGBR_MZ_X_VS` | PIC32MZ firmware — builds `bins/RGBR_MZ_X.hex` |
| `ModbusTCP_X` | Modbus TCP server library |
| `XC_GFX_Lib` | GFX rendering library (fonts, draw primitives) |
| `BMP_X` | BMP decode library |
