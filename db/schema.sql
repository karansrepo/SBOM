CREATE TABLE builds (
  id BIGSERIAL PRIMARY KEY,
  commit_sha TEXT NOT NULL,
  image_tag TEXT NOT NULL,
  image_digest TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status = 'published'),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE sbom_components (
  id BIGSERIAL PRIMARY KEY,
  build_id BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  package_type TEXT NOT NULL,
  license TEXT
);

CREATE TABLE vulnerabilities (
  id BIGSERIAL PRIMARY KEY,
  build_id BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  component_id BIGINT REFERENCES sbom_components(id) ON DELETE SET NULL,
  cve_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  fixed_version TEXT
);

CREATE TABLE signatures (
  id BIGSERIAL PRIMARY KEY,
  build_id BIGINT NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  signer_identity TEXT,
  rekor_log_index BIGINT,
  signed_at TIMESTAMPTZ,
  verified BOOLEAN NOT NULL
);

ALTER TABLE builds OWNER TO loader;
ALTER TABLE sbom_components OWNER TO loader;
ALTER TABLE vulnerabilities OWNER TO loader;
ALTER TABLE signatures OWNER TO loader;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loader;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dashboard;
