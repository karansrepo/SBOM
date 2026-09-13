const http = require('node:http');

function createServer() {
  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'SupplyChainGuard-demo' }));
      return;
    }

    const payload = {
      service: 'SupplyChainGuard-demo',
      message: 'SupplyChainGuard week 2 demo is running.',
      status: 'healthy'
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const server = createServer();
  server.listen(port, () => {
    console.log(`SupplyChainGuard demo listening on http://localhost:${port}`);
  });
}

module.exports = { createServer };
