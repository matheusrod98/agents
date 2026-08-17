---
name: go-standards
description: Go conventions gofumpt and golangci-lint don't enforce — chiefly named types over bare primitives. Use when writing or reviewing Go and deciding between a bare string / map[string]T / map[string]any and a named type for a domain concept.
---

# Go Standards

Naming and typing conventions the formatter and linter can't check.

## Named types over bare primitives

A bare `string`, `map[string]T`, or `map[string]any` hides what it means: the key isn't "a string", it's a column name; the value isn't "any", it's a database row. Name the concept.

When a primitive stands for a domain concept, introduce a named type.

- **Defined type** — when the compiler should reject mixing with other strings: `type ColumnName string`.
- **Alias** — when you only want the name and the value must stay a plain `string`/`any`: `type Literal = any`.

```go
// before
func apply(cols map[string]ColumnInfo, row map[string]any, names []string)

// after
type ColumnName string
type Schema map[ColumnName]ColumnInfo
type Record map[ColumnName]any

func apply(schema Schema, record Record, names []ColumnName)
```

Apply it to struct fields, map keys and values, slice elements, parameters, and receivers. A type whose name collides with a database concept gets a distinguishing suffix (`Table` → `TableSpec`).

Name only domain concepts. Generic plumbing — `map[string]string` of env vars, `[]string` of CLI args, a `map[string]any` that genuinely is "anything" — stays bare.
