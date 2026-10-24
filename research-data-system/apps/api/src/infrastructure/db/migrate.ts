import { closeDb } from './client.js';
import { runMigrations } from './migrationRunner.js';

try {
  const applied = await runMigrations();
  console.log(JSON.stringify({ applied }));
} finally {
  await closeDb();
}
