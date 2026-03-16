import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerDMG }      from '@electron-forge/maker-dmg'
import { MakerZIP }      from '@electron-forge/maker-zip'

const config: ForgeConfig = {
  packagerConfig: {
    name:      'Mahali Garage',
    executableName: 'mahali-garage',
    asar: true,
    icon: './resources/icon',   // .ico on Windows, .icns on macOS — create these assets later
    extraResource: [],
    ignore: [
      /^\/src/,
      /^\/\.git/,
      /^\/node_modules\/(?!better-sqlite3|bcryptjs|node-machine-id|electron-log)/,
    ],
  },
  rebuildConfig: {},
  makers: [
    // Windows installer
    new MakerSquirrel({
      name: 'MahaliGarage',
      setupIcon: './resources/icon.ico',
    }),
    // macOS disk image
    new MakerDMG({
      name: 'Mahali Garage',
      icon: './resources/icon.icns',
    }),
    // Cross-platform ZIP (fallback)
    new MakerZIP({}, ['linux']),
  ],
}

export default config
