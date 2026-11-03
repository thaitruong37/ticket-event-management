import { pool } from '../src/db'
import { runMigrations } from '../src/db/migrate'

runMigrations()
  .catch((error: unknown) => {
    console.error('Database migration failed', error)
    process.exitCode = 1
  })
  .finally(() => pool.end())
