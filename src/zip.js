import { execSync } from 'child_process'
import gulp from 'gulp'
import zip from 'gulp-zip'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const packageData = require('../package.json')

// Check if current commit is at a tag
let versionSuffix = ''
try {
  execSync('git describe --tags --exact-match', { stdio: 'pipe' }).toString().trim()
  // If this succeeds, we're at a tag, no suffix needed
} catch (e) {
  // Not at a tag, append short commit hash
  const hash = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim()
  versionSuffix = `+g${hash}`
}

gulp
  .src('build/**')
  .pipe(zip(`${packageData.name}-v${packageData.version}${versionSuffix}.zip`))
  .pipe(gulp.dest('package'))
