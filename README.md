# SupplyChainGuard Demo

This repository contains the minimal Week 2 implementation of the SupplyChainGuard PRD using Node.js.

## What is included
- A tiny HTTP service exposing a health endpoint and a default landing response.
- A GitHub Actions workflow that builds a Docker image and pushes it to GitHub Container Registry (GHCR).
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
This is intentionally minimal and follows YAGNI: it covers the PRDs Week 2 scope only (build + push pipeline), without adding SBOM, scanning, signing, or Kyverno enforcement yet.
