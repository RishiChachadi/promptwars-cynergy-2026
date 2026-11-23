import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { seedDemo } from './seed.mjs'

export function openDatabase(path, now) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
  migrateScheduling(db)
  seedDemo(db, now)
  return db
}

function migrateScheduling(db) {
  db.exec('BEGIN IMMEDIATE')
  try {
    if (!db.prepare('PRAGMA table_info(bookings)').all().some(column => column.name === 'created_at')) {
      db.exec(`
        ALTER TABLE bookings ADD COLUMN created_at TEXT;
        ALTER TABLE projects ADD COLUMN deadline_at TEXT;
        UPDATE projects SET deadline_at = (
          SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ends_at, '+1 day') FROM bookings WHERE id = 'bk-104'
        ) WHERE id = 'campus-air';
        UPDATE projects SET deadline_at = (
          SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ends_at, '+2 days') FROM bookings WHERE id = 'bk-105'
        ) WHERE id = 'signal-filter';
        INSERT INTO project_equipment_requirements
          SELECT p.id, r.id FROM projects p CROSS JOIN resources r
          WHERE (p.id = 'campus-air' AND r.id IN ('esp32-devkit', 'digital-oscilloscope', 'fdm-3d-printer'))
             OR (p.id = 'signal-filter' AND r.id = 'fpga-board');
        INSERT OR IGNORE INTO users VALUES ('faculty-cse', 'Dr. Nikhil Menon', 'faculty', 'CSE');
      `)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
