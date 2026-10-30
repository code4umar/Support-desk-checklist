// Vercel function: every request is rewritten here (see vercel.json).
// The Nest app is compiled to dist/ by the build step; this just hands
// each request to it. If the compiled app can't even be loaded (a missing
// file or package), answer with the reason instead of crashing silently.
let handler;
try {
  handler = require('../dist/src/vercel').default;
} catch (err) {
  console.error('Could not load the API bundle:', err);
  handler = (req, res) => {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'error', message: 'Could not load the API bundle', reason: err.message }));
  };
}
module.exports = handler;
