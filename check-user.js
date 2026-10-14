require('dotenv').config();
const { Client } = require('pg');

const email = process.argv[2] || 'reset.test@example.com';

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

client
  .connect()
  .then(() => client.query('SELECT id, email, role FROM users WHERE email = $1', [email]))
  .then((res) => {
    console.log(res.rows.length ? res.rows : `No user found with email ${email}`);
    return client.end();
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });