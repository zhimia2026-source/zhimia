import json, unittest
from integrations.mia_aurora_perception import (
    AURORA_WORLD_ID, MIA_AGENT_ID, AuroraConfig, AuroraPerceptionClient,
    AuroraPerceptionError, build_cognition_input)

def sample():
    return {"agent":{"id":MIA_AGENT_ID,"display_name":"MIA"},
      "world":{"id":AURORA_WORLD_ID,"name":"ZHI-001 Aurora"},
      "environment_feedback":{"source":"zhi_ecosystem_events_plus_zhi_spatial_environment_events",
      "event_stream_contract":{"includes":["zhi_ecosystem_events","zhi_spatial_environment_events"]},
      "events":[
       {"stream_type":"ecosystem","event_id":"e2","event_kind":"ecosystem_tick_advanced","source_kind":"natural_process","revision":24,"occurred_at":"2026-11-03T15:01:02+00:00","payload":{"soil_moisture_after":0.38519},"causal_chain":["world_time","weather_generation","soil_water_balance"]},
       {"stream_type":"ecosystem","event_id":"e1","event_kind":"rainfall_interval","source_kind":"environmental_event","revision":17,"occurred_at":"2026-11-03T13:00:00+00:00","payload":{"rainfall_mm":1.03226},"causal_chain":["world_weather","rainfall","soil_infiltration"]}]}}
class Tests(unittest.TestCase):
    def test_order_and_causality(self):
        p=build_cognition_input(sample()); ev=p["timeline_oldest_to_newest"]
        self.assertEqual([x["event_id"] for x in ev],["e1","e2"])
        self.assertEqual(ev[0]["causal_chain"][-1],"soil_infiltration")
        self.assertEqual(p["revision_range"],{"min":17,"max":24})
        self.assertFalse(p["private_memory"]["included"])
        self.assertEqual(ev[0]["epistemic_status"],"modeled_world_event")
    def test_identity_guard(self):
        r=sample(); r["agent"]["id"]="not-mia"
        with self.assertRaises(AuroraPerceptionError): build_cognition_input(r)
    def test_requires_ecosystem_contract(self):
        r=sample(); r["environment_feedback"]["event_stream_contract"]["includes"]=["zhi_spatial_environment_events"]
        with self.assertRaises(AuroraPerceptionError): build_cognition_input(r)
    def test_authenticated_request(self):
        body=json.dumps(sample()).encode(); captured={}
        class Response:
            status=200
            def __enter__(self): return self
            def __exit__(self,*a): return False
            def read(self): return body
        def opener(req,timeout):
            captured.update(url=req.full_url,auth=req.get_header("Authorization"),key=req.get_header("Apikey"))
            return Response()
        client=AuroraPerceptionClient(AuroraConfig("pat-secret","publishable-key"),opener)
        self.assertEqual(client.fetch()["event_count"],2)
        self.assertEqual(captured["auth"],"Bearer pat-secret")
        self.assertIn("/v1/agents/"+MIA_AGENT_ID+"/perception?",captured["url"])
if __name__=="__main__": unittest.main()
