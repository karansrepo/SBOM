# Use cases

SupplyChainGuard is a reference implementation for learning and demonstrating
basic container supply-chain controls. It is most useful when the goal is to
make the path from source code to a deployable image visible and verifiable.

## 1. Run the application locally

Use the minimal Node.js service to confirm that the repository is working:

```bash
npm ci
npm start
```

Visit `http://localhost:3000/` for the application response or
`http://localhost:3000/health` for the health check. Run the focused test suite
with:

```bash
npm test
```

## 2. Demonstrate a secure image build

Push a change to GitHub and open the **Actions** tab. The workflow:

1. Builds the Docker image.
2. Generates an SPDX SBOM.
3. Scans the image with Grype and stops on critical findings.
4. Pushes the image to GHCR only after the scan succeeds.
5. Signs the image digest with Cosign keyless signing.
6. Attaches the signed Grype result as an attestation.

Use the immutable digest from the successful workflow run when verifying or
deploying the image. The detailed commands are in the
[build and verification tutorial](README.md#tutorial-build-sign-and-verify-an-image).

## 3. Enforce provenance in a local Kubernetes cluster

Create a kind cluster, install Kyverno, and apply
[`policies/image-signature-validation.yaml`](policies/image-signature-validation.yaml).
The policy demonstrates admission-time checks for:

- A valid Cosign signature from the expected GitHub Actions workflow.
- A signed Grype attestation.
- No `High` or `Critical` vulnerabilities in the attested result.

Run the signed-image smoke test from the
[Kyverno tutorial](README.md#tutorial-enforce-the-image-in-kind-and-kyverno).
An unsigned image or an image with a disallowed attestation should be denied.

## 4. Review build security data locally

Start PostgreSQL with the documented credentials, load one successful workflow
build, and launch the dashboard:

```bash
docker compose -f db/docker-compose.yml up -d
node loader/load.js <commit-sha>
npm run dashboard
```

Open `http://127.0.0.1:3001/` to review builds, components, vulnerabilities,
and signature status. Keep this dashboard local; it is intentionally
unauthenticated and is not designed for public exposure. The complete setup is
in the [database and dashboard tutorial](README.md#tutorial-load-results-into-postgresql-and-view-the-dashboard).

## What this project is not

This project is not a hosted SBOM service, a multi-tenant registry, or a
production-ready security control plane. It does not include user
authentication, high availability, or automated remediation. Those omissions
are intentional so the core workflow stays understandable and follows YAGNI.
