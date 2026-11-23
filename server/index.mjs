import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.mjs'
import { createProjectAssistant } from './assistant.mjs'
import { openDatabase } from './database.mjs'

const port = Number(process.env.PORT || 3001)
const databasePath = process.env.LABLINK_DB_PATH || 'data/lablink.sqlite'
const db = openDatabase(databasePath === ':memory:' ? databasePath : resolve(databasePath))
const dist = fileURLToPath(new URL('../client/dist', import.meta.url))
const app = createApp({
  db,
  assistant: createProjectAssistant(process.env, {
    db,
    development: process.argv.includes('--development') || process.env.NODE_ENV === 'development',
  }),
  staticDirectory: existsSync(dist) ? dist : undefined,
})

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`LabLink API listening on http://127.0.0.1:${server.address().port}`)
})
server.on('error', error => {
  console.error(error.message)
  db.close()
  process.exitCode = 1
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => db.close()))
}
