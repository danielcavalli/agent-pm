# Changelog

## 0.0.7-alpha (2026-03-14)

- Add /pm-review-plan: generic 5-agent research-grounded document review pipeline with integrity checking
- Add /pm-iterate-plan: 4-agent iterative planning loop with convergence voting
- Add ADR-023: Autonomous Swarm Self-Improvement (proposed)
- Add default evaluation tactics template (docs/templates/swarm-default-tactics.yaml)
- Relocate ADR/doc files from doc/ to docs/

## 0.0.6-alpha (2026-03-12)

- Add v0.1.0-alpha design documents (research summary, ADR-021, PRD-alpha)
- Add ADR-022: Dropping the pm-reminder compaction plugin

## 0.0.5-alpha (2026-03-11)

- Fix install.sh: ensure local node_modules present before global install, improve npm uninstall handling
- Add prepare script for cleaner npm lifecycle

## 0.0.4-alpha (2026-03-11)

- Fix install.sh: pass --force to npm install -g to handle EEXIST on reinstall (94eaea4)

## 0.0.3-alpha

- Initial release
