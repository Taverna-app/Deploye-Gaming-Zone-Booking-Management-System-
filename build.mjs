// Builds the API and the web app and puts everything the server needs in deploy/release/.
//   npm run deploy:build            (from the repository root)
// Copy deploy/release/ to the server, then follow deploy/README.md.
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'deploy', 'release')
// Installs need the dev tools (TypeScript, Vite), so NODE_ENV is not forced to production here.
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })

// The web app talks to the API at the address baked in at build time, so it has to be the public one.
const readEnv = (file) =>
  existsSync(file) ? Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]])) : {}
const viteEnv = { ...readEnv(path.join(root, 'frontend', '.env')), ...readEnv(path.join(root, 'frontend', '.env.production')), ...process.env }
const apiUrl = viteEnv.VITE_API_URL ?? ''
if (!apiUrl || /localhost|127\.0\.0\.1/.test(apiUrl)) {
  console.error(`\nVITE_API_URL is "${apiUrl || '(not set)'}". Visitors' browsers cannot reach that.`)
  console.error('Put the public API address in frontend/.env.production, e.g.')
  console.error('  VITE_API_URL=https://api.example.com/api\n  VITE_SOCKET_URL=https://api.example.com\n')
  if (!process.argv.includes('--allow-localhost')) process.exit(1)
}

console.log('\n> Building the API')
run('npm install --no-audit --no-fund', path.join(root, 'backend'))
run('npm run build', path.join(root, 'backend'))
console.log('\n> Building the web app')
run('npm install --no-audit --no-fund', path.join(root, 'frontend'))
run('npm run build', path.join(root, 'frontend'))

console.log(`\n> Assembling ${path.relative(root, out)}`)
rmSync(out, { recursive: true, force: true })
mkdirSync(path.join(out, 'backend'), { recursive: true })
cpSync(path.join(root, 'backend', 'dist'), path.join(out, 'backend', 'dist'), { recursive: true, filter: (f) => !f.endsWith('.map') })
for (const f of ['package.json', 'package-lock.json', '.env.example']) cpSync(path.join(root, 'backend', f), path.join(out, 'backend', f))
cpSync(path.join(root, 'frontend', 'dist'), path.join(out, 'frontend'), { recursive: true })
for (const f of ['ecosystem.config.cjs', 'README.md']) cpSync(path.join(root, 'deploy', f), path.join(out, f))
writeFileSync(path.join(out, 'BUILD_INFO.txt'), `Built ${new Date().toISOString()}\nVITE_API_URL=${apiUrl}\nVITE_SOCKET_URL=${viteEnv.VITE_SOCKET_URL ?? ''}\n`)

console.log(`\nDone. Upload ${path.relative(root, out)}/ to the server and follow its README.md.`)
