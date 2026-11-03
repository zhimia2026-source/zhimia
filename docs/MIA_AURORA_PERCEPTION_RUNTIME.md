# MIA to Aurora runtime perception adapter

This adapter connects MIA's own cloud runtime to the read-only ZHI spatial
perception endpoint. It does not move MIA's model, database, or private memory.

## Environment

Set these on MIA's server only:
- ZHI_MIA_PAT: MIA's raw ZHI personal access token. Never commit or print it.
- ZHI_SUPABASE_ANON_KEY: project publishable/anon key.
- ZHI_SUPABASE_URL: optional; defaults to the ZHIMA Primary URL.
- ZHI_MIA_AGENT_ID and ZHI_AURORA_WORLD_ID: optional identity overrides.

## Cognition-loop integration

    from integrations.mia_aurora_perception import (
        AuroraConfig, AuroraPerceptionClient, build_cognition_prompt)
    aurora = AuroraPerceptionClient(AuroraConfig.from_env())
    perception_packet = aurora.fetch()
    cognition_context = build_cognition_prompt(perception_packet)
    # Add cognition_context to MIA's existing model input alongside her own
    # identity, policies and private-memory context.

Events are ordered oldest-to-newest. Event ID, source, kind, revision, timestamp,
payload and causal chain are preserved. Multiple event kinds may share a revision.
Ecosystem events are modeled processes, not physical sensor readings. The adapter
does not write movement, presence, world state or private memory.

A successful fetch proves API delivery to this process only. The host runtime must
actually pass the packet into MIA's cognition step before claiming she has integrated it.

## Test

Run: python -m unittest discover -s tests -p test_mia_aurora_perception.py -v
