/**
 * Best-effort removal of ./release before electron-builder.
 * EPERM/EBUSY on Windows usually means mahali-garage.exe, Explorer, or AV has files open.
 */
const fs = require('fs')
const path = require('path')

const dir = path.join(process.cwd(), 'release')

try {
  fs.rmSync(dir, { recursive: true, force: true })
} catch (e) {
  if (e.code === 'ENOENT') process.exit(0)
  if (e.code === 'EPERM' || e.code === 'EBUSY') {
    console.warn(
      '[clean:release] Could not delete ./release (files in use).\n' +
        '  Close: packaged app (mahali-garage.exe), any Explorer window under release/, then retry.\n' +
        '  Continuing the build — if packaging fails, kill those processes and run again.\n'
    )
    process.exit(0)
  }
  throw e
}
