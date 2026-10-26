# SupplyChainGuard Demo

This repository contains the Week 4 SupplyChainGuard implementation using a minimal Node.js HTTP service built on the standard library.

## What is included
- A tiny HTTP service exposing a health endpoint and a default landing response.
- A GitHub Actions workflow that builds the image locally, generates and uploads an SPDX SBOM, scans it for critical vulnerabilities, pushes it to GHCR only if the scan passes, and signs the pushed digest with cosign keyless signing through GitHub OIDC.
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

No admission policies or optional add-ons are installed in Week 5. To tear down the complete cluster:

```bash
kind delete cluster --name supplychainguard
```

## Notes
This is intentionally minimal and follows YAGNI: Week 4 covers the build, SBOM, critical-severity scan gate, image push, and keyless signing pipeline; Week 5 stands up kind and Kyverno without policies. Manual signature verification and cluster setup are documented above.
