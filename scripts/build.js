const { execFileSync } = require('node:child_process')
const { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

/**
 * macOS stamps com.apple.FinderInfo onto .app bundle directories that live
 * inside the project tree, and codesign refuses to sign anything carrying it.
 * The same build run outside the tree is clean, so the app is assembled and
 * signed in a staging directory and only the finished DMGs are copied back.
 */
const staging = mkdtempSync(join(tmpdir(), 'displaydeck-build-'))
const release = join(__dirname, '..', 'release')

try {
  execFileSync('npx', ['electron-vite', 'build'], { stdio: 'inherit' })
  execFileSync(
    'npx',
    ['electron-builder', '--mac', '--arm64', '--x64', `-c.directories.output=${staging}`],
    { stdio: 'inherit' }
  )

  mkdirSync(release, { recursive: true })
  const artifacts = readdirSync(staging).filter((file) => file.endsWith('.dmg'))
  if (artifacts.length === 0) throw new Error('electron-builder produced no DMG.')

  for (const file of artifacts) {
    copyFileSync(join(staging, file), join(release, file))
    console.log(`  → release/${file}`)
  }
} finally {
  rmSync(staging, { recursive: true, force: true })
}
