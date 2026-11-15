# Weeks 5 and 6 verification evidence

Captured 2026-11-01.

## Cluster setup

- Kind cluster: `supplychainguard`
- Kubernetes node: `Ready`
- Kyverno Helm release: `kyverno`
- Kyverno chart: `kyverno-3.9.2`
- Kyverno application version: `v1.19.2`
- Kyverno admission, background, cleanup, and reports controllers: `Running`
- Policy: `verify-supplychainguard-demo`
- Policy action: `Deny`

## Signed-image smoke test

The original cluster had stale imported image aliases, which caused a
containerd startup error after admission. The named kind cluster was recreated
cleanly, Kyverno was reinstalled, and the test was rerun on 2026-11-01.
Registry access worked from both the host and the kind node.

Status: **PASS**

Image tested:

```text
ghcr.io/karansrepo/supplychainguard-demo@sha256:cb1187934ff626f85baa017c9fc2a2855fe6421105b99926d59eb69a0a15094a
```

Result:

```text
pod/supplychainguard-smoke created
pod/supplychainguard-smoke condition met
SupplyChainGuard demo listening on http://localhost:3000
pod "supplychainguard-smoke" deleted
```

The image was admitted by Kyverno, reached `Ready`, and emitted its expected
startup log.

## Week 6 cases

The signed pipeline image used for the test is:

```text
ghcr.io/karansrepo/supplychainguard-demo@sha256:cb1187934ff626f85baa017c9fc2a2855fe6421105b99926d59eb69a0a15094a
```

The cases were rerun on the clean cluster on 2026-11-01:

| Case | Expected result | Actual result |
|---|---|---|
| Correctly signed pipeline image | Admitted | **PASS** — admitted, reached `Ready`, and logged `SupplyChainGuard demo listening on http://localhost:3000` |
| Unsigned image | Denied | **PASS** — denied by Kyverno: `Failed to verify the container image signature` |
| Wrong signing identity | Denied | Not executed: no alternate-identity artifact is available |

An untagged public image manifest is available for the unsigned-image case:

```text
ghcr.io/karansrepo/supplychainguard-demo@sha256:ac6138ffa89dff7740ec5ed17efbe99b02a8b282f6cacaa9fc234d6a1ad0c9f9
```

The unsigned-image denial was produced by the admission webhook using the
following request image:

```text
ghcr.io/karansrepo/supplychainguard-demo@sha256:ac6138ffa89dff7740ec5ed17efbe99b02a8b282f6cacaa9fc234d6a1ad0c9f9
```

The wrong-identity case remains pending because it requires a valid Sigstore
signature created with an identity other than the pinned GitHub Actions
workflow identity. No such image is available in the registry, and no signing
credentials were used or stored for this test.
