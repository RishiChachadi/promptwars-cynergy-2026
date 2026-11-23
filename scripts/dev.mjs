import { spawn } from 'node:child_process'

const commands = [
  ['--watch', '--env-file-if-exists=.env', 'server/index.mjs', '--development'],
  ['node_modules/vite/bin/vite.js', '--config', 'client/vite.config.ts'],
]
const children = commands.map(args => spawn(process.execPath, args, { stdio: 'inherit' }))
let stopping = false

function stop(code) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) child.kill()
}

for (const child of children) {
  child.on('exit', code => stop(code ?? 1))
  child.on('error', error => {
    console.error(error.message)
    stop(1)
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
