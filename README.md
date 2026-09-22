# PRD-as-Code (`prdc`)

Treat product specs like software: plain-text source, schema-validated, lintable,
version-controlled, compiled to many downstream targets.

Code ships with version control, CI, linting, and traceability. Product specs ship
with Google Docs. PRD-as-Code closes that gap: a PRD becomes a first-class engineering
artifact that lives in your repository, is reviewed through pull requests, and is
compiled deterministically to every format your stakeholders need.

## Install

```bash
npm install -g prd-as-code
prdc --help
```

Or run it once without installing: `npx -p prd-as-code prdc --help`

Or work from source:

```bash
git clone https://github.com/nilukush/prd-as-a-code
cd prd-as-a-code
npm install
node prdc.js --help
```

## Commands

```bash
prdc init [name]                  # scaffold a new PRD project
prdc new <name>                   # create a PRD from the feature template
prdc validate <dir>               # schema validation (errors block ship)
prdc lint <dir>                   # prose quality (ambiguous words, passive voice)
prdc build <html|markdown|gherkin> <dir>  # compile to a downstream artifact
prdc snapshot <dir>               # freeze requirements.yaml as versions/vN.yaml
prdc diff <dir> --baseline 1 --target 2   # semantic diff between versions
prdc graph <root>                 # dependency graph across all PRDs
```

## Try it on the sample PRD

```bash
node prdc.js validate sample/checkout-redesign   # passes with 2 warnings
node prdc.js lint sample/checkout-redesign       # passes clean
node prdc.js build html sample/checkout-redesign --out ./out/checkout.html
node prdc.js build gherkin sample/checkout-redesign --out ./out/checkout.feature
node prdc.js diff sample/checkout-redesign --baseline 1 --target 2
node prdc.js graph sample/
```

## Anatomy of a PRD

A PRD is a directory, not a document. Each file plays a typed role and is
independently machine-parseable.

```
sample/checkout-redesign/
  meta.yaml            # id, owner, status, stakeholders, depends_on, reviewers
  requirements.yaml    # FR-xx / NFR-xx with stable IDs + acceptance criteria
  metrics.yaml         # baseline + target + measurement window
  spec.md              # narrative: context, approach, out-of-scope, risks
  versions/            # snapshots for semantic diff (v1.yaml, v2.yaml, ...; use prdc snapshot)
```

Every requirement gets a stable ID (`FR-01`, `NFR-02`). Downstream systems
(Jira tickets, Gherkin features, dashboards) reference that ID forever. When
the PRD changes, the ID stays; only the spec around it shifts. That is what
makes traceability survive across releases.

Example requirement:

```yaml
- id: FR-01
  as_a: returning shopper
  i_want: my saved card pre-selected at checkout
  so_that: I can complete purchase in a single tap
  priority: P0
  acceptance_criteria:
    - returning shopper sees saved card within 200ms of render
    - 1-tap purchase after biometric unlock
    - token persists for 365 days from last charge
  rollback_plan: feature-flag checkout.preselect_v2 rolls back in 60s
  traces_to: [JIRA-8821, GHERKIN-12]
```

## Schema rules enforced by `prdc validate`

The structural rules ship as JSON Schema draft 2020-12 files in [`schema/`](schema/)
(`meta.schema.json`, `requirements.schema.json`, `metrics.schema.json`), so editors
and other tools can validate PRD files with the same contract the CLI enforces.
Warning-level and cross-file rules (duplicate ids, `depends_on` resolution, prose
quality) stay in the CLI.

| Rule | Severity |
|---|---|
| `meta.id`, `meta.title`, `meta.owner`, `meta.status` all required | error |
| `meta.status` must be `draft\|review\|approved\|shipped\|archived` | error |
| `status: approved` requires `reviewers` and `approved_by` | error |
| Every requirement must have a stable `id` and at least 1 acceptance criterion | error |
| Requirement `id` should start with `FR-` \| `NFR-` \| `EPI-` | warning |
| `priority: P0` should declare a `rollback_plan` | warning |
| `depends_on` should resolve to a sibling PRD's `id` | warning |
| `spec.md` should be at least 200 chars | warning |

Exit codes are CI-friendly: errors exit 1, warnings alone exit 0.

## Linter (`prdc lint`)

Flags ambiguous words ("fast", "simple", "seamless", "robust", "scalable"),
passive voice in acceptance criteria, and other prose quality issues that
make PRDs hard to verify. Established technical terms (the Lighthouse
"3G fast" network profile) are exempt, since that "fast" is a name, not
vagueness.

## Roadmap

- `prdc build pdf` - PDF export
- `prdc build slides` - PPTX via PptxGenJS
- `prdc build jira` - epics + stories from `requirements.yaml`
- `prdc link <PRD-id> --to <JIRA-id>` - bidirectional traceability
- `prdc release <PRD-id>` - locks version + emits changelog
- AI critique mode (`prdc critique`) - schema-grounded review pass

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT license, see [LICENSE](LICENSE).
