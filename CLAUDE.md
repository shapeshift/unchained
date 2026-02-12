# Project Guidelines

## Build & Lint
- Do NOT run `go build`, `go vet`, or lint commands to verify changes. The Go modules are split across many separate go.mod files and some have known upstream dependency issues (e.g., mayachain). CI handles build validation.
- Do NOT run tests unless explicitly asked.
