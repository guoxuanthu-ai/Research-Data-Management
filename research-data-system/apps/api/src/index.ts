import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './config/env.js';
import { closeDb } from './infrastructure/db/client.js';

const server = serve({ fetch: app.fetch, port: env.API_PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(JSON.stringify({ level: 'info', message: `API listening on ${info.address}:${info.port}` }));
});

async function shutdown(): Promise<void> {
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
