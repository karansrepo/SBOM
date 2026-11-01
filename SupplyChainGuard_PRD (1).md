# Product Requirements Document: SupplyChainGuard

**Subtitle:** SBOM Generation, Image Signing & Verify-on-Deploy Pipeline for Kubernetes
**Author:** Karan Singh Thakur
**Program:** MCA Minor Project — 3 Credits
**Duration:** 3 months (~5 hrs/week, ~65 hours total)
**Version:** 1.4
**Date:** September 2026
**Last Updated:** November 1, 2026 — Weeks 1–9 implementation complete; live integration evidence pending

---

## 1. Executive Summary

SupplyChainGuard is a CI/CD security pipeline that closes the gap between "code is committed" and "code is safe to run in production." Every image built by the pipeline gets a Software Bill of Materials (SBOM), is scanned for known vulnerabilities, and is cryptographically signed — and a Kubernetes admission policy refuses to deploy anything that skips this process. The project demonstrates practical software supply-chain security: a discipline formalized by frameworks like SLSA and increasingly required in industry (referenced in Gartner's 2026 Magic Quadrant for Software Supply Chain Security).

The project's value as a minor project is that it isn't a demo of a single tool — it's an end-to-end pipeline stitching together five real, industry-standard tools (Syft, Grype, cosign, Kyverno, GitHub Actions) into one coherent security control, backed by a queryable data store and a dashboard that shows the evidence.

---

## 2. Background & Motivation

Most container images deployed to production include dozens of third-party dependencies whose provenance and vulnerability status are unknown at deploy time. Recent supply-chain attacks (e.g., compromised base images, typosquatted packages) have made "what's actually inside this image, and can I trust who built it" a first-class security question — not just "does this image run."

This project is a natural extension of prior work: a Judge0-based code execution pipeline (Words2Binary) that involved isolated build/execution, and hands-on Kubernetes community experience (Data on Kubernetes internship). SupplyChainGuard applies that same infrastructure instinct specifically to the software supply chain problem.

---

## 3. Goals & Objectives

### 3.1 Primary Project Goals
- Build a working CI/CD pipeline that generates an SBOM, scans for vulnerabilities, and signs every container image it produces.
- Enforce those guarantees at deploy time via a Kubernetes policy that blocks unsigned or vulnerable images.
- Persist build/scan/signature data in a relational database queryable for trends and evidence.
- Present a dashboard that makes the pipeline's decisions visible and auditable.

### 3.2 Learning Objectives
- Understand the SLSA supply-chain security framework and where this pipeline sits on it.
- Gain hands-on experience with keyless signing (Sigstore/cosign via OIDC) and policy-as-code (Kyverno).
- Practice relational schema design for security/audit data.
- Build and defend a threat model in front of mentors.

---

## 4. Non-Goals / Out of Scope

- Runtime threat detection (e.g., Falco-style syscall monitoring) — this project is build/deploy-time, not runtime.
- Multi-cluster or multi-cloud deployment; a single local cluster (kind/minikube) is sufficient.
- Custom-built signing infrastructure — the project uses existing Sigstore infrastructure (Fulcio/Rekor) rather than building a private PKI.
- Production-grade authentication/authorization for the dashboard itself (basic access is enough for a demo).

---

## 5. Users & Stakeholders

| Stakeholder | Interest |
|---|---|
| Student (self) | Deliver a working, defensible project within the time budget |
| Faculty mentor | Technical soundness, design justification, evidence of independent problem-solving |
| Evaluation committee | Clear demo, measurable outcomes, understanding of underlying concepts |
| (Hypothetical) platform team | Would consume this as a real deploy-time safeguard |

---

## 6. Requirements

### 6.1 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Pipeline builds a Docker image from a demo application on every push | Must |
| FR-2 | Pipeline generates an SBOM (Syft) for each built image | Must |
| FR-3 | Pipeline scans the image's SBOM for CVEs (Grype) and fails the build on CRITICAL findings, before anything is pushed (threshold is a single value, made configurable only if a later need appears) | Must |
| FR-4 | Pipeline signs each pushed image, by digest, using cosign keyless signing (Sigstore/Fulcio/Rekor via GitHub OIDC) | Must |
| FR-5 | Kubernetes cluster enforces a Kyverno `ImageValidatingPolicy` that rejects any pod whose image lacks a valid keyless signature from this repository's pipeline workflow | Must |
| FR-6 | Kyverno policy also rejects images with unresolved critical/high CVEs (needs scan results attached to the image as an attestation — scoped in Week 7) | Should |
| FR-7 | Build, SBOM, vulnerability, and signature data are persisted to a relational database | Must |
| FR-8 | Dashboard displays SBOM contents and vulnerability trend per build | Should |
| FR-9 | Pipeline generates SLSA provenance attestation, verified alongside the signature | Could (stretch) |

### 6.2 Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | Pipeline run (build → SBOM → scan → push → sign) completes in under 5 minutes for the demo app |
| NFR-2 | All policy decisions (allow/block) are logged with a reason, for auditability |
| NFR-3 | System must be reproducible from a clean clone — setup documented in README |
| NFR-4 | No secrets (keys, tokens) committed to the repo; signing is keyless via OIDC |

---

## 7. System Architecture

```
 Developer push
      │
      ▼
 GitHub Actions ──▶ Docker Build ──▶ Syft (SBOM) ──▶ Grype (scan the SBOM)
 (image built locally,                                       │
  nothing pushed yet)                               pass?    │ fail (CRITICAL) → build stopped,
                                                       │       image never reaches the registry
                                                       ▼
                                            Push image to registry (GHCR)
                                                       │
                                                       ▼
                                            cosign sign by digest (keyless, OIDC)
                                                       │
                                                       ▼
                              ┌─────────────────────────────────────────────┐
                              │        Kubernetes cluster (kind)            │
                              │  Kyverno ImageValidatingPolicy:             │
                              │   - verify keyless signature (identity +    │
                              │     issuer pinned to the pipeline workflow) │
                              │   - block if unsigned / high CVEs           │
                              └─────────────────────────────────────────────┘
                                                       │
                                                       ▼
                                    Postgres (builds, SBOM, CVEs, signatures)
                                                       │
                                                       ▼
                                    Dashboard (Node.js + PostgreSQL)
```

**Ordering note:** the scan gate runs *before* push, so an image with a CRITICAL finding never reaches the registry. Signing happens *after* push because cosign attaches its signature to an image digest that already exists in the registry.

---

## 8. Data Model (PostgreSQL)

```sql
builds
  id, commit_sha, image_tag, image_digest, status, created_at

sbom_components        -- one row per package/library found in a build
  id, build_id (FK), name, version, package_type, license

vulnerabilities
  id, build_id (FK), component_id (FK), cve_id, severity, fixed_version

signatures
  id, build_id (FK), signer_identity, rekor_log_index, signed_at, verified boolean
```

Postgres is used (over a document store) because the data is inherently relational — builds have many components, components have many CVEs — and the dashboard's core queries (vulnerability trend per build, components shared across builds) are natural joins/aggregations.

The implemented schema uses normalized child tables with foreign keys and
cascade cleanup. The loader owns writes, while the dashboard uses a
read-only database role. Raw SBOM and scan artifacts remain in the workflow
artifact store; the loader verifies them and persists the normalized records.

---

## 9. Tech Stack

| Layer | Tool |
|---|---|
| CI/CD | GitHub Actions |
| Containerization | Docker |
| SBOM generation | Syft |
| Vulnerability scanning | Grype (scans the Syft SBOM; Trivy considered, deferred) |
| Signing | cosign (Sigstore, keyless) |
| Policy enforcement | Kyverno ≥ 1.19.1 (`ImageValidatingPolicy`) on a single-node kind cluster |
| Database | PostgreSQL |
| Backend API | Node.js standard-library HTTP server |
| Frontend | Server-rendered HTML with browser navigation |

---

## 10. Milestones & Timeline

| Week | Focus | Mentor touchpoint | Status |
|---|---|---|---|
| 1 | Research SLSA, Syft, Trivy/Grype, cosign; pick demo app | Pitch problem & scope | ✅ Done |
| 2 | Design pipeline architecture; base GitHub Actions build+push workflow | — | ✅ Done (push/verify pending) |
| 3 | Add Syft SBOM step; add Grype scan of the SBOM with a CRITICAL-only gate; split build and push so the scan runs before push | Walk through SBOM + scan output; discuss what "pass" should mean | ✅ Done |
| 4 | Add cosign keyless signing after push (by digest); verify manually with `cosign verify` and record the certificate identity + issuer | — | ✅ Done |
| 5 | Stand up a single-node kind cluster; make the GHCR package public; install Kyverno (≥ 1.19.1) via Helm | — | ✅ Done |
| 6 | Write an `ImageValidatingPolicy` (keyless identity pinned to the pipeline workflow); test signed vs. unsigned images | — | ✅ Done |
| 7 | Extend enforcement to block on CVE severity (scan results must reach the cluster as an image attestation — design in Week 7) | Live demo: push → build → block bad image | ✅ Implemented (live evidence pending) |
| 8 | Build Postgres schema + dashboard backend/frontend | — | ✅ Implemented |
| 9 | Write and run test cases; document results | — | ✅ Documented (remote execution pending) |
| 10 | *(Stretch)* Add SLSA provenance attestation | Discuss SLSA level achieved | Not started |
| 11 | Architecture diagram, threat model, README | — | ✅ README updated; threat model/diagram pending |
| 12 | Build presentation deck; record backup demo video | — | Not started |
| 13 | Final rehearsal, polish, submit | Final review | Not started |

### 10.1 Progress to Date

**Week 1 — complete**
- Researched SLSA levels, Syft, Trivy/Grype, and cosign/Sigstore keyless signing.
- Confirmed demo app: a minimal Node.js HTTP service, keeping the app itself a non-issue for the project.
- Collected curated learning resources — video explainers and official quickstart docs for each unfamiliar tool (§14.2).
- Prepared mentor talking points per tool: the problem it solves, where it sits in the pipeline, how the problem was identified, and a supporting academic citation (§14.3).

**Week 2 — complete (push/verify pending on your end)**
- Wrote the architecture note: full six-stage pipeline diagram with only *Build* and *Push* marked in-scope for this week, and explicit reasoning for deferring SBOM/scan/sign/policy to later weeks.
- Locked in three decisions: GHCR over Docker Hub (uses the workflow's built-in `GITHUB_TOKEN`, no extra secret to manage), commit-SHA image tagging instead of `:latest` (anticipating the Week 6 Kyverno policy), and a single-stage Dockerfile with hardening deferred to Week 9.
- Implemented and delivered: `Dockerfile`, `app.py`, `requirements.txt` for the demo app, and `.github/workflows/build.yml` — a bare-bones workflow that builds the image and pushes it to GHCR tagged with the commit SHA.
- Outstanding: push to the actual repo, confirm the Action run goes green, confirm the image lands in the repo's Packages tab.

**Weeks 3–6 — complete**
- *Week 3:* Grype scans the Syft-generated SBOM (not the image a second time); gate is CRITICAL-only; the single build-and-push step is split so SBOM + scan sit between build and push; SBOM uploaded as a workflow artifact (database storage deferred to Week 8).
- *Week 4:* `id-token: write` permission, cosign installed via the official installer action, signing runs after push using the digest the push step outputs; manual `cosign verify` from a local machine with the exact certificate identity and issuer — those two values are carried into the Week 6 policy.
- *Week 5:* single-node kind cluster, GHCR package made public (avoids pull secrets), Kyverno installed via Helm with default (non-HA) settings, version confirmed ≥ 1.19.1.
- *Week 6:* added `policies/image-signature-validation.yaml` using the stable `policies.kyverno.io/v1` `ImageValidatingPolicy`; it matches pod CREATE/UPDATE requests only for `ghcr.io/karansrepo/supplychainguard-demo*`, pins the GitHub Actions workflow subject and Sigstore issuer, and denies images that fail keyless signature verification. Applied to Kyverno v1.19.1 and confirmed ready.

**Weeks 7–9 — implementation complete**
- *Week 7:* the workflow publishes a signed Grype attestation for the pushed
  image digest, and the Kyverno `ImageValidatingPolicy` verifies both the
  keyless signature and the attestation before denying images with exact
  `High` or `Critical` findings.
- *Week 8:* added the PostgreSQL schema, role separation, Docker Compose
  bootstrap, a loader that verifies the image/signature/attestation and SBOM
  before replacing a build's child rows transactionally, and a read-only
  dashboard for build trends, components, and vulnerabilities.
- *Week 9:* added the frozen test matrix and evidence requirements in
  `TESTING.md`. Remote GitHub Actions, GHCR, kind, and PostgreSQL execution
  were unavailable in this environment, so those cases are recorded as
  `Not run` or `Gap`, not as passing evidence.

**Weeks 10–13 — remaining project work**
- *Week 10:* optional SLSA provenance attestation.
- *Week 11:* architecture diagram and written threat model.
- *Week 12:* presentation deck, demo script, and backup recording.
- *Week 13:* final rehearsal, evidence capture, and submission polish.

### 10.2 Changes From the Original Plan

| Area | Original wording | Now | Why |
|---|---|---|---|
| Scanner | "Trivy/Grype" | Grype only, scanning the Syft SBOM | Same vendor as Syft and takes its SBOM natively — one chain, not two scanners. Trivy remains a possible later swap. |
| Build and push | One combined step | Build locally → SBOM → scan → push | The scan gate needs a seam before push; failing images never reach the registry. |
| Signing order | Diagram showed sign before push | Push, then sign by digest | cosign attaches the signature to a digest that already exists in the registry. |
| Severity threshold | "Configurable" | One fixed CRITICAL-only value | YAGNI: a configurable threshold is Week 7 work, if it is needed at all. |
| Kyverno policy type | `imageVerify` ClusterPolicy | `ImageValidatingPolicy` | ClusterPolicy is deprecated in current Kyverno; `ImageValidatingPolicy` is the supported type for signature and attestation verification. |
| Kyverno version | Unspecified | ≥ 1.19.1 | Versions 1.14.0–1.19.0 have a published advisory where a PolicyException on an `ImageValidatingPolicy` skips signature verification (§14.1). |
| GHCR package | Default visibility | Public | Avoids image pull secrets for the cluster and registry credentials for Kyverno; the demo image holds nothing secret. |
| FR-6 (block on CVEs) | "Policy rejects critical/high CVEs" | Needs scan results attached to the image as a signed attestation | The cluster cannot see CI scan output unless the pipeline publishes it. Deliberately not built before Week 7. |

---

## 11. Success Metrics / Acceptance Criteria

- A pushed commit results in an automatically built, scanned, signed image with zero manual steps.
- An unsigned image is demonstrably rejected by the cluster (live or recorded demo); this remains pending live cluster evidence.
- An image with a critical CVE is demonstrably rejected; this remains pending live pipeline and cluster evidence.
- Dashboard correctly displays SBOM and vulnerability data for at least 5 sample builds; the implementation is ready, but sample-build evidence remains pending.
- Written threat model clearly states what attack scenarios this pipeline mitigates (tampered images, typosquatted base images, unscanned CVEs reaching production).

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Sigstore/OIDC signing setup proves fiddly in GitHub Actions | Budget Week 4 fully for this; fall back to a local key pair with cosign if keyless blocks progress |
| Kyverno policy syntax has a learning curve | Start from Kyverno's official `ImageValidatingPolicy` keyless example and change only the image glob and identity values, rather than writing from scratch |
| Kyverno policy types and versions are changing quickly (ClusterPolicy deprecated; an `ImageValidatingPolicy` advisory fixed in 1.19.1) | Read the docs for the installed version, keep Kyverno ≥ 1.19.1, and avoid PolicyExceptions on the image policy |
| Time overrun on dashboard (lowest-priority requirement) | Dashboard is marked "Should," not "Must" — a working pipeline + CLI verification is an acceptable fallback demo |
| Live demo fails during presentation | Record a backup demo video in Week 12 |

---

## 13. Deliverables

1. GitHub repository: pipeline (GitHub Actions), Kyverno policies, loader, and dashboard source
2. PostgreSQL schema, role bootstrap, and seed/demo data
3. Architecture diagram + written threat model
4. Demo video (backup) + live demo script
5. Final presentation deck

The repository currently contains deliverables 1 and 2, the updated README,
and the Week 9 test matrix. Deliverables 3–5 remain planned project work.

---

## 14. Appendix: References

### 14.1 Tool Documentation

- SLSA Framework — slsa.dev
- Syft (SBOM) — github.com/anchore/syft
- Trivy — github.com/aquasecurity/trivy · Grype — github.com/anchore/grype
- cosign / Sigstore — sigstore.dev
- Kyverno — kyverno.io
- Kyverno `ImageValidatingPolicy` — kyverno.io/docs/policy-types/image-validating-policy/
- Kyverno policy types overview (ClusterPolicy deprecation) — kyverno.io/docs/policy-types/overview/
- Kyverno quick start (Helm install) — kyverno.io/docs/introduction/quick-start/
- Kyverno advisory, `ImageValidatingPolicy` exception bypass before 1.19.1 — vulncheck.com/advisories/kyverno-before-1.19.1-imagevalidatingpolicy-exception-bypass
- anchore/sbom-action (Syft) — github.com/anchore/sbom-action · anchore/scan-action (Grype) — github.com/anchore/scan-action
- sigstore/cosign-installer — github.com/sigstore/cosign-installer

### 14.2 Learning Resources (gathered Week 1)

**Video explainers**

| Title | Source | Covers |
|---|---|---|
| SLSA: Industry-Driven Guidelines for Software Supply Chain Security — OpenSSF Project Spotlight | youtube.com/watch?v=gdYlSuH5Srs | What SLSA is and why it exists |
| Easy SBOM & Vuln Scanning with Syft & Grype — Getting Started Tutorial | youtube.com/watch?v=aLG_B7TH_kc | Syft and Grype together, one walkthrough |
| Security Scans for Docker Images using Trivy! | youtube.com/watch?v=nXTNEpLT3N4 | Running Trivy, filtering results by severity |
| WTF is Sigstore? — Chainguard Academy | edu.chainguard.dev/software-security/videos/sigstore | Beginner explainer on Sigstore/cosign (wax-seal analogy) |

**Official quickstart docs**

| Title | Source | Covers |
|---|---|---|
| Introduction to SLSA | edu.chainguard.dev/compliance/slsa/what-is-slsa | Written intro with real attack examples (SolarWinds, Codecov) motivating each level |
| Getting Started with Syft (SBOM Generation) | oss.anchore.com/docs/guides/sbom/getting-started | Generate a first SBOM from a container image |
| Trivy - First Steps | trivy.dev/docs/latest/getting-started | Scan a first container image with Trivy |
| Sigstore Quickstart with Cosign | docs.sigstore.dev/quickstart/quickstart-cosign | Install cosign, sign/verify a first artifact |

### 14.3 Academic Citations (mentor talking points)

For each tool: the problem it solves, where it sits in the pipeline, and the paper that backs the claim.

| Tool | Citation | What it establishes |
|---|---|---|
| SLSA / overall pipeline | Torres-Arias, Afzali, Kuppusamy, Curtmola & Cappos, *in-toto: Providing farm-to-table guarantees for bits and bytes*, USENIX Security 2019 | The attestation framework SLSA's build-provenance model is conceptually built on |
| SLSA / overall pipeline | Abu Ishgair, Melara & Torres-Arias, *SoK: A Defense-Oriented Evaluation of Software Supply Chain Security*, arXiv:2405.14993 (2024) | Taxonomizes supply-chain attacks and maps them to defense techniques — the overview framing for how the four tools fit together |
| Syft (SBOM) | Xia et al., *An Empirical Study on Software Bill of Materials: Where We Stand and the Road Ahead*, arXiv:2301.05362 (2023) | Empirical survey of real-world SBOM adoption and tooling gaps |
| Grype (scan) | Shu, Gu & Xu, *A Study of Security Vulnerabilities on Docker Hub*, ACM CODASPY 2017 | Large-scale evidence that public container images widely ship known, unpatched vulnerabilities |
| cosign (sign) | Newman, Meyers & Torres-Arias, *Sigstore: Software Signing for Everybody*, ACM CCS 2022 | Describes Sigstore's keyless-signing protocol and formal threat model |
| Kyverno (enforce) | No dedicated academic paper found — cite Kyverno's `ImageValidatingPolicy` documentation and the official Kubernetes admission-controller documentation instead | Enforcement via admission control is established industry/CNCF practice rather than an academic research area; don't force a citation that doesn't genuinely exist |