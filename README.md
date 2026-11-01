# SupplyChainGuard Demo

This repository contains the Week 4 SupplyChainGuard implementation using a minimal Node.js HTTP service built on the standard library.

## What is included
- A tiny HTTP service exposing a health endpoint and a default landing response.
- A GitHub Actions workflow that builds the image locally, generates and uploads an SPDX SBOM, scans it for critical vulnerabilities into a JSON report, pushes it to GHCR only if the scan passes, and signs and attests the pushed digest with cosign keyless signing through GitHub OIDC.
- A Dockerfile for containerizing the demo app.
- A small Node test to verify the core app behavior.

## Run locally

```bash
npm install
npm start
```

Then visit:
- http://localhost:3000/
- http://localhost:3000/health

## Test locally

```bash
npm test
```

## Verify an image signature

After a workflow run succeeds, copy the image digest from the `Push image` step and verify it locally. Replace `<owner>`, `<repo>`, and `<digest>` with the GitHub repository owner, repository name, and pushed digest:

```bash
cosign verify \
  --certificate-identity="https://github.com/<owner>/<repo>/.github/workflows/build.yml@refs/heads/main" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  "ghcr.io/<owner>/supplychainguard-demo@<digest>"
```

If you need to inspect the identity recorded in the certificate first, use the less restrictive command:

```bash
cosign verify \
  --certificate-identity-regexp='.*' \
  --certificate-oidc-issuer-regexp='.*' \
  "ghcr.io/<owner>/supplychainguard-demo@<digest>"
```

These verification commands are intended to be run manually, not as workflow steps.

## Verify the Grype attestation

The workflow attaches the JSON Grype report to the same image digest that it signs.
Verify it locally using the same keyless identity constraints:

```bash
cosign verify-attestation \
  --type https://github.com/karansrepo/SBOM/attestations/grype-scan/v1 \
  --certificate-identity="https://github.com/<owner>/<repo>/.github/workflows/build.yml@refs/heads/main" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  "ghcr.io/<owner>/supplychainguard-demo@<digest>"
```

The command returns an envelope whose `payload` is base64-encoded. Decode it and
inspect the predicate's `matches[].vulnerability.severity` values; the policy
rejects exact `High` and `Critical` values at admission time.

To inspect the decoded statement directly:

```bash
cosign verify-attestation \
  --output json \
  --type https://github.com/karansrepo/SBOM/attestations/grype-scan/v1 \
  --certificate-identity="https://github.com/<owner>/<repo>/.github/workflows/build.yml@refs/heads/main" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  "ghcr.io/<owner>/supplychainguard-demo@<digest>" |
  jq -r '.payload' | base64 --decode | jq .
```

## Week 5: kind and Kyverno

