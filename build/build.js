const path = require('path')
const { copyFileSync } = require('fs')
const fs = require('licia/fs')

const pkg = require('../package.json')

delete pkg.scripts
delete pkg.devDependencies

fs.writeFile(
  path.resolve(__dirname, '../dist/package.json'),
  JSON.stringify(pkg, null, 2),
  'utf8',
)

/**
 * Keep the canonical filename for compatibility and add a versioned bundle for
 * direct distribution.
 */
copyFileSync(
  path.resolve(__dirname, '../dist/eruda.js'),
  path.resolve(__dirname, `../dist/eruda-${pkg.version}.js`),
)
