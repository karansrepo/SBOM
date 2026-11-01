#!/usr/bin/env node

const http = require('node:http');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'supplychainguard',
  user: process.env.PGUSER || 'dashboard',
  password: process.env.PGPASSWORD
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>body{font:16px system-ui;margin:2rem;color:#222}table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ccc;padding:.5rem;text-align:left}th{background:#eee}.badge{color:#fff;background:#287a3e;padding:.15rem .4rem;border-radius:.25rem}
    .severity{white-space:nowrap}</style></head><body>${body}</body></html>`;
}

function counts(row) {
  return ['Critical', 'High', 'Medium', 'Low'].map((severity) =>
    `${severity}: ${Number(row[severity.toLowerCase()] || 0)}`).join(' | ');
}

async function buildsPage(res) {
  const result = await pool.query(`
    SELECT b.id, b.commit_sha, b.created_at, b.image_digest, s.verified,
      COUNT(v.id) FILTER (WHERE v.severity = 'Critical') AS critical,
      COUNT(v.id) FILTER (WHERE v.severity = 'High') AS high,
      COUNT(v.id) FILTER (WHERE v.severity = 'Medium') AS medium,
      COUNT(v.id) FILTER (WHERE v.severity = 'Low') AS low
    FROM builds b
    LEFT JOIN signatures s ON s.build_id = b.id
    LEFT JOIN vulnerabilities v ON v.build_id = b.id
    GROUP BY b.id, s.verified
    ORDER BY b.created_at DESC`);
  const rows = result.rows.map((row) => `<tr><td><a href="/builds/${encodeURIComponent(row.id)}">${escapeHtml(row.commit_sha.slice(0, 12))}</a></td>
    <td>${escapeHtml(new Date(row.created_at).toISOString())}</td><td>${escapeHtml(row.image_digest.slice(0, 18))}...</td>
    <td>${row.verified ? '<span class="badge">verified</span>' : 'not verified'}</td><td class="severity">${counts(row)}</td></tr>`).join('');
  sendHtml(res, 200, page('Builds', `<h1>Builds</h1><table><thead><tr><th>Commit</th><th>Date</th><th>Digest</th><th>Signature</th><th>Vulnerabilities</th></tr></thead><tbody>${rows}</tbody></table>`));
}

async function buildPage(res, id) {
  if (!/^\d+$/.test(id)) return sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
  const build = await pool.query('SELECT id, commit_sha, image_digest, created_at FROM builds WHERE id = $1', [id]);
  if (!build.rowCount) return sendHtml(res, 404, page('Not found', '<h1>Build not found</h1>'));
  const components = await pool.query(
    'SELECT name, version, package_type, license FROM sbom_components WHERE build_id = $1 ORDER BY name, version', [id]);
  const vulnerabilities = await pool.query(
    `SELECT v.cve_id, v.severity, v.fixed_version, c.name, c.version
     FROM vulnerabilities v LEFT JOIN sbom_components c ON c.id = v.component_id
     WHERE v.build_id = $1 ORDER BY v.severity, v.cve_id`, [id]);
  const componentRows = components.rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.version)}</td><td>${escapeHtml(row.package_type)}</td><td>${escapeHtml(row.license || '')}</td></tr>`).join('');
  const vulnerabilityRows = vulnerabilities.rows.map((row) => `<tr><td>${escapeHtml(row.cve_id)}</td><td>${escapeHtml(row.severity)}</td><td>${escapeHtml(row.fixed_version || '')}</td><td>${escapeHtml(row.name ? `${row.name}@${row.version}` : 'unmatched')}</td></tr>`).join('');
  const details = build.rows[0];
  sendHtml(res, 200, page('Build detail', `<p><a href="/">All builds</a></p><h1>${escapeHtml(details.commit_sha)}</h1>
    <p>Digest: ${escapeHtml(details.image_digest)}<br>Created: ${escapeHtml(new Date(details.created_at).toISOString())}</p>
    <h2>Components</h2><table><tr><th>Name</th><th>Version</th><th>Type</th><th>License</th></tr>${componentRows}</table>
    <h2>Vulnerabilities</h2><table><tr><th>CVE</th><th>Severity</th><th>Fixed version</th><th>Component</th></tr>${vulnerabilityRows}</table>`));
}

function sendHtml(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function createDashboardServer() {
  return http.createServer(async (req, res) => {
    try {
      if (req.method !== 'GET') return sendHtml(res, 405, page('Method not allowed', '<h1>Method not allowed</h1>'));
      const match = new URL(req.url, 'http://127.0.0.1').pathname.match(/^\/builds\/([^/]+)$/);
      if (req.url === '/' || req.url.startsWith('/?')) return await buildsPage(res);
      if (match) return await buildPage(res, decodeURIComponent(match[1]));
      sendHtml(res, 404, page('Not found', '<h1>Not found</h1>'));
    } catch (error) {
      console.error(error);
      sendHtml(res, 500, page('Database error', '<h1>Unable to load dashboard data</h1>'));
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3001);
  createDashboardServer().listen(port, '127.0.0.1', () => {
    console.log(`Dashboard listening on http://127.0.0.1:${port}`);
  });
}

module.exports = { createDashboardServer, escapeHtml };
