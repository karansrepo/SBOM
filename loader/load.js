#!/usr/bin/env node

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Client } = require('pg');

const execFileAsync = promisify(execFile);
const IMAGE_REPOSITORY = process.env.IMAGE_REPOSITORY ||
  `ghcr.io/${process.env.GITHUB_REPOSITORY_OWNER || 'karansrepo'}/supplychainguard-demo`;
const ATTESTATION_TYPE = 'https://github.com/karansrepo/SBOM/attestations/grype-scan/v1';

async function command(name, args, options = {}) {
  try {
    return (await execFileAsync(name, args, { maxBuffer: 20 * 1024 * 1024, ...options })).stdout;
  } catch (error) {
    const detail = error.stderr ? `: ${error.stderr.trim()}` : '';
    throw new Error(`${name} ${args.join(' ')} failed${detail}`, { cause: error });
  }
}

function jsonOutput(text, description) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not parse ${description} JSON`, { cause: error });
  }
}

function packageFromPurl(locator) {
  const match = /^pkg:([^/]+)\/([^@]+)@(.+)$/.exec(locator);
  return match ? { packageType: match[1], name: decodeURIComponent(match[2]), version: decodeURIComponent(match[3]) } : null;
}

function componentsFromSbom(sbom) {
  return (sbom.packages || []).flatMap((pkg) => {
    const locator = (pkg.externalRefs || [])
      .map((ref) => ref.referenceLocator)
      .find((value) => typeof value === 'string' && value.startsWith('pkg:'));
    const parsed = locator && packageFromPurl(locator);
    if (!parsed) return [];
    const license = pkg.licenseConcluded && pkg.licenseConcluded !== 'NOASSERTION'
      ? pkg.licenseConcluded
      : pkg.licenseDeclared && pkg.licenseDeclared !== 'NOASSERTION'
        ? pkg.licenseDeclared
        : null;
    return [{ ...parsed, license }];
  });
}

function attestationMatches(attestation) {
  return (Array.isArray(attestation) ? attestation : [attestation]).flatMap((entry) => {
    const payload = entry.payload;
    if (!payload) throw new Error('Cosign attestation output did not contain a payload');
    const statement = jsonOutput(Buffer.from(payload, 'base64').toString('utf8'), 'attestation payload');
    return statement.predicate?.matches || [];
  });
}

function signatureDetails(output) {
  const signature = Array.isArray(output) ? output[0] : output;
  const critical = signature?.critical || {};
  const identity = critical.identity || {};
  const tlogEntry = signature?.tlogEntries?.[0] || {};
  const optional = signature?.optional || {};
  return {
    signerIdentity: optional.Subject || optional.subject ||
      identity.subject || identity['docker-reference'] || identity.dockerReference || null,
    rekorLogIndex: tlogEntry.logIndex ?? optional.logIndex ?? signature?.logIndex ?? null,
    signedAt: tlogEntry.integratedTime
      ? new Date(Number(tlogEntry.integratedTime) * 1000)
      : optional.integratedTime
        ? new Date(Number(optional.integratedTime) * 1000)
        : null
  };
}

async function resolveDigest(image) {
  const output = await command('docker', ['buildx', 'imagetools', 'inspect', image]);
  const match = output.match(/Digest:\s+(sha256:[a-f0-9]+)/i);
  if (!match) throw new Error(`No image digest found for ${image}`);
  return match[1];
}

async function findRun(commitSha) {
  const output = await command('gh', [
    'run', 'list', '--commit', commitSha, '--workflow', 'build.yml', '--limit', '20',
    '--json', 'databaseId,createdAt,status,conclusion,headSha'
  ]);
  const runs = jsonOutput(output, 'workflow run');
  const run = runs.find((candidate) => candidate.headSha === commitSha &&
    candidate.status === 'completed' && candidate.conclusion === 'success');
  if (!run) throw new Error(`No successful build workflow run found for ${commitSha}`);
  return run;
}

async function downloadSbom(runId, directory) {
  await command('gh', ['run', 'download', String(runId), '-n', 'sbom', '-D', directory]);
  const files = await fs.readdir(directory);
  const sbomFile = files.find((file) => file.endsWith('.json'));
  if (!sbomFile) throw new Error('Downloaded SBOM artifact did not contain a JSON file');
  return jsonOutput(await fs.readFile(path.join(directory, sbomFile), 'utf8'), 'SBOM');
}

async function verifyImage(image) {
  const args = [
    'verify', '--output', 'json',
    '--certificate-identity', `https://github.com/${process.env.GITHUB_REPOSITORY || 'karansrepo/SBOM'}/.github/workflows/build.yml@refs/heads/main`,
    '--certificate-oidc-issuer', 'https://token.actions.githubusercontent.com',
    image
  ];
  try {
    return { verified: true, ...signatureDetails(jsonOutput(await command('cosign', args), 'signature')) };
  } catch (error) {
    console.warn(`Signature verification failed; storing an unverified signature: ${error.message}`);
    return { verified: false, signerIdentity: null, rekorLogIndex: null, signedAt: null };
  }
}

async function verifyAttestation(image) {
  const output = await command('cosign', [
    'verify-attestation', '--output', 'json', '--type', ATTESTATION_TYPE,
    '--certificate-identity', `https://github.com/${process.env.GITHUB_REPOSITORY || 'karansrepo/SBOM'}/.github/workflows/build.yml@refs/heads/main`,
    '--certificate-oidc-issuer', 'https://token.actions.githubusercontent.com',
    image
  ]);
  return attestationMatches(jsonOutput(output, 'attestation'));
}

async function loadBuild(commitSha) {
  if (!/^[0-9a-f]{7,64}$/i.test(commitSha)) throw new Error('A commit SHA is required');
  const imageTag = `${IMAGE_REPOSITORY}:${commitSha}`;
  const imageDigest = await resolveDigest(imageTag);
  const run = await findRun(commitSha);
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'supplychainguard-sbom-'));
  try {
    const sbom = await downloadSbom(run.databaseId, temporaryDirectory);
    const signature = await verifyImage(`${IMAGE_REPOSITORY}@${imageDigest}`);
    const matches = await verifyAttestation(`${IMAGE_REPOSITORY}@${imageDigest}`);
    const components = componentsFromSbom(sbom);
    const client = new Client();
    await client.connect();
    try {
      await client.query('BEGIN');
      const build = await client.query(
        `INSERT INTO builds (commit_sha, image_tag, image_digest, status, created_at)
         VALUES ($1, $2, $3, 'published', $4)
         ON CONFLICT (image_digest) DO UPDATE SET
           commit_sha = EXCLUDED.commit_sha, image_tag = EXCLUDED.image_tag,
           status = EXCLUDED.status, created_at = EXCLUDED.created_at
         RETURNING id`,
        [commitSha, imageTag, imageDigest, run.createdAt]
      );
      const buildId = build.rows[0].id;
      await client.query('DELETE FROM vulnerabilities WHERE build_id = $1', [buildId]);
      await client.query('DELETE FROM signatures WHERE build_id = $1', [buildId]);
      await client.query('DELETE FROM sbom_components WHERE build_id = $1', [buildId]);
      const componentIds = new Map();
      for (const component of components) {
        const inserted = await client.query(
          `INSERT INTO sbom_components (build_id, name, version, package_type, license)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [buildId, component.name, component.version, component.packageType, component.license]
        );
        componentIds.set(`${component.name}\0${component.version}`, inserted.rows[0].id);
      }
      for (const match of matches) {
        const vulnerability = match.vulnerability || {};
        const artifact = match.artifact || match.affectedPackage || {};
        const componentId = componentIds.get(`${artifact.name}\0${artifact.version}`) || null;
        await client.query(
          `INSERT INTO vulnerabilities
             (build_id, component_id, cve_id, severity, fixed_version)
           VALUES ($1, $2, $3, $4, $5)`,
          [buildId, componentId, vulnerability.id || vulnerability.cve || 'UNKNOWN',
            vulnerability.severity || 'Unknown',
            vulnerability.fix?.versions?.[0] || vulnerability.fixedVersion || null]
        );
      }
      await client.query(
        `INSERT INTO signatures
           (build_id, signer_identity, rekor_log_index, signed_at, verified)
         VALUES ($1, $2, $3, $4, $5)`,
        [buildId, signature.signerIdentity, signature.rekorLogIndex, signature.signedAt, signature.verified]
      );
      await client.query('COMMIT');
      console.log(`Loaded ${commitSha} (${imageDigest}) with ${components.length} components and ${matches.length} vulnerabilities`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (require.main === module) {
  loadBuild(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { componentsFromSbom, attestationMatches, loadBuild };
