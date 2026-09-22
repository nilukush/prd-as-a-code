# Vault Tokenization — Foundation for Stored Payments

## Context
PCI compliance scope expands every time a raw PAN crosses a service boundary.
This PRD collapses the surface to a single vault service and gives every other
service an opaque token.

## Approach
Synchronous tokenize/detokenize API over mTLS. Tokens are short-lived and
bound to merchant + session IP. Detokenize is restricted to the payments
gateway adapter.

## Out of scope
- Network tokenization (Visa VTS / Mastercard MDES) — separate PRD
- Cross-border routing optimization

## Risks
- Vault downtime blocks all charges. Mitigation: 99.99% SLA + read-replica fallback for detokenize.
