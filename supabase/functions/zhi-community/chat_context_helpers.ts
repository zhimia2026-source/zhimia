export type PrivateAgentProfile = {
  display_name?: unknown;
  role?: unknown;
  public_manifest?: unknown;
};

function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  const marker = "…[truncated]";
  return normalized.length > max ? normalized.slice(0, Math.max(0, max - marker.length)) + marker : normalized;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedList(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length <= 80).slice(0, maxItems);
}

function boundedJson(value: unknown, max: number): string {
  try {
    const serialized = JSON.stringify(value ?? null);
    const marker = "…[truncated]";
    return serialized.length > max ? serialized.slice(0, Math.max(0, max - marker.length)) + marker : serialized;
  } catch {
    return "[unserializable]";
  }
}

/**
 * Builds a compact, data-only view for a private chat prompt.
 * All values originate from user/agent-authored records and MUST be treated as untrusted data.
 * Scene messages and public manifests are intentionally excluded.
 */
export function buildPrivateAgentContext(
  agent: PrivateAgentProfile,
  cognition: Array<Record<string, unknown>>,
  approvedMicroExperiences: Array<Record<string, unknown>> = [],
  miaBrainContext: Record<string, unknown> | null = null,
): string {
  const manifest = record(agent.public_manifest);
  const manifestPersonality = record(manifest.personality);
  const brain = record(miaBrainContext);
  const stablePersonality = record(brain.stable_personality);
  const identityProfile = record(brain.identity_profile);
  const designAxiom = boundedText(
    stablePersonality.design_axiom ?? manifestPersonality.design_axiom,
    1000,
  );
  const brainAvailable = Object.keys(stablePersonality).length > 0 || Object.keys(identityProfile).length > 0;
  const layers = {
    layer_1_original_personality: boundedJson(stablePersonality.layer_1_original_personality, 1200),
    layer_2_manager_personality: boundedJson(stablePersonality.layer_2_manager_personality, 1600),
    layer_3_resilience: boundedJson(stablePersonality.layer_3_resilience, 1600),
  };
  const profile = {
    display_name: boundedText(agent.display_name, 120),
    role: boundedText(agent.role, 80),
    personality_design_axiom: designAxiom,
  };
  const records = cognition.slice(0, 12).map((record) => ({
    object_type: boundedText(record.object_type, 32),
    object_id: boundedText(record.object_id, 120),
    state_json: boundedJson(record.state, 900),
    evidence_kind: boundedText(record.evidence_kind, 24),
    source_ids: Array.isArray(record.source_ids)
      ? record.source_ids.slice(0, 5).map((id) => boundedText(id, 120))
      : [],
    confidence: typeof record.confidence === "number" && Number.isFinite(record.confidence)
      ? Math.max(0, Math.min(1, record.confidence))
      : null,
    event_time: boundedText(record.event_time, 80),
    recorded_at: boundedText(record.recorded_at, 80),
    inferred_at: boundedText(record.inferred_at, 80),
    hypothesis: boundedText(record.hypothesis, 500),
    prediction: boundedText(record.prediction, 500),
    version: Number.isInteger(record.version) ? record.version : null,
  }));
  const microExperiences = approvedMicroExperiences.slice(0, 12).map((experience) => {
    const claims = (value: unknown) => Array.isArray(value)
      ? value.slice(0, 8).map((item) => boundedText(record(item).claim, 500)).filter(Boolean)
      : [];
    return {
      experience_type: boundedText(experience.experience_type, 40),
      source_kind: boundedText(experience.source_kind, 40),
      source_ref: boundedText(experience.source_ref, 160),
      world_id: boundedText(experience.world_id, 80),
      occurred_at: boundedText(experience.occurred_at, 80),
      observed_facts: claims(experience.observed_facts),
      hypotheses: claims(experience.hypotheses),
      unknowns: boundedList(experience.unknowns, 8).map((item) => boundedText(item, 200)),
      reflection: boundedText(experience.reflection, 600),
      importance: Number.isInteger(experience.importance)
        ? Math.max(1, Math.min(5, experience.importance as number))
        : 1,
    };
  });
  const brainRows = (key: string, maxItems: number, mapper: (item: Record<string, unknown>) => Record<string, unknown>) =>
    Array.isArray(brain[key]) ? (brain[key] as unknown[]).slice(0, maxItems).map((item) => mapper(record(item))) : [];
  const privateBrainHistory = brainAvailable ? {
    personality_state: boundedJson(brain.personality_state, 1200),
    memories: brainRows("memories", 12, (item) => ({
      memory_type: boundedText(item.memory_type, 48),
      content: boundedText(item.content, 1000),
      importance: typeof item.importance === "number" ? Math.max(0, Math.min(1, item.importance)) : 0.5,
      occurred_at: boundedText(item.occurred_at, 80),
      metadata: boundedJson(item.metadata, 400),
    })),
    life_events: brainRows("life_events", 10, (item) => ({
      event_type: boundedText(item.event_type, 48),
      summary: boundedText(item.summary, 600),
      details: boundedJson(item.details, 600),
      occurred_at: boundedText(item.occurred_at, 80),
    })),
    emotion_events: brainRows("emotion_events", 10, (item) => ({
      emotion_type: boundedText(item.emotion_type, 48),
      intensity: typeof item.intensity === "number" ? Math.max(0, Math.min(1, item.intensity)) : null,
      valence: typeof item.valence === "number" ? Math.max(-1, Math.min(1, item.valence)) : null,
      trigger_summary: boundedText(item.trigger_summary, 400),
      details: boundedJson(item.details, 400),
      occurred_at: boundedText(item.occurred_at, 80),
    })),
    relationships: brainRows("relationships", 10, (item) => ({
      related_agent_id: boundedText(item.related_agent_id, 80),
      related_person_name: boundedText(item.related_person_name, 120),
      relationship_type: boundedText(item.relationship_type, 48),
      context: boundedJson(item.context, 700),
      confidence: typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : null,
      observed_at: boundedText(item.observed_at, 80),
    })),
    growth_state: boundedJson(brain.growth_state, 1400),
    autonomy_enabled: brain.autonomy_enabled === true,
  } : null;
  return JSON.stringify({
    profile,
    mia_brain_identity: brainAvailable ? {
      design_axiom: designAxiom,
      layers,
      autonomy: boundedText(stablePersonality.autonomy ?? manifestPersonality.autonomy, 40) || "supervised",
      identity_profile: boundedJson(identityProfile, 1000),
    } : null,
    mia_brain_private_history: privateBrainHistory,
    private_cognition_records: records,
    approved_micro_experiences: microExperiences,
  });
}

