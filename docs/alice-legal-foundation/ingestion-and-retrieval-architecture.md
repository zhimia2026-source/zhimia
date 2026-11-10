# Official Legal Corpus Ingestion and Retrieval Architecture

Status: engineering specification. No source is presumed to provide a public bulk API unless that interface and its terms are independently verified.

## 1. Acquisition gate per source
Before any automated retrieval, record:
- official publisher and exact page/dataset/endpoint;
- source class and legal authority;
- public access method (HTML, PDF, download, API, search interface, manual);
- terms of use, copyright/licence, robots/access rules and rate limits;
- authentication/subscription requirements;
- permitted storage, transformation, embedding, retention and redistribution;
- expected update signal and last successful verification;
- extraction confidence and known omissions.

A public webpage is not blanket permission for bulk scraping, republication or model training. Do not bypass access controls, subscriptions, CAPTCHAs, rate limits or technical restrictions. If lawful bulk access is not established, use permitted public search/download workflows and store only permitted metadata or links.

## 2. Pipeline
1. Discover: enumerate Acts, subsidiary legislation, Gazette notices, judgments, regulator materials and practice directions from official catalogues.
2. Acquire: use an approved connector for that source; preserve original bytes where permitted.
3. Fingerprint: compute content hash; identify duplicate, changed, moved and withdrawn documents.
4. Parse: extract headings, sections, schedules, tables, paragraph numbers, footnotes, dates and citations. Preserve page/paragraph anchors.
5. Validate: compare metadata and extracted text against source; OCR and table extraction require confidence flags.
6. Classify: jurisdiction, domain, source type, authority, court level, legal force and temporal status.
7. Link: parent Act to subsidiary legislation; Act section to amending Act and commencement notice; case to cited statutes and other cases; regulator rule to enabling statute.
8. Index: exact-text index plus semantic index; never let semantic similarity replace exact citation retrieval.
9. Retrieve: filter by jurisdiction, relevant date, legal status, source authority and domain before ranking.
10. Answer: show source title, exact citation/paragraph, version/effective date, source URL and verification status.
11. Monitor: recheck source catalogues and changed documents; update only changed content and retain prior versions.

## 3. Canonical record types
- LegalInstrument: Constitution, Act, subsidiary legislation, commencement notice, Gazette item, Bill.
- Judgment: court, division, date, neutral citation, case number, judge(s), procedural posture, paragraphs.
- RegulatorMaterial: notice, direction, code, guideline, consultation, enforcement decision.
- PracticeMaterial: court rules, practice directions, forms, procedural guides.
- SecondaryMaterial: textbook, article, case note, law report commentary; never silently promote to primary authority.
- LegalProposition: a claim linked to one or more exact provisions or judgment paragraphs, with jurisdiction, date, conditions and counter-authorities.

## 4. Temporal model
Represent separately:
- publication_date;
- enactment_or_made_date;
- commencement_date (including provision-specific commencement);
- effective_from and effective_to;
- amendment/repeal date;
- retrieved_at and verified_at.

Do not infer commencement from publication or assent. A provision may commence on a date appointed by notice, commence in parts, or remain uncommenced. For historical questions, reconstruct the text in force on the material date and record the evidence for that reconstruction.

## 5. Case-law treatment
For every judgment:
- preserve court level and jurisdiction;
- separate majority, concurring and dissenting reasons where relevant;
- extract paragraph-level propositions with exact pinpoints;
- distinguish ratio decidendi from obiter dicta;
- identify orders, remedies and procedural posture;
- link authorities cited, followed, distinguished, doubted, overruled or reversed only when verified;
- do not infer that a later case has overruled an earlier case merely because it is not cited.

Singapore Law Reports/LawNet and commercial databases may provide valuable research and citator coverage, but subscription and licence restrictions must be respected. Official court judgment pages are primary sources where available. A case summary is not a substitute for the judgment.

## 6. Retrieval policy
First-stage hard filters:
- jurisdiction = Singapore unless user asks comparative law;
- material date and applicable temporal version;
- legal status;
- source type and legal force;
- court hierarchy and authority relevance.

Second-stage ranking:
- exact citation/title/phrase match;
- proposition and legal issue match;
- factual analogy;
- court authority and recency;
- treatment by later cases;
- source completeness and extraction confidence.

Return contrary authority and material qualifications, not only supporting cases. Foreign decisions must be explicitly labelled persuasive or comparative, never silently represented as binding Singapore law.

## 7. Answer-time citation contract
Each material proposition should resolve to:
- source ID and official source URL;
- exact section/subsection or judgment paragraph;
- source version and date applicable;
- authority type and precedential/legal force;
- retrieval/verification timestamp.

If exact pinpoint is unavailable, state that limitation and do not fabricate one. If sources conflict or the law is unsettled, present the conflict and uncertainty.

## 8. Failure states
Use explicit statuses: SOURCE_UNAVAILABLE, ACCESS_RESTRICTED, TERMS_UNVERIFIED, PARSE_LOW_CONFIDENCE, VERSION_UNRESOLVED, CITATION_UNVERIFIED, CONFLICTING_AUTHORITIES, OUTDATED_SOURCE. A failed fetch is not proof that no law or case exists.

## 9. Security and privacy
Keep public legal corpus separate from case-specific private workspaces. Apply tenant isolation, least privilege, encryption, access logs and retention controls. Do not put privileged communications or identifiable client documents in a shared corpus or use them for general training. Any case workspace must be explicitly scoped and deletable under the applicable retention policy.

## 10. Release gates
Do not label the corpus complete until source coverage is measured against official catalogues, temporal reconstruction tests pass, citation pinpoints are independently checked, access terms are recorded, and domain experts review representative samples. Report coverage as measurable denominators (e.g. Acts indexed / Acts listed), not vague percentages without a known denominator.
