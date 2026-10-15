require('dotenv').config();
const { Client } = require('pg');
const { createHash, randomBytes } = require('crypto');

const mode = process.argv[2]; // "link" ya khali
const email = process.argv[3];

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

(async () => {
  await client.connect();
  console.log('NODE_ENV =', process.env.NODE_ENV || '(not set)');
  console.log('DB_HOST  =', process.env.DB_HOST);

  if (mode === 'link') {
    if (!email) {
      console.log('Usage: node reset-debug.js link user@email.com');
      return;
    }
    const u = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!u.rows.length) {
      console.log('No user with that email');
      return;
    }
    const token = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(token).digest('hex');
    await client.query(
      'UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [u.rows[0].id],
    );
    await client.query(
      "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')",
      [u.rows[0].id, hash],
    );
    const base = process.env.FRONTEND_URL || 'http://localhost:3000';
    console.log('Open this link:', `${base}/reset-password?token=${token}`);
    return;
  }

  const r = await client.query(
    'SELECT id, user_id, expires_at, used_at, created_at FROM password_resets ORDER BY id DESC LIMIT 5',
  );
  console.log(r.rows.length ? r.rows : 'password_resets is empty');
})()
  .catch((e) => console.error('Error:', e.message))
  .finally(() => client.end());