const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createServer } = require('./app');

test('GET / returns a healthy response', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  const response = await new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/',
      method: 'GET'
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString() });
      });
    });

    req.on('error', reject);
    req.end();
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /SupplyChainGuard/i);

  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});
