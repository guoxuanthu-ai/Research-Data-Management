import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pool } from './client.js';

export async function runMigrations(): Promise<string[]> {
  const directory = ['../../../migrations/', '../../../../../../migrations/']
    .map((path) => fileURLToPath(new URL(path, import.meta.url)))
    .find((path) => existsSync(path));
  if (!directory) throw new Error('Migration directory not found');
  const connection = await pool.getConnection();
  try {
    await connection.query("SET SESSION time_zone = '+00:00'");
    const [lockResult] = await connection.query('SELECT GET_LOCK(?,60) AS acquired', ['rds_schema_migrations']);
    if (Number((lockResult as Array<{ acquired: number }>)[0]?.acquired) !== 1) throw new Error('Could not acquire migration lock');
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    const files = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    const [applied] = await connection.query('SELECT name FROM schema_migrations');
    const names = new Set((applied as Array<{ name: string }>).map((row) => row.name));
    const completed: string[] = [];
    for (const name of files) {
      if (names.has(name)) continue;
      const sql = await readFile(`${directory}${name}`, 'utf8');
      const statements = sql.split(';').map((part) => part.trim()).filter(Boolean);
      await connection.beginTransaction();
      try {
        for (const statement of statements) await connection.query(statement);
        await connection.query('INSERT INTO schema_migrations(name) VALUES (?)', [name]);
        await connection.commit();
        completed.push(name);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    return completed;
  } finally {
    try { await connection.query('SELECT RELEASE_LOCK(?)', ['rds_schema_migrations']); } finally { connection.release(); }
  }
}
