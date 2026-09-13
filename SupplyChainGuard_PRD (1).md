# Product Requirements Document: SupplyChainGuard

**Subtitle:** SBOM Generation, Image Signing & Verify-on-Deploy Pipeline for Kubernetes
**Author:** Karan Singh Thakur
**Program:** MCA Minor Project — 3 Credits
**Duration:** 3 months (~5 hrs/week, ~65 hours total)
**Version:** 1.1
**Date:** September 2026
**Last Updated:** September 13, 2026 — Weeks 1–2 complete

---

## 1. Executive Summary

SupplyChainGuard is a CI/CD security pipeline that closes the gap between "code is committed" and "code is safe to run in production." Every image built by the pipeline gets a Software Bill of Materials (SBOM), is scanned for known vulnerabilities, and is cryptographically signed — and a Kubernetes admission policy refuses to deploy anything that skips this process. The project demonstrates practical software supply-chain security: a discipline formalized by frameworks like SLSA and increasingly required in industry (referenced in Gartner's 2026 Magic Quadrant for Software Supply Chain Security).

The project's value as a minor project is that it isn't a demo of a single tool — it's an end-to-end pipeline stitching together five real, industry-standard tools (Syft, Trivy/Grype, cosign, Kyverno, GitHub Actions) into one coherent security control, backed by a queryable data store and a dashboard that shows the evidence.

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
| FR-3 | Pipeline scans the image for CVEs (Trivy or Grype) and fails the build above a configurable severity threshold | Must |
| FR-4 | Pipeline signs passing images using cosign keyless signing (Sigstore/Fulco/Rekor via GitHub OIDC) | Must |
| FR-5 | Kubernetes cluster enforces a Kyverno policy that rejects any pod using an unsigned image | Must |
| FR-6 | Kyverno policy also rejects images with unresolved critical/high CVEs | Should |
| FR-7 | Build, SBOM, vulnerability, and signature data are persisted to a relational database | Must |
| FR-8 | Dashboard displays SBOM contents and vulnerability trend per build | Should |
| FR-9 | Pipeline generates SLSA provenance attestation, verified alongside the signature | Could (stretch) |

### 6.2 Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | Pipeline run (build → SBOM → scan → sign) completes in under 5 minutes for the demo app |
| NFR-2 | All policy decisions (allow/block) are logged with a reason, for auditability |
| NFR-3 | System must be reproducible from a clean clone — setup documented in README |
| NFR-4 | No secrets (keys, tokens) committed to the repo; signing is keyless via OIDC |

---

## 7. System Architecture

```
 Developer push
      │
      ▼
 GitHub Actions ──▶ Docker Build ──▶ Syft (SBOM) ──▶ Trivy/Grype (scan)
                                                            │
                                                   pass?    │ fail → build stopped
                                                     │
                                                     ▼
                                          cosign sign (keyless, OIDC)
                                                     │
                                                     ▼
                                          Push signed image to registry
                                                     │
                                                     ▼
                              ┌──────────────────────────────────────┐
                              │      Kubernetes cluster (kind)         │
                              │  Kyverno ClusterPolicy:                │
                              │   - verify signature (imageVerify)     │
                              │   - block if unsigned / high CVEs      │
                              └──────────────────────────────────────┘
                                                     │
                                                     ▼
                                    Postgres (builds, SBOM, CVEs, signatures)
                                                     │
                                                     ▼
                                    Dashboard (React/Vue + Flask/Node API)
```

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

Postgres is used (over a document store) because the data is inherently relational — builds have many components, components have many CVEs — and the dashboard's core queries (vulnerability trend per build, components shared across builds) are natural joins/aggregations. `JSONB` columns are used where needed to retain raw Syft/Trivy output alongside the normalized rows.

---

## 9. Tech Stack

| Layer | Tool |
|---|---|
| CI/CD | GitHub Actions |
| Containerization | Docker |
| SBOM generation | Syft |
| Vulnerability scanning | Trivy / Grype |
| Signing | cosign (Sigstore, keyless) |
| Policy enforcement | Kyverno (on kind/minikube) |
| Database | PostgreSQL |
| Backend API | Flask or Node.js |
| Frontend | React or Vue.js |

---

## 10. Milestones & Timeline

| Week | Focus | Mentor touchpoint | Status |
|---|---|---|---|
| 1 | Research SLSA, Syft, Trivy/Grype, cosign; pick demo app | Pitch problem & scope | ✅ Done |
| 2 | Design pipeline architecture; base GitHub Actions build+push workflow | — | ✅ Done (push/verify pending) |
| 3 | Add Syft SBOM step; add Trivy/Grype scan gate | Review SBOM/scan output | Not started |
| 4 | Add cosign keyless signing; verify manually end-to-end | — | Not started |
| 5 | Stand up kind/minikube cluster; install Kyverno | — | Not started |
| 6 | Write `imageVerify` ClusterPolicy; test signed vs. unsigned images | — | Not started |
| 7 | Extend policy to block on CVE severity | Live demo: push → build → block bad image | Not started |
| 8 | Build Postgres schema + dashboard backend/frontend | — | Not started |
| 9 | Write and run test cases; document results | — | Not started |
| 10 | *(Stretch)* Add SLSA provenance attestation | Discuss SLSA level achieved | Not started |
| 11 | Architecture diagram, threat model, README | — | Not started |
| 12 | Build presentation deck; record backup demo video | — | Not started |
| 13 | Final rehearsal, polish, submit | Final review | Not started |

### 10.1 Progress to Date

**Week 1 — complete**
- Researched SLSA levels, Syft, Trivy/Grype, and cosign/Sigstore keyless signing.
- Confirmed demo app: a minimal Flask "hello world," chosen to match existing skills and keep the app itself a non-issue for the project.
- Collected curated learning resources — video explainers and official quickstart docs for each unfamiliar tool (§14.2).
- Prepared mentor talking points per tool: the problem it solves, where it sits in the pipeline, how the problem was identified, and a supporting academic citation (§14.3).

**Week 2 — complete (push/verify pending on your end)**
- Wrote the architecture note: full six-stage pipeline diagram with only *Build* and *Push* marked in-scope for this week, and explicit reasoning for deferring SBOM/scan/sign/policy to later weeks.
- Locked in three decisions: GHCR over Docker Hub (uses the workflow's built-in `GITHUB_TOKEN`, no extra secret to manage), commit-SHA image tagging instead of `:latest` (anticipating the Week 6 Kyverno policy), and a single-stage Dockerfile with hardening deferred to Week 9.
- Implemented and delivered: `Dockerfile`, `app.py`, `requirements.txt` for the demo app, and `.github/workflows/build.yml` — a bare-bones workflow that builds the image and pushes it to GHCR tagged with the commit SHA.
- Outstanding: push to the actual repo, confirm the Action run goes green, confirm the image lands in the repo's Packages tab.

**Weeks 3–13 — not started.**

---

## 11. Success Metrics / Acceptance Criteria

- A pushed commit results in an automatically built, scanned, signed image with zero manual steps.
- An unsigned image is demonstrably rejected by the cluster (live or recorded demo).
- An image with a critical CVE is demonstrably rejected.
- Dashboard correctly displays SBOM and vulnerability data for at least 5 sample builds.
- Written threat model clearly states what attack scenarios this pipeline mitigates (tampered images, typosquatted base images, unscanned CVEs reaching production).

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Sigstore/OIDC signing setup proves fiddly in GitHub Actions | Budget Week 4 fully for this; fall back to a local key pair with cosign if keyless blocks progress |
| Kyverno policy syntax has a learning curve | Start from Kyverno's official policy library and adapt rather than writing from scratch |
| Time overrun on dashboard (lowest-priority requirement) | Dashboard is marked "Should," not "Must" — a working pipeline + CLI verification is an acceptable fallback demo |
| Live demo fails during presentation | Record a backup demo video in Week 12 |

---

## 13. Deliverables

1. GitHub repository: pipeline (GitHub Actions), Kyverno policies, dashboard source
2. PostgreSQL schema + seed/demo data
3. Architecture diagram + written threat model
4. Demo video (backup) + live demo script
5. Final presentation deck

---

## 14. Appendix: References

### 14.1 Tool Documentation

- SLSA Framework — slsa.dev
- Syft (SBOM) — github.com/anchore/syft
- Trivy — github.com/aquasecurity/trivy · Grype — github.com/anchore/grype
- cosign / Sigstore — sigstore.dev
- Kyverno — kyverno.io

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
| Trivy / Grype (scan) | Shu, Gu & Xu, *A Study of Security Vulnerabilities on Docker Hub*, ACM CODASPY 2017 | Large-scale evidence that public container images widely ship known, unpatched vulnerabilities |
| cosign (sign) | Newman, Meyers & Torres-Arias, *Sigstore: Software Signing for Everybody*, ACM CCS 2022 | Describes Sigstore's keyless-signing protocol and formal threat model |
| Kyverno (enforce) | No dedicated academic paper found — cite the official Kubernetes admission-controller documentation instead | Enforcement via admission control is established industry/CNCF practice rather than an academic research area; don't force a citation that doesn't genuinely exist |
