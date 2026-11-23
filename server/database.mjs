import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { seedDemo } from './seed.mjs'

export function openDatabase(path, now) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
  seedDemo(db, now)
  return db
}