Install Docker, `kubectl`, `kind`, and Helm. See the [kind installation guide](https://kind.sigs.k8s.io/docs/user/quick-start/) for the platform-specific installation steps.

Create the single-node cluster and check that kubectl selected its context:

```bash
kind create cluster --name supplychainguard
kubectl get nodes
kubectl config current-context
kubectl version
```

Make the `supplychainguard-demo` package public in GitHub under **Packages → supplychainguard-demo → Package settings → Change visibility**. Then smoke-test the signed Week 4 image by digest before installing Kyverno. Replace `<owner>` and `<digest>` with the image owner and `sha256:...` digest from the successful Week 4 workflow run:

```bash
IMAGE="ghcr.io/<owner>/supplychainguard-demo@<digest>"
kubectl run supplychainguard-smoke --image="$IMAGE" --restart=Never
kubectl wait --for=condition=Ready pod/supplychainguard-smoke --timeout=180s
kubectl logs supplychainguard-smoke
kubectl delete pod supplychainguard-smoke
```

This repository's demo is a Node.js HTTP service, so its startup log is not a Flask message. If the pod cannot pull the image, check package visibility and the image digest.

Install Kyverno with the chart defaults only:

```bash
helm repo add kyverno https://kyverno.github.io/kyverno/
helm repo update
helm install kyverno kyverno/kyverno -n kyverno --create-namespace
```

Verify the installation:

```bash
kubectl get pods -n kyverno
kubectl get crd | grep -i kyverno
kubectl get validatingwebhookconfigurations | grep -i kyverno
helm list -n kyverno
```

The installed release in this environment is Kyverno v1.19.1, which includes the fix for the ImageValidatingPolicy PolicyException signature-verification advisory affecting v1.14.0 through v1.19.0. Check Kyverno's [release compatibility matrix](https://kyverno.io/docs/installation/releases/) against the Kubernetes server version reported by `kubectl version`. The default kind cluster created for this run is Kubernetes v1.37.0; Kyverno v1.19's matrix lists v1.33–v1.35 as supported/tested, so v1.37 is outside that range even though this installation became healthy.

Apply the Week 6/7 image policy after Kyverno is installed:

```bash
kubectl apply -f policies/image-signature-validation.yaml
```

The policy requires both the keyless image signature and the signed Grype
attestation. CI blocks `CRITICAL` findings before push; admission additionally
blocks `High` findings. Existing Week 4–6 images without an attestation are
expected to be denied.

No admission policies or optional add-ons are installed automatically in Week 5. To tear down the complete cluster:

```bash
kind delete cluster --name supplychainguard
```

## Week 8: Postgres loader and dashboard

The Week 8 implementation is split into [db/](db/), [loader/](loader/) and
[dashboard/](dashboard/). It uses Node.js rather than Flask and keeps the
dashboard intentionally local and unauthenticated.

Export credentials in the shell; do not put them in a committed file:

```bash
export POSTGRES_PASSWORD='choose-a-bootstrap-admin-password'
export LOADER_PASSWORD='choose-a-loader-password'
export DASHBOARD_PASSWORD='choose-a-dashboard-password'
docker compose -f db/docker-compose.yml up -d
```

The init scripts run only for a new named volume. To recreate the schema after
changing it, remove the specific project volume shown by `docker volume ls`,
then start the service again.

Load one successful workflow build at a time. The loader resolves the digest,
downloads the `sbom` artifact, verifies the image and Grype attestation, and
replaces that build's child rows in one transaction:

```bash
node loader/load.js <commit-sha>
```

Set `IMAGE_REPOSITORY` when the image is not the default
`ghcr.io/karansrepo/supplychainguard-demo`. The loader uses the normal `gh`,
`docker`, and `cosign` logins from the shell and does not store credentials.

Run the read-only dashboard with the dashboard role:

```bash
export PGPASSWORD="$DASHBOARD_PASSWORD"
npm run dashboard
```

For the loader, use the owner role explicitly:

```bash
export PGUSER=loader
export PGPASSWORD="$LOADER_PASSWORD"
```

Open http://127.0.0.1:3001/ for the build trend, or select a build to view its
components and vulnerabilities. The dashboard uses parameterized SQL and
escapes all values before rendering HTML.

Useful checks after loading builds:

```sql
SELECT 'builds' AS table_name, count(*) FROM builds
UNION ALL SELECT 'sbom_components', count(*) FROM sbom_components
UNION ALL SELECT 'vulnerabilities', count(*) FROM vulnerabilities
UNION ALL SELECT 'signatures', count(*) FROM signatures;

SELECT b.commit_sha, v.severity, count(*)
FROM builds b JOIN vulnerabilities v ON v.build_id = b.id
GROUP BY b.commit_sha, v.severity ORDER BY b.commit_sha, v.severity;

SELECT c.name, c.version, count(DISTINCT c.build_id) AS build_count
FROM sbom_components c
GROUP BY c.name, c.version HAVING count(DISTINCT c.build_id) > 1
ORDER BY build_count DESC, c.name;
```

The last query is the relational reason for using Postgres: it answers which
components are shared across builds with a direct join/grouping query.

## Notes
This is intentionally minimal and follows YAGNI: Week 4 covers the build, SBOM, critical-severity scan gate, image push, and keyless signing pipeline; Week 5 stands up kind and Kyverno without policies. Manual signature verification and cluster setup are documented above.
