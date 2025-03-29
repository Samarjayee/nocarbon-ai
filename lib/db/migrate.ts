import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Configure dotenv to read from a path specified in an environment variable,
// with a fallback to '.env.local'
config({
  path: process.env.ENV_PATH || '.env.local',
});

// Hardcode the POSTGRES_URL for testing
const POSTGRES_URL = "postgres://postgres.kyhzcamisnebvlvdixob:Shree-803no@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

const runMigrate = async () => {
  const connection = postgres(POSTGRES_URL, { max: 1 });
  const db = drizzle(connection);

  console.log('⏳ Running migrations...');

  const start = Date.now();
  await migrate(db, { migrationsFolder: './lib/db/migrations' });
  const end = Date.now();

  console.log('✅ Migrations completed in', end - start, 'ms');
  process.exit(0);
};

runMigrate().catch((err) => {
  console.error('❌ Migration failed');
  console.error(err);
  process.exit(1);
});