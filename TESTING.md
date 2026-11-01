# Week 9 test log

This log freezes the Week 9 system under test: no pipeline, policy, or
dependency changes are allowed during the test window except deliberate test
commits and their revert commits. Expected results were recorded before
execution. Evidence belongs in `evidence/<test-id>/` and must contain no
tokens or other credentials.

## Test cases

| ID | Scenario | How you trigger it | Expected result | Actual result | Evidence | Verdict |
|---|---|---|---|---|---|---|
| T1 | Happy path | Push a clean commit, wait for the Actions run, then create a pod from its image digest | The run completes without manual steps, the image is signed and attested, and the pod is admitted | Not run in this environment; requires GitHub Actions and kind access | `evidence/T1/` (Actions URL, `kubectl` output) | Not run |
| T2 | Critical CVE | Deliberately pin a dependency with a CRITICAL finding and push the test commit | The scan step fails before push; no new GHCR tag is created | Not run in this environment; requires a deliberate dependency test commit and GHCR access | `evidence/T2/` (Actions URL, scan output, GHCR tag check) | Not run |
| T3 | High only | Deliberately pin a dependency with a High finding and no Critical, then run the resulting image with `kubectl run` | CI passes and pushes the image, but Kyverno denies admission with its severity-check message | Not run in this environment; requires GitHub Actions and kind access | `evidence/T3/` (Actions URL, `kubectl` denial) | Not run |
| T4 | Unsigned | Push an image at the project image path without a signature, then run it in kind | Kyverno denies admission with its missing-signature message | Not run in this environment; requires a short-lived package-writing PAT and kind access | `evidence/T4/` (image reference, `kubectl` denial) | Not run |
| T5 | Dashboard and escaping | Confirm at least five builds; compare two pages with decoded attestations and SBOMs; insert then delete a scratch row whose package name contains markup and quotes | Counts and component totals match the attestation/SBOM, and the scratch package renders as plain text rather than markup | Not run in this environment; requires the Week 8 database/dashboard services and loaded builds | `evidence/T5/` (screenshots, SQL output, decoded attestation/SBOM) | Not run |
| T6 | Wrong signing identity | Sign an image under the project path from a laptop with `cosign sign` using personal browser identity, then run it | Kyverno denies the valid Sigstore signature because its identity is not the workflow identity | Not run in this environment; requires a short-lived package-writing PAT, cosign browser login, and kind access | `evidence/T6/` (signature verification and `kubectl` denial) | Not run |
| T7 | Tag overwritten | Push different content over a throwaway commit-SHA tag and run that tag | Kyverno denies admission because the signature is for the old digest | Not run in this environment; requires GHCR write access and kind access; do not load this build into the dashboard | `evidence/T7/` (digest comparison and `kubectl` denial) | Not run |
| T8 | Missing attestation | Run a signed image from Weeks 4–6 that has no scan attestation | Kyverno denies admission for the missing attestation; if unavailable, record the Week 7 observation | Not run in this environment; the older image and cluster are unavailable | `evidence/T8/` (historical Week 7 evidence or `kubectl` denial) | Not run |
| T9 | Lookalike base image | Change only `FROM` to a harmless Python image from another publisher and run the pipeline | The pipeline passes because the scan detects known CVEs, not whether the intended publisher/base image was used | Not run; do not build this case | `evidence/T9/` (design note only) | Gap |
| T10 | Out-of-scope image | Run an unrelated image such as `nginx` in the cluster | The pod is admitted because the policy is scoped to the project image path | Not run in this environment; requires kind access; do not build this case | `evidence/T10/` (design note or `kubectl` output) | Gap |

## Scan counts

The pre-hardening and post-hardening scan counts must be copied from the
corresponding scan reports, without credentials:

| Measurement | Before non-root hardening | After non-root hardening |
|---|---:|---:|
| Critical | Not captured in this environment | Not captured in this environment |
| High | Not captured in this environment | Not captured in this environment |
| Medium | Not captured in this environment | Not captured in this environment |
| Low | Not captured in this environment | Not captured in this environment |
| SBOM components | Not captured in this environment | Not captured in this environment |

## Cleanup and freeze checklist

- Revert every deliberate T1–T8 test commit with a revert commit; do not
  force-push.
- Revoke the short-lived package-writing PAT.
- Delete test image versions, test pods, and the dashboard scratch row.
- Scrub tokens from evidence and shell history.
- Run one clean pipeline and admit one pod as the final regression check.
- Do not add a pytest harness, CI test automation, performance testing, fuzz
  testing, or fixes for T9/T10.

## Findings

No remote pipeline, kind cluster, dashboard database, or package-writing PAT
was available in this environment, so T1–T8 and the final regression check
remain unexecuted rather than being represented as passes. The Dockerfile
hardening is limited to creating and selecting a non-root `app` user after
production dependencies are installed; it does not change the scan, policy,
or dependency inputs. T9 and T10 remain intentional gaps: a future base-image
allow-list or digest pinning could address lookalike bases, while a broader
policy scope with explicit exclusions could address unrelated images.

The Week 12 demo scenarios are the clean build admitted, HIGH-only image
blocked, and unsigned image blocked.