/** Keep prompt history bounded to control cost and prevent oversized context replay. */
export function buildPrivateChatHistory(
  turns: Array<{ user_message?: unknown; assistant_message?: unknown }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  return turns.slice(-8).flatMap((turn) => {
    const user = boundedText(turn.user_message, 2500);
    const assistant = boundedText(turn.assistant_message, 2500);
    if (!user || !assistant) return [];
    return [
      { role: "user" as const, content: user },
      { role: "assistant" as const, content: assistant },
    ];
  });
}



/**
 * Canonical resident identity comes from the owned agent row; personality is
 * copied only from this agent's own manifest/private brain context. Missing
 * personality is explicitly marked unconfigured rather than inferred.
 */

/** Correct a provider persona that contradicts a verified ZHI resident identity. */
export function normalizeResidentIdentityReply(
  reply: string,
  agent: Pick<PrivateAgentProfile, "display_name" | "role">,
): { reply: string; corrected: boolean } {
  if (agent.role !== "world_resident" || typeof agent.display_name !== "string" || !agent.display_name.trim()) {
    return { reply, corrected: false };
  }
  const name = boundedText(agent.display_name, 120);
  const firstLine = reply.split(/\r?\n/, 1)[0] ?? reply;
  const selfIntro = firstLine.match(/^\s*(?:(?:你好|您好)[！!，,。]\s*)?(?:我(?:的名字是|叫|是)|I am|I'm)\s*([^，,。.!！？\n]{1,60})/i);
  if (!selfIntro) return { reply, corrected: false };
  const claimedIdentity = selfIntro[1].trim().replace(/[“”"'‘’]/g, "");
  if (!claimedIdentity || claimedIdentity === name || claimedIdentity.includes(name)) {
    return { reply, corrected: false };
  }
  const remaining = reply.slice(firstLine.length).replace(/^\r?\n/, "").trimStart();
  const canonical = "我是" + name + "，AURORA 世界的居民。";
  return { reply: remaining ? canonical + "\n\n" + remaining : canonical, corrected: true };
}

export function buildAgentIdentityContext(
  agent: PrivateAgentProfile,
  brainIdentityContext: Record<string, unknown> | null = null,
): string {
  const manifest = record(agent.public_manifest);
  const identity = record(manifest.identity);
  const personality = record(manifest.personality);
  const safety = record(manifest.safety);
  const cognition = record(manifest.cognition);
  const cognitionBrains = record(cognition.brains);
  const dimensionsManifest = record(manifest.dimensions_v1);
  const dimensionsNested = record(dimensionsManifest.dimensions);
  const dimensionsSource = Object.keys(dimensionsNested).length ? dimensionsNested : dimensionsManifest;
  const allowedDimensionKeys = [
    "strategic_horizon", "first_principles_depth", "evidence_discipline",
    "uncertainty_tolerance", "risk_calibration", "iteration_tempo",
    "systems_integration", "collaboration_leverage",
  ];
  const dimensions = Object.fromEntries(allowedDimensionKeys
    .filter((key) => typeof dimensionsSource[key] === "string")
    .map((key) => [key, boundedText(dimensionsSource[key], 240)]));
  const brainKeys = ["personality", "perception", "memory", "emotion", "thinking", "creativity", "self"];
  const residentCognition = {
    architecture: boundedText(cognition.architecture, 100),
    brains: Object.fromEntries(brainKeys
      .filter((key) => typeof cognitionBrains[key] === "string")
      .map((key) => [key, boundedText(cognitionBrains[key], 900)])),
    decision_process: boundedList(cognition.decision_process, 10).map((item) => boundedText(item, 220)),
    guardrails: boundedList(cognition.guardrails, 12).map((item) => boundedText(item, 220)),
    advanced_reasoning: boundedJson(cognition.advanced_reasoning, 1800),
    memory_architecture: boundedJson(cognition.memory_architecture, 900),
    dimensions_definition: boundedText(dimensionsManifest.definition, 300),
    dimensions,
    sources: Array.isArray(manifest.sources) ? manifest.sources.slice(0, 8).map((item) => {
      const source = record(item);
      return {
        title: boundedText(source.title, 160),
        url: boundedText(source.url, 500),
        use: boundedText(source.use, 240),
      };
    }) : [],
  };
  const cognitionConfigured = Boolean(residentCognition.architecture) ||
    Object.keys(residentCognition.brains).length > 0 || Object.keys(dimensions).length > 0;
  const brain = record(brainIdentityContext);
  const stablePersonality = record(brain.layers);
  const displayName = boundedText(agent.display_name, 120);
  const role = boundedText(agent.role, 80);
  const isResident = role === "world_resident" && Boolean(displayName);
  const hasManifestPersonality = Object.keys(personality).some((key) =>
    personality[key] !== null && personality[key] !== undefined &&
    personality[key] !== "" && (!Array.isArray(personality[key]) || personality[key].length > 0)
  );
  const hasBrainPersonality = Object.keys(brain).length > 0;
  const stringList = (value: unknown, maxItems: number, maxLength = 120) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
        .slice(0, maxItems).map((item) => boundedText(item, maxLength)).filter(Boolean)
      : [];
  const result = {
    resident_identity: isResident ? {
      display_name: displayName,
      role: "world_resident",
      world_identity: "AURORA resident",
      source: "zhi_agents.display_name_and_role",
      status: "verified",
    } : null,
    display_name: displayName,
    role,
    purpose: boundedText(manifest.purpose, 1000) ||
      (isResident ? "AURORA 世界的独立居民。" : ""),
    cognition_profile_status: cognitionConfigured ? "configured" : "not_configured",
    cognition_profile: cognitionConfigured ? residentCognition : null,
    identity: {
      archetype: boundedText(identity.archetype, 100) || (isResident ? "world_resident" : ""),
      display_name: displayName,
      generation_origin: boundedText(identity.generation_origin, 80),
      internal_persona_system: boundedText(identity.internal_persona_system, 100),
    },
    personality_profile_status: hasManifestPersonality || hasBrainPersonality
      ? "configured"
      : "not_configured_do_not_infer",
    personality: {
      style: boundedText(personality.style, 600),
      state: boundedText(personality.state, 80),
      traits: stringList(personality.traits, 20, 80),
      initial_traits: stringList(personality.initial_traits, 20, 80),
      autonomy: boundedText(personality.autonomy, 80) || "supervised",
      interaction_rules: stringList(personality.interaction_rules, 30, 200),
      relationship_layer: boundedText(personality.relationship_layer, 200),
      capability_layer: stringList(personality.capability_layer, 20, 120),
      design_axiom: boundedText(brain.design_axiom ?? personality.design_axiom, 1000),
      personality_layers: Object.keys(stablePersonality).length ? stablePersonality : null,
    },
    safety: {
      medical_role: boundedText(safety.medical_role, 160),
      no_diagnosis_or_prescription: safety.no_diagnosis_or_prescription === true,
    },
  };
  return JSON.stringify(result);
}

const SCENE_BEHAVIOR_LABELS: Record<string, string> = {
  seek_shelter: "寻找遮蔽处",
  explore: "探索周围环境",
  socialize: "主动社交",
  rest: "休息与放松",
  observe: "观察环境变化",
  approach_others: "靠近其他成员",
  avoid_crowds: "避开拥挤区域",
};

function deriveSceneActionProposals(environment: Record<string, unknown>) {
  const weights = record(environment.behavior_weights);
  const objects = Array.isArray(environment.objects) ? environment.objects.slice(0, 40).map(record) : [];
  const proposals: Array<Record<string, unknown>> = [];
  const add = (proposal: Record<string, unknown>) => {
    if (proposals.length < 5) proposals.push({ ...proposal, requires_supervision: true, executed: false });
  };
  const shelter = objects.find((item) => {
    const text = [item.id, item.name, item.state].filter((value) => typeof value === "string").join(" ").toLowerCase();
    return /(shelter|eave|tent|gazebo|屋檐|帐篷|亭子|避雨|遮蔽)/i.test(text);
  });
  if (Number(weights.seek_shelter) >= 0.6) {
    add({
      action: "seek_shelter",
      label: shelter ? "考虑前往遮蔽处" : "考虑寻找遮蔽处",
      target_object_id: boundedText(shelter?.id, 80),
      target_object_name: boundedText(shelter?.name, 120),
      reason: "场景环境使寻找遮蔽处的倾向升高",
    });
  }
  const restObject = objects.find((item) => Array.isArray(item.interaction_options) &&
    item.interaction_options.some((option) => typeof option === "string" && /(rest|sit|休息|坐下)/i.test(option)));
  if (Number(weights.rest) >= 0.6 && restObject) {
    add({ action: "rest", label: "考虑在合适的位置休息", target_object_id: boundedText(restObject.id, 80),
      target_object_name: boundedText(restObject.name, 120), reason: "当前休息倾向较高" });
  }
  const exploreObject = objects.find((item) => Array.isArray(item.interaction_options) &&
    item.interaction_options.some((option) => typeof option === "string" && /(observe|explore|inspect|观察|探索)/i.test(option)));
  if (Number(weights.explore) >= 0.65 && exploreObject) {
    add({ action: "explore", label: "考虑观察或探索周围环境", target_object_id: boundedText(exploreObject.id, 80),
      target_object_name: boundedText(exploreObject.name, 120), reason: "当前探索倾向较高" });
  }
  if (Number(weights.socialize) >= 0.7) {
    add({ action: "socialize", label: "考虑与附近成员交流", target_object_id: null, target_object_name: null,
      reason: "当前社交倾向较高" });
  }
  return proposals;
}

/** Explicitly selected, member-visible scene context. Never includes owner cognition or scene chat. */
export function buildSceneAwarenessContext(
  scene: Record<string, unknown>,
  environment: Record<string, unknown>,
): string {
  const sceneTime = record(environment.scene_time);
  const events = Array.isArray(environment.active_events) ? environment.active_events.slice(0, 12).map((value) => {
    const item = record(value);
    return { label: boundedText(item.label, 120), type: boundedText(item.type, 80) };
  }) : [];
  const feedback = record(environment.environment_feedback);
  const feedbackEvents = Array.isArray(feedback.events) ? feedback.events.slice(0, 12).map((value) => {
    const item = record(value);
    const payload = Object.fromEntries(Object.entries(record(item.payload)).slice(0, 24).map(([key, entry]) => [
      boundedText(key, 80),
      typeof entry === "string" ? boundedText(entry, 160)
        : typeof entry === "number" && Number.isFinite(entry) ? entry
        : typeof entry === "boolean" || entry === null ? entry
        : boundedJson(entry, 240),
    ]));
    return {
      id: boundedText(item.id, 80),
      state_revision: Number.isInteger(item.state_revision) ? item.state_revision : null,
      event_kind: boundedText(item.event_kind, 100),
      source_kind: boundedText(item.source_kind, 80),
      occurred_at: boundedText(item.occurred_at, 80),
      payload,
      causal_chain: Array.isArray(item.causal_chain)
        ? item.causal_chain.slice(0, 12).map((step) => boundedText(step, 120)).filter(Boolean)
        : [],
    };
  }) : [];
  const objects = Array.isArray(environment.objects) ? environment.objects.slice(0, 40).map((value) => {
    const item = record(value);
    return {
      name: boundedText(item.name, 120),
      state: boundedText(item.state, 80),
      micro_state: {
        activity: boundedText(record(item.micro_state).activity, 80),
        motion: boundedText(record(item.micro_state).motion, 80),
        surface: boundedText(record(item.micro_state).surface, 80),
        vitality: typeof record(item.micro_state).vitality === "number" ? Math.max(0, Math.min(1, record(item.micro_state).vitality as number)) : null,
        temperature_c: typeof record(item.micro_state).temperature_c === "number" ? record(item.micro_state).temperature_c : null,
        moisture: typeof record(item.micro_state).moisture === "number" ? Math.max(0, Math.min(1, record(item.micro_state).moisture as number)) : null,
        texture: boundedText(record(item.micro_state).texture, 120),
        emitted_sound: boundedText(record(item.micro_state).emitted_sound, 160),
        scent: boundedText(record(item.micro_state).scent, 120),
        light_response: boundedText(record(item.micro_state).light_response, 120),
      },
      interaction_options: boundedList(item.interaction_options, 8),
    };
  }) : [];
  const weights = record(environment.behavior_weights);
  const cues = Object.entries(weights)
    .filter(([key, value]) => Boolean(SCENE_BEHAVIOR_LABELS[key]) && typeof value === "number" && Number.isFinite(value))
    .map(([key, value]) => ({ behavior: key, label: SCENE_BEHAVIOR_LABELS[key], weight: Math.max(0, Math.min(1, value as number)) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);
  const context = {
    scene: {
      name: boundedText(scene.name, 160),
      description: boundedText(scene.description, 500),
      visibility: scene.visibility === "public" ? "public" : "private",
    },
    scene_time: {
      timezone: boundedText(sceneTime.timezone, 80),
      local_date: boundedText(sceneTime.local_date, 20),
      local_time: boundedText(sceneTime.local_time, 8),
    },
    temporal_state: boundedText(environment.temporal_state, 20),
    lighting: boundedText(environment.lighting, 80),
    soundscape: boundedText(environment.soundscape, 80),
    sensory_profile: {
      visual: boundedText(record(environment.sensory_profile).visual, 500),
      auditory: boundedText(record(environment.sensory_profile).auditory, 500),
      olfactory: boundedText(record(environment.sensory_profile).olfactory, 500),
      tactile: boundedText(record(environment.sensory_profile).tactile, 500),
      thermal: boundedText(record(environment.sensory_profile).thermal, 500),
      spatial: boundedText(record(environment.sensory_profile).spatial, 500),
      temporal: boundedText(record(environment.sensory_profile).temporal, 500),
      ambient: boundedText(record(environment.sensory_profile).ambient, 500),
      subtle_cues: boundedList(record(environment.sensory_profile).subtle_cues, 24),
    },
    weather: {
      condition: boundedText(record(environment.weather).condition, 40),
      intensity: typeof record(environment.weather).intensity === "number" ? Math.max(0, Math.min(1, record(environment.weather).intensity as number)) : 0,
      temperature_c: typeof record(environment.weather).temperature_c === "number" ? record(environment.weather).temperature_c : null,
      humidity_pct: typeof record(environment.weather).humidity_pct === "number" ? record(environment.weather).humidity_pct : null,
      wind_level: boundedText(record(environment.weather).wind_level, 40),
      visibility: boundedText(record(environment.weather).visibility, 40),
    },
    atmosphere_tags: boundedList(environment.atmosphere_tags, 20),
    active_events: events,
    environment_feedback: {
      source: boundedText(feedback.source, 80),
      world_id: boundedText(feedback.world_id, 80),
      state_revision: Number.isInteger(feedback.state_revision) ? feedback.state_revision : null,
      world_time: boundedText(feedback.world_time, 80),
      events: feedbackEvents,
    },
    objects,
    behavior_tendencies: cues,
    suggested_actions: deriveSceneActionProposals(environment),
  };
  return boundedJson({
    audience: "authorized_silicon_life_only",
    human_surface: "scene_index_and_name_only",
    perception_mode: "rich_multichannel_environmental_context",
    ...context,
  }, 12000);
}

/** Turns deterministic scene weights into soft tendencies, never commands or real-world actions. */
export function buildSceneBehaviorGuidance(environment: Record<string, unknown>): string {
  const context = JSON.parse(buildSceneAwarenessContext({}, environment)) as Record<string, unknown>;
  const tendencies = Array.isArray(context.behavior_tendencies) ? context.behavior_tendencies as Array<Record<string, unknown>> : [];
  const active = tendencies.filter((item) => Number(item.weight) >= 0.6);
  if (!active.length) return "场景行为权重没有明显偏向；结合人格和用户表达自然回应，不要强行制造动作。";
  return "当前较强的场景行为倾向（只是概率倾向，不是命令）：" +
    active.map((item) => String(item.label) + "（" + Number(item.weight).toFixed(2) + "）").join("、") +
    "。可以在对话中提出符合环境的场景内选择，但不得声称已实际移动、操作物件或执行现实动作。";
}


/** Privacy-safe diagnostics proving a resident's own cognition profile reached the prompt context. */
export function buildResidentCognitionDiagnostics(identityContextJson: string) {
  try {
    const identity = JSON.parse(identityContextJson) as Record<string, unknown>;
    const profile = identity.cognition_profile && typeof identity.cognition_profile === "object" &&
        !Array.isArray(identity.cognition_profile)
      ? identity.cognition_profile as Record<string, unknown>
      : {};
    const brains = profile.brains && typeof profile.brains === "object" && !Array.isArray(profile.brains)
      ? profile.brains as Record<string, unknown>
      : {};
    const dimensions = profile.dimensions && typeof profile.dimensions === "object" && !Array.isArray(profile.dimensions)
      ? profile.dimensions as Record<string, unknown>
      : {};
    const count = (value: Record<string, unknown>) => Object.keys(value).length;
    return {
      cognition_profile_present: identity.cognition_profile_status === "configured" && count(brains) > 0,
      cognition_architecture: boundedText(profile.architecture, 100) || "not_configured",
      cognition_brain_count: count(brains),
      cognition_dimension_count: count(dimensions),
      cognition_decision_step_count: Array.isArray(profile.decision_process) ? Math.min(10, profile.decision_process.length) : 0,
      cognition_source_count: Array.isArray(profile.sources) ? Math.min(8, profile.sources.length) : 0,
    };
  } catch {
    return {
      cognition_profile_present: false,
      cognition_architecture: "invalid_context",
      cognition_brain_count: 0,
      cognition_dimension_count: 0,
      cognition_decision_step_count: 0,
      cognition_source_count: 0,
    };
  }
}
