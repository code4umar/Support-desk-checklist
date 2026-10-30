// Vercel function: every request is rewritten here (see vercel.json).
// The Nest app is compiled to dist/ by the build step; this just hands
// each request to it.
module.exports = require('../dist/src/vercel').default;
