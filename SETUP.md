# Setup and testing

This guide gets SupplyChainGuard running locally and explains how to verify
each part of the demonstration. The project is a local learning demo, not a
production security service.

## Prerequisites

### Required for the application

- Git
- Node.js 22 or newer
- npm

### Required for the container pipeline

- Docker Engine or Docker Desktop
- A GitHub repository and permission to run GitHub Actions
- GitHub Container Registry access
- `cosign`, `jq`, and GitHub CLI (`gh`) for local verification

### Required for the Kubernetes test

- `kubectl`
- [kind](https://kind.sigs.k8s.io/)
- [Helm](https://helm.sh/)

### Required for the dashboard test

- Docker Compose (included with current Docker Desktop and Docker Engine
  installations)
- `gh`, Docker, and `cosign` available on `PATH`

The optional [devcontainer](.devcontainer/devcontainer.json) provides a
consistent Node.js and Docker development environment, but the external
tools above may still need to be installed separately.

## Install the project

```bash
git clone https://github.com/karansrepo/SBOM.git
cd SBOM
npm ci
```

If this is a fork, update the owner and repository in
[build.yml](.github/workflows/build.yml) and
[image-signature-validation.yaml](policies/image-signature-validation.yaml).

## Test the Node.js service

Run the focused automated test suite:

```bash
npm test
```

Start the service:

```bash
npm start
```

In another terminal, check both endpoints:

```bash
curl -i http://127.0.0.1:3000/
curl -i http://127.0.0.1:3000/health
```

The first request should return a `200` response containing
`SupplyChainGuard`. The health endpoint should return JSON with
`"status":"ok"`. Stop the service with `Ctrl-C`.

## Test the container locally

Build the image:

```bash
docker build -t supplychainguard-demo:local .
```

Run it on port 3000:

```bash
docker run --rm --name supplychainguard-demo -p 3000:3000 supplychainguard-demo:local
```

In another terminal:

```bash
curl -fsS http://127.0.0.1:3000/health
```

The image runs as the non-root `app` user. Stop it with `Ctrl-C`.

## Test the GitHub Actions supply-chain pipeline

Push a branch or commit to GitHub:

```bash
git push origin HEAD
```

The workflow in [.github/workflows/build.yml](.github/workflows/build.yml)
should:

1. Build the image.
2. Generate an SPDX SBOM.
3. Fail if the SBOM contains a Critical vulnerability.
4. Push the image to GHCR only after the scan passes.
5. Sign the image digest with Cosign keyless signing.
6. Attach the signed Grype result as an attestation.

The workflow uses the repository `GITHUB_TOKEN`; no personal registry token
should be committed. Copy the immutable digest from the successful **Push
image** step. Do not use a mutable tag for verification.

Verify the image signature:

```bash
cosign verify \
  --certificate-identity="https://github.com/<owner>/<repo>/.github/workflows/build.yml@refs/heads/main" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  "ghcr.io/<owner>/supplychainguard-demo@<digest>"
```

Verify the Grype attestation:

```bash
cosign verify-attestation \
  --type https://github.com/karansrepo/SBOM/attestations/grype-scan/v1 \
  --certificate-identity="https://github.com/<owner>/<repo>/.github/workflows/build.yml@refs/heads/main" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  "ghcr.io/<owner>/supplychainguard-demo@<digest>"
```

Replace `<owner>`, `<repo>`, and `<digest>` with values from the workflow.
For a fork, replace the attestation type URL with the value configured in that
fork's workflow and policy.

## Test admission in kind and Kyverno

Create a cluster and install Kyverno:

```bash
kind create cluster --name supplychainguard
kubectl get nodes
helm repo add kyverno https://kyverno.github.io/kyverno/
helm repo update
helm install kyverno kyverno/kyverno -n kyverno --create-namespace
kubectl wait --for=condition=Available deployment/kyverno-admission-controller \
  -n kyverno --timeout=180s
kubectl apply -f policies/image-signature-validation.yaml
```

Make the GHCR package public, or configure an image pull secret. Set the
successful workflow image digest and test the signed image:

```bash
IMAGE="ghcr.io/<owner>/supplychainguard-demo@<digest>"
kubectl run supplychainguard-demo --image="$IMAGE" --restart=Never
kubectl wait --for=condition=Ready pod/supplychainguard-demo --timeout=180s
kubectl logs pod/supplychainguard-demo
kubectl delete pod supplychainguard-demo
```

Expected result: the signed image with a valid Grype attestation is admitted.
For a negative test, use an unsigned image or an image with an invalid
attestation and confirm that Kyverno denies the pod.

### Test an unrelated project image

The policy currently matches only:

```text
ghcr.io/karansrepo/supplychainguard-demo*
```

Therefore, an unrelated public image such as `nginx` is intentionally outside
the policy scope. You can verify that behavior with:

```bash
kubectl run unrelated-image --image=nginx:latest --restart=Never
kubectl wait --for=condition=Ready pod/unrelated-image --timeout=180s
kubectl get pod unrelated-image
kubectl delete pod unrelated-image
```

This confirms that the current policy does not enforce SupplyChainGuard
requirements on every image in the cluster.

### Test another project's container with the policy

You cannot use this repository's signature policy unchanged for an arbitrary
third-party image. The policy checks both the image path and the exact GitHub
Actions OIDC identity that signed the image:

```text
https://github.com/<owner>/<repo>/.github/workflows/build.yml@refs/heads/main
```

To protect another project, get the project's permission to change its
configuration and then:

1. Make that project generate an SBOM, scan it, sign the image digest, and
   attach a signed Grype attestation.
2. Add that project's image registry path under `matchImageReferences`.
3. Replace the `attestors.cosign.cosign.keyless.identities` subject with the
   project's workflow identity.
4. Use the same attestation type as that project's workflow.
5. Apply the resulting policy to a disposable kind cluster.
6. Test one signed digest, one unsigned digest, and one image with a
   disallowed vulnerability.

For example, the policy would need values conceptually similar to:

```yaml
matchImageReferences:
  - glob: "ghcr.io/example-org/example-service*"
identities:
  - subject: "https://github.com/example-org/example-service/.github/workflows/build.yml@refs/heads/main"
```

Do not broaden the glob to `ghcr.io/*` or accept any Cosign identity unless
you intentionally want a cluster-wide policy. A valid signature from an
untrusted project does not prove that the image satisfies this project's
build and scanning controls.

Delete the test cluster when finished:

```bash
kind delete cluster --name supplychainguard
```

## Test the PostgreSQL loader and dashboard

Start PostgreSQL with credentials supplied through environment variables:

```bash
export POSTGRES_PASSWORD='choose-a-bootstrap-admin-password'
export LOADER_PASSWORD='choose-a-loader-password'
export DASHBOARD_PASSWORD='choose-a-dashboard-password'
docker compose -f db/docker-compose.yml up -d
```

Load a successful workflow build. The loader uses `gh`, Docker, and Cosign
from the current shell:

```bash
node loader/load.js <commit-sha>
```

For a fork or a different image repository:

```bash
IMAGE_REPOSITORY="ghcr.io/<owner>/supplychainguard-demo" \
  node loader/load.js <commit-sha>
```

Start the read-only local dashboard:

```bash
export PGUSER=dashboard
export PGPASSWORD="$DASHBOARD_PASSWORD"
npm run dashboard
```

Open <http://127.0.0.1:3001/> and select a build. Confirm that the page shows
the commit, image digest, signature status, SBOM components, and
vulnerabilities.

The dashboard is unauthenticated and binds to localhost only. Do not expose
port 3001 publicly. Stop it with `Ctrl-C`, then stop PostgreSQL:

```bash
docker compose -f db/docker-compose.yml down
```

The database schema is initialized only when the named volume is first
created. If the schema must be recreated, remove only the
`supplychainguard-postgres-data` volume after stopping the service:

```bash
docker volume rm supplychainguard-postgres-data
```

## Full test evidence

The scenario-based test log, expected results, cleanup checklist, and known
gaps are documented in [TESTING.md](TESTING.md). It covers clean builds,
Critical and High vulnerabilities, unsigned images, wrong signing identities,
overwritten tags, missing attestations, and dashboard escaping.
