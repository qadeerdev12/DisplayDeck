const { execFileSync } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

/**
 * Two macOS quirks conspire here.
 *
 * Files electron-builder copies into the bundle carry metadata that makes
 * codesign refuse with "resource fork, Finder information, or similar detritus
 * not allowed". Neither `xattr -cr` nor `ditto --noextattr` clears it; copying
 * with `cp -RX` does.
 *
 * But a copy made *inside* the project directory picks the metadata straight
 * back up, so the scrubbed copy has to live somewhere else while it is signed,
 * and is only then moved back. The signature survives the return trip.
 *
 * Signing happens here rather than in electron-builder because its own signing
 * step runs against the untouched files and fails for the same reason.
 */
exports.default = async function afterPack(context) {
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const staging = mkdtempSync(join(tmpdir(), 'displaydeck-sign-'))
  const staged = join(staging, 'DisplayDeck.app')

  try {
    execFileSync('cp', ['-RX', appPath, staged])
    execFileSync('codesign', ['--sign', '-', '--force', '--deep', staged])
    execFileSync('codesign', ['--verify', '--strict', staged])

    rmSync(appPath, { recursive: true, force: true })
    execFileSync('cp', ['-RX', staged, appPath])
    execFileSync('codesign', ['--verify', '--strict', appPath])
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
