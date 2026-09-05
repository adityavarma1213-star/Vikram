const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
});

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('VIKRAM database schema is ready');
}

main().catch(error => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
