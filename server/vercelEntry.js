const app = require('./app');

function handle(req, res) {
  const url = req.url || '/';
  const pathOnly = url.split('?')[0];
  if (pathOnly === '/api' || pathOnly === '/api/') {
    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    const original = req.headers['x-invoke-path'] || req.headers['x-vercel-original-path'];
    if (typeof original === 'string' && original.startsWith('/') && original !== '/api' && original !== '/api/') {
      req.url = original + query;
    } else {
      req.url = `/${query}`;
    }
  }
  return app(req, res);
}

module.exports = handle;
