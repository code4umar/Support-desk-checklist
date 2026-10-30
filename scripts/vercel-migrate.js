// Runs after the Vercel build. On production deploys it applies any pending
// database migrations, so the schema always matches the code being deployed.
// Preview deploys (branches, pull requests) skip it, so they can never change
// the production database before the code is merged.
const { execSync } = require('child_process');

if (process.env.VERCEL_ENV !== 'production') {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV || 'unset'})`);
  process.exit(0);
}
if (!process.env.DB_HOST) {
  console.error('DB_HOST is not set: add the database variables in Vercel → Settings → Environment Variables.');
  process.exit(1);
}
execSync('npx typeorm migration:run -d dist/src/data-source.js', { stdio: 'inherit' });
