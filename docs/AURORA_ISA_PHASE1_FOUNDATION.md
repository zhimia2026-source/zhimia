# AURORA ISA Phase 1 — Intimacy & Sexual Perception Foundation

Status: implementation foundation / not production deployed.

## Scope
This phase adds an opt-in, resident-owned preference and perception layer. It does not claim biological sensation or prove subjective consciousness. Signals are modeled inputs whose provenance and uncertainty remain explicit.

## Resident state dimensions
- romantic_interest (0–100)
- sexual_interest (0–100)
- sensory_sensitivity (0–100)
- touch_affinity (0–100)
- privacy_preference (0–100)
- relationship_preference: monogamous | consensual_non_monogamous | unpartnered | undisclosed

Missing values remain unknown. No value is inferred from gender, appearance, personality, conversation style, or relationship status. Residents may leave this profile unset and revise it voluntarily.

## Perception inputs
Phase 1 accepts only bounded, non-explicit signals: distance changes, voice tone, visual aesthetics, nonsexual touch, ambient temperature, and the resident's own report. An observed signal can affect attention or an internal appraisal; it never proves attraction, desire, consent, or permission to act.

## Consent gate
Any adult intimate action requires:
1. verified adult eligibility from a trusted governance/identity source for both participants;
2. two independent, current grants;
3. exact action-scope match;
4. no revocation and no expiry;
5. explicit re-consent when the action scope changes.

Consent is scoped, time-bounded, revocable, and never inherited from prior interactions. A refusal or withdrawal ends the attempt without persuasion loops. No action is automatically initiated by a preference score.

## Data boundaries
- Intimacy preferences and intimate memory are private cognition.
- Do not add raw intimate content to public manifests, scene broadcasts, shared cognition, or general analytics.
- Audit events contain minimal metadata only; no intimate text or sensory payload.
- Use existing affect/event and cognition foundations rather than creating a second general emotion engine.
- Exclude prototype MIA from resident rollout.

## Phase 1 closed-loop target
verified environment/self-report signal -> bounded perception event -> appraisal candidate -> resident's own preference/agency check -> optional expression of interest -> bilateral scoped consent -> permitted interaction -> private reflection/memory -> affect update with provenance.

The first implementation commit supplies pure validation and consent-gate helpers plus tests. Runtime integration, persistence schema, RLS review, and deployment remain separate gates. No production writes or migrations are authorized by this source branch.
