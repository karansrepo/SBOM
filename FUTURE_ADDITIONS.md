# Future additions

The current project intentionally implements only the workflow needed to
demonstrate build, scan, sign, attest, verify, store, and review. Additions
should be driven by a concrete use case rather than added speculatively. The
following ideas preserve that YAGNI approach.

## Good next additions

### Make configuration fork-friendly

Move repository owner, image name, workflow identity, and attestation type into
a small documented configuration surface. This would make forks and
organization deployments easier without changing the security model.

### Add a small CI regression suite

Validate the workflow and Kyverno policy structure in pull requests, including
checks that the expected digest-based verification and severity gates remain
present. This protects the demonstration from accidental security regressions.

### Improve dashboard filtering

Add narrowly scoped filters for commit, severity, component, and verification
status once users need to compare more than a few builds. Keep the dashboard
read-only and local until there is a clear requirement for broader access.

### Document retention and cleanup

Add an explicit cleanup command or documented retention procedure for old
database rows, local images, and GHCR artifacts if repeated demonstrations
create operational clutter.

## Additions to defer until justified

- Authentication, authorization, and multi-user support for the dashboard.
- A hosted API or frontend separate from the local dashboard.
- Background workers, queues, or scheduled rescans.
- Support for multiple registries, clusters, or policy engines.
- Automatic vulnerability remediation or dependency upgrade pull requests.
- High availability, horizontal scaling, and production database operations.
- Additional policy types unrelated to the signed-image workflow.

These features may be valuable in a production product, but they add
infrastructure and maintenance before the repository has a demonstrated need
for them. Revisit them when a concrete user, scale, or reliability requirement
cannot be met by the current local workflow.
