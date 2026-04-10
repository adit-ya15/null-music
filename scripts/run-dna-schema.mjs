import { pool } from '../backend/db/postgres.mjs';
import { initializeMusicDNASchema } from '../backend/db/musicDnaSchema.mjs';

try {
  await initializeMusicDNASchema(pool);
  console.log('Music DNA schema migration applied');
} finally {
  await pool.end();
}
