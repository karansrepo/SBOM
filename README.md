# SupplyChainGuard Demo

This repository contains the Week 3 SupplyChainGuard implementation using a minimal Node.js HTTP service built on the standard library.

## What is included
- A tiny HTTP service exposing a health endpoint and a default landing response.
- A GitHub Actions workflow that builds the image locally, generates and uploads an SPDX SBOM, scans it for critical vulnerabilities, and pushes to GHCR only if the scan passes.
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

## Notes
This is intentionally minimal and follows YAGNI: it covers the Week 3 build, SBOM, critical-severity scan gate, and push pipeline. Image signing and Kyverno enforcement remain out of scope for this milestone.
