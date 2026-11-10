# Official Source Verification Notes — Singapore

Checked: 10 November 2026. This is a source-discovery and access-boundary note, not legal advice and not a grant of bulk-ingestion rights.

## 1. Singapore Statutes Online (AGC)

- Official publisher: Attorney-General's Chambers / Legislation Division.
- Official entry point: https://sso.agc.gov.sg/
- AGC's public description: Singapore Statutes Online provides free online public access to Singapore legislation.
- Required next check before automated acquisition: the SSO FAQ/permission route for reproduction, permitted copying, storage, transformation, quotation and redistribution. Public reading access must not be treated as blanket bulk-reuse permission.
- Data model requirements: distinguish Act, subsidiary legislation, schedules, amendment history, commencement notices, provision-specific commencement and historical versions.

## 2. Singapore Courts — published decisions

- Official entry point: https://www.judiciary.gov.sg/judgments/judgments-case-summaries
- Official explanatory page: https://www.judiciary.gov.sg/judgments/judicial-decisions
- The Courts explain that published written judgments carry neutral citations. Brief reasons/brief grounds are not intended for publication and may not carry a neutral citation.
- The Courts state that all published Supreme Court decisions since 2000 are available through the relevant publication channel, while State Courts and Family Justice Courts published decisions are available for the last three months through the stated channel. Treat these as stated publication windows, not proof of a complete universe of decisions.
- Ingestion must preserve neutral citation, court level, date, procedural posture and exact paragraph numbering. A case summary is a discovery aid, not a replacement for the judgment.

## 3. eLitigation and court-order services

- eLitigation: https://www.elitigation.sg/
- It is a court e-filing/service environment and includes court service/search functions. Do not assume it is an unrestricted public bulk corpus of judgments or that access to court documents is general-purpose.
- Authentic Court Orders portal materials may be confidential and access-code protected. Do not guess codes, scrape protected documents or treat those records as public training material.

## 4. Secondary discovery tools

- Independent legal indexes and case-note services can improve discovery and topic navigation.
- They are not official legal publishers. Record their status as secondary/unofficial, check their own terms, and always resolve propositions to the official judgment or legislation before marking an answer verified.
- A third-party service's public API or MCP endpoint does not imply permission to bulk export its content, share its token or sublicense its data.

## 5. Regulator APIs and datasets

- Do not assume all regulator portals share one access model. Some agencies publish APIs with registration, subscription, credentials, rate limits and API-specific terms.
- For each API, record the specific terms version, subscription scope, credential owner, permitted use, quotas, retention and redistribution restrictions.
- Never store credentials in source records or commit them to GitHub. Use server-side secrets and least privilege.

## 6. Engineering decision

The first legal corpus release should be conservative:
- index official catalogue metadata and canonical links where permitted;
- ingest full text only after source-specific permission is confirmed;
- preserve historical versions and exact locators where legally and technically permitted;
- label missing or restricted content explicitly;
- avoid model training or vector embedding of any source until its licence permits that specific use.

## References

- AGC, Singapore Statutes Online: https://www.agc.gov.sg/our-roles/drafter-of-laws/singapore-statutes-online/
- Singapore Courts, Types of Decisions: https://www.judiciary.gov.sg/judgments/judicial-decisions
- Singapore Courts, Judgments and Case Summaries: https://www.judiciary.gov.sg/judgments/judgments-case-summaries
- Authentic Court Orders: https://www.courtorders.gov.sg/
