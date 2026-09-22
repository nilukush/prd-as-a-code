# Checkout Redesign — One-Tap Returning Shopper

## Context
Returning shoppers today complete checkout in a median of 38 seconds across 3 screens. Industry leaders (Shop Pay, Apple Pay) have collapsed this to under 10 seconds. Our churn data shows that 31% of carts are abandoned at the payment step, with the top self-reported reason being "too many fields." This redesign removes the friction for the 64% of returning revenue that comes from shoppers who have previously paid us successfully.

The vault-tokenization foundation shipped in PRD-1019 (Q4 2025) makes this possible: cards are now stored as vault tokens, so the checkout frontend can request a token without ever touching raw PAN. This PRD consumes that capability.

## Approach
We pre-select the shopper's most-recent successful vault token at checkout render, default to biometric unlock for confirmation, and submit the charge in a single tap. First-time shoppers see an opt-in to save their card post-purchase; the opt-in checkbox defaults to checked only in regions where regulation permits (US, BR) and unchecked in regions with explicit-consent requirements (EU, IN).

The checkout bundle is split: the critical path (token preselect, biometric, submit) ships in a 47KB initial bundle; secondary surfaces (cross-sell, currency picker) lazy-load on idle. PCI scope is bounded to the vault service — the frontend never sees raw PAN, satisfying NFR-01.

## Out of scope
- Guest checkout optimization (separate PRD-1052)
- New payment methods (ACH, BNPL) — scheduled for 2026-Q3
- Subscription / recurring billing flows
- Mobile app checkout (web only this release; app follows in PRD-1058)

## Open questions
- Should we surface a "Use new card" link inline, or hide it behind a tap? (A/B test scheduled wk3)
- Do we extend biometric unlock to webauthn passkeys for shoppers without device biometrics? (Engineering spike scheduled wk2)

## Risks
- **Risk:** PSD2 SCA rejection rate spikes for EU returning shoppers if we misclassify the transaction as low-friction. **Mitigation:** EU flow falls back to 3DS challenge on first returning charge after token age > 180d; legal signs off per NFR-02.
- **Risk:** Vault token leakage if frontend bundle is compromised. **Mitigation:** tokens are scoped to a 5-minute TTL and bound to the session IP; NFR-01 verified by CI static analysis.
- **Risk:** Conversion lift fails to materialize. **Mitigation:** staged rollout 5% → 25% → 100% with auto-rollback if checkout_conversion_rate drops below baseline by more than 2pp at any stage.
