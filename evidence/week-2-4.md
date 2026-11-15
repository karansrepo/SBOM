# Weeks 2 and 4 verification evidence

Captured 2026-11-01.

## Week 2

- Repository: `https://github.com/karansrepo/SBOM`
- Workflow: `Build, Scan, and Push Demo Image`
- Commit: `c42910cd4eeca959a5f757607210a4098d35cc0a`
- Actions run: https://github.com/karansrepo/SBOM/actions/runs/41332244029
- Result: `success`
- GHCR tag: `c42910cd4eeca959a5f757607210a4098d35cc0a`
- Image: `ghcr.io/karansrepo/supplychainguard-demo`
- Image digest: `sha256:cb1187934ff626f85baa017c9fc2a2855fe6421105b99926d59eb69a0a15094a`
- Package visibility: public

## Week 4

The following verification succeeded locally:

```text
cosign verify \
  --certificate-identity="https://github.com/karansrepo/SBOM/.github/workflows/build.yml@refs/heads/main" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  ghcr.io/karansrepo/supplychainguard-demo@sha256:cb1187934ff626f85baa017c9fc2a2855fe6421105b99926d59eb69a0a15094a
```

Result: signature claims, Rekor transparency-log inclusion, and the signing
certificate all verified successfully.

The certificate values carried into the Kyverno policy are:

- Identity: `https://github.com/karansrepo/SBOM/.github/workflows/build.yml@refs/heads/main`
- OIDC issuer: `https://token.actions.githubusercontent.com`
