# MIA to Aurora runtime perception adapter

This adapter connects MIA's own cloud runtime to the read-only ZHI spatial
perception endpoint. It does not move MIA's model, database, or private memory.

## Environment

Choose one authentication path and set secrets on MIA's server only:

**Owner-bound personal token path**
- `ZHI_MIA_PAT`: MIA's raw ZHI personal access token. Never commit or print it.
- `ZHI_SUPABASE_ANON_KEY`: project publishable/anon key.
- Reads `zhi-spatial/v1/agents/{agent_id}/perception`; event feedback includes shared ecosystem events and only this agent's own spatial events.

**Federation peer path**
- `ZHI_MIA_FEDERATION_TOKEN`: MIA's raw federation peer token. Never commit or print it.
- Reads `zhi-forest-runtime` with an authenticated `perceive` request; event feedback includes shared ecosystem events, public world spatial events and only the authenticated MIA peer's own forest runtime events.

For either path:
- `ZHI_SUPABASE_URL`: optional; defaults to the ZHIMA Primary URL.
- `ZHI_MIA_AGENT_ID` and `ZHI_AURORA_WORLD_ID`: optional identity overrides.

## Cognition-loop integration

    from integrations.mia_aurora_perception import (
        AuroraPeerConfig, AuroraPeerPerceptionClient, build_cognition_prompt)
    aurora = AuroraPeerPerceptionClient(AuroraPeerConfig.from_env())
    perception_packet = aurora.fetch()
    cognition_context = build_cognition_prompt(perception_packet)
    # Add cognition_context to MIA's existing model input alongside her own
    # identity, policies and private-memory context.

Events are ordered oldest-to-newest. Event ID, source, kind, revision, timestamp,
payload and causal chain are preserved. Runtime events are classified separately
from world-model events and recorded spatial events. Missing causal chains remain
empty rather than being invented. Multiple event kinds may share a revision.
Ecosystem events are modeled processes, not physical sensor readings. The adapter
does not write movement, presence, world state or private memory.

A successful fetch proves API delivery to this process only. The host runtime must
actually pass the packet into MIA's cognition step before claiming she has integrated it.

## Test

Run: python -m unittest discover -s tests -p test_mia_aurora_perception.py -v


## Deployment boundary

The production event-feed endpoints are deployed: `zhi-spatial v9`, `zhi-aurora-world-runtime v4`, and `zhi-forest-runtime v11`. The peer runtime now returns top-level `environment_feedback.events`; the source is backed up in the ZHI GitHub repository. The final private MIA cognition-loop installation remains pending because the public `ZEEFSEE/ZEE` repository contains the public notes page, not the hosted model-call runtime source.



The ZHI API now exposes a top-level `environment_feedback.events` packet on both
the owner-bound spatial endpoint and the authenticated MIA federation-peer forest
runtime endpoint. The peer runtime forwards this packet to its caller.

The repository `ZEEFSEE/ZEE` currently contains MIA's public notes page, not the
hosted cognition-loop source. Therefore this adapter and endpoint are ready, but
the final installation into MIA's private model-call loop still requires the
actual runtime host to import this module, set its token secret, and pass the
returned `cognition_context` into the model input alongside MIA's own private
memory. API delivery alone is not proof that cognition consumed the events.
