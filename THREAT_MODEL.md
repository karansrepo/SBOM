# SupplyChainGuard threat model

## Scope and assumptions

This project demonstrates a software-supply-chain control path from source
commit to Kubernetes admission. The dashboard and database are local demo
services, not production deployments. GitHub, GHCR, Sigstore, Docker, kind,
and Kyverno are assumed to be available and authentic.

## YAGNI boundary

The project implements only the controls needed to demonstrate that path:
build, SBOM generation and scanning, signing, attestation, admission, loading,
and local inspection. Each component and stored field must support one of those
steps or its evidence; new abstractions, configuration knobs, deployment modes,
and operational services are deferred until a demonstrated requirement needs
them.

This boundary is intentional, not a production-readiness gap. In particular,
the local dashboard remains unauthenticated, the database remains
single-instance, and the workflow keeps one fixed critical-severity gate.
Features listed as out of scope below must not be added speculatively.

## Assets

- Source code and workflow configuration.
- Docker image contents and image digest.
- SPDX SBOM and Grype vulnerability results.
- Cosign signature and signed Grype attestation.
- PostgreSQL build and vulnerability records.
- GitHub/GHCR credentials and OIDC identity.

## Threats and controls

| Threat | Impact | Control in this project | Residual risk |
|---|---|---|---|
| Vulnerable dependency is shipped | Compromised workload or exploitable image | Grype scans the generated SBOM; Critical findings stop the workflow | High findings pass CI and are blocked only at admission |
| Unsigned image is deployed | Untrusted code runs in the cluster | Kyverno requires the expected keyless Cosign signature | Policy is scoped to the project image path |
| Image is signed by the wrong identity | An unauthorized workflow or user publishes code | Kyverno pins the GitHub Actions subject and Sigstore issuer | Repository policy and workflow permissions still need protection |
| Scan result is missing or replaced | Vulnerable image bypasses admission | Kyverno requires a signed Grype attestation for the image digest | Attestation semantics depend on the CI predicate format |
| Mutable tag points to changed content | Signature no longer describes the running image | Verification is performed against the image digest | Users can still manually choose an unsafe external image |
| Registry or CI credentials leak | Unauthorized image publication | GitHub OIDC and short-lived `GITHUB_TOKEN` are used; no credentials are committed | Local developer credentials remain the operator's responsibility |
| Malicious or malformed data reaches the dashboard | Stored XSS or query manipulation | Parameterized SQL and HTML escaping | Dashboard has no authentication and must remain local |
| Database access is over-privileged | Build data is modified or exposed | Separate `loader` and read-only `dashboard` roles | PostgreSQL is exposed on localhost for convenience |
| Base image is substituted | Unexpected software enters the image | SBOM and vulnerability scan provide visibility | The current pipeline does not enforce a base-image allow-list or digest pin |

## Out of scope

- Production availability, multi-node Kubernetes, and network isolation.
- Full SLSA provenance or a formal vulnerability exception process.
- Authentication and authorization for the local dashboard.
- Preventing all vulnerabilities; the controls reduce risk and provide
  evidence for release decisions.

## Operational decisions

1. Keep GHCR public for the kind tutorial, or explicitly add pull credentials
   before using a private package.
2. Use image digests in demonstrations and verification commands.
3. Never place tokens or passwords in evidence, committed files, or screenshots.
4. Treat the dashboard as local-only until authentication and TLS are added.

