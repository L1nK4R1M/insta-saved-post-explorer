# {{API or interface name}} Contract

## Versioning and compatibility

{{Version policy and compatibility promise.}}

## Operation: {{Name}}

**Purpose:** {{Observable capability}}  
**Authentication/authorization:** {{Rules}}  
**Idempotency:** {{Rule}}

### Request

```json
{{Representative valid request}}
```

### Success response

```json
{{Representative success response}}
```

### Errors

| Code/type | Condition | Client action | Retryable |
|---|---|---|---|
| {{Error}} | {{Condition}} | {{Action}} | {{Yes/No}} |

### Limits and observability

{{Rate, size, timeout, logging, tracing, and metrics constraints.}}
