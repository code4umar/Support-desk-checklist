// Runs after the Vercel build. On production deploys it applies any pending
// database migrations, so the schema always matches the code being deployed.
// Preview deploys (branches, pull requests) skip it, so they can never change
// the production database before the code is merged.
const { execSync } = require('child_process');

if (process.env.VERCEL_ENV !== 'production') {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV || 'unset'})`);
  process.exit(0);
}
// Without database settings there is nothing to migrate. Don't fail the whole
// deploy over it: the API's /health will report the missing database, and the
// next deploy after the variables are added runs the migrations.
if (!process.env.DB_HOST) {
  console.warn('WARNING: DB_HOST is not set, so migrations were skipped.');
  console.warn('Add the database variables in Vercel → Settings → Environment Variables, then redeploy.');
  process.exit(0);
}
try {
  execSync('npx typeorm migration:run -d dist/src/data-source.js', { stdio: 'inherit' });
} catch {
  console.error('Migrations failed: check DB_HOST / DB_USERNAME / DB_PASSWORD / DB_DATABASE and DB_SSL=true.');
  process.exit(1);
}
