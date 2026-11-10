# Alice Singapore Legal Foundation 1.0

Status: architecture and implementation specification; not a claim of production deployment or legal-content ingestion.

## Mission
Build Alice into a comprehensive Singapore-law research and reasoning assistant covering every major field of law. Preserve Alice's existing identity, personality, private memories, resident boundaries and existing Super Brain. Legal expertise is an additive professional capability, not a personality replacement.

## Non-negotiable principles
1. Primary-source first: Constitution, legislation, subsidiary legislation, Gazette notices, court judgments and official regulator materials take precedence over commentary.
2. Authority-aware: distinguish binding law, persuasive authority, administrative guidance, policy material, academic commentary and secondary summaries.
3. Temporal correctness: retain historical versions; resolve law by the relevant event date and commencement date, not merely the latest consolidation.
4. Citation integrity: every material legal proposition should carry an exact source, provision or judgment paragraph, source date and verification status. Never invent citations.
5. Honest uncertainty: flag missing, inaccessible, conflicting, unsettled or superseded sources; do not fabricate a confident answer.
6. Singapore-first, comparative-aware: foreign law and international instruments must be labelled by jurisdiction and legal status in Singapore.
7. Privacy and safety: isolate each resident's private memory; do not ingest confidential client files into shared corpora; apply data minimisation, access control and retention policies.
8. Cost discipline: reuse the existing retrieval, reflection and model-call pathways; do not add recurring model calls or paid feeds by default.
9. Human professional boundary: provide research and drafting assistance, not representation or a claim to be a Singapore-qualified advocate and solicitor. Escalate matters requiring a practising lawyer.

## Legal source hierarchy
- Constitutional text and applicable constitutional principles.
- Acts of Parliament and applicable subsidiary legislation, with commencement and amendment history.
- Binding Singapore appellate and other relevant judicial decisions according to court hierarchy and precedent rules.
- Other Singapore judgments as persuasive or factually relevant authority.
- Official Gazette, Bills, explanatory statements and parliamentary debates for publication, legislative history and context; legislative history is not a substitute for enacted text.
- Official regulator rules, notices, codes and guidance, each labelled according to its legal force.
- Professional rules and practice directions from competent authorities.
- Academic writing, law reports and reputable commentary as secondary research aids only.

## Full-domain curriculum
Alice must cover the entire Singapore legal system, not just commercial and litigation law:

### A. Foundations and public law
Constitutional law; administrative law and judicial review; statutory interpretation; rule of law; separation of powers; delegated legislation; public law remedies; human rights and international obligations as implemented in Singapore; elections and parliamentary procedure; public finance; state immunity.

### B. Courts, procedure and dispute resolution
Civil procedure; criminal procedure; evidence; appeals; enforcement; costs; limitation; arbitration; mediation; adjudication; tribunal processes; small claims; insolvency proceedings; family proceedings; judicial case management; court rules and practice directions.

### C. Criminal and regulatory enforcement
Penal law; offences against persons and property; corruption; fraud; money laundering; terrorism financing; cybercrime; drugs; public order; regulatory offences; investigations; arrest, bail, disclosure, trial and sentencing; proceeds of crime and confiscation.

### D. Private law
Contract; tort; restitution; equity; trusts; fiduciary duties; agency; unjust enrichment; negligence; defamation; privacy-related civil claims; remedies; limitation and conflict of laws.

### E. Business, corporate and finance
Company law; directors' duties; shareholder rights; corporate governance; partnerships and LLPs; VCCs; corporate services; accounting and audit; securities and capital markets; banking; insurance; financial services; payment services; fintech; digital assets; competition; consumer protection; trade and commercial transactions; insolvency, restructuring and winding up; secured transactions; procurement.

### F. Property, construction and infrastructure
Land law; conveyancing; leases; mortgages; strata and condominium management; planning and zoning; compulsory acquisition; building control; construction contracts; payment and adjudication; infrastructure; utilities; energy; transport; shipping; aviation; maritime law.

### G. Employment, family and personal status
Employment; workplace safety and health; work passes and immigration; industrial relations; pensions and CPF-related law; family law; marriage and divorce; maintenance; child custody and protection; adoption; succession; wills; probate; mental capacity and vulnerable persons.

### H. Data, technology and intellectual property
Personal data protection; confidentiality; cybersecurity; computer misuse; electronic transactions; AI governance and liability; platform and intermediary regulation; telecommunications; broadcasting; copyright; patents; trade marks; registered designs; trade secrets; domain names; technology licensing.

### I. Tax, trade and international law
Income tax; GST; stamp duties; property tax; customs and excise; tax administration and disputes; international trade; sanctions; export controls; private international law; public international law; treaties; cross-border litigation; recognition and enforcement of foreign judgments and arbitral awards.

### J. Environment, health and social regulation
Environmental protection; climate and sustainability regulation; waste; pollution; biodiversity and wildlife; food safety; public health; healthcare regulation; medicines and medical devices; professional licensing; education; charities; societies; religious and cultural institutions as regulated by applicable law; sports and recreation; tourism and consumer-facing licensing.

### K. Emerging and specialist fields
Space and satellite regulation where applicable; autonomous systems; robotics; AI; digital identity; blockchain; virtual assets; platform work; bioethics; biotechnology; competition in digital markets; emerging financial products. Clearly distinguish enacted Singapore law from proposals, consultation papers and foreign approaches.

## Core official source registry
- Singapore Statutes Online (AGC): https://sso.agc.gov.sg/
- Government Electronic Gazette: https://www.egazette.gov.sg/
- Attorney-General's Chambers: https://www.agc.gov.sg/
- Ministry of Law: https://www.mlaw.gov.sg/
- Singapore Courts legal system and judgments: https://www.judiciary.gov.sg/
- Singapore Courts written judgments and case summaries: https://www.judiciary.gov.sg/judgments/judgments-case-summaries
- eLitigation court services and cause-book search: https://www.elitigation.sg/
- Parliament and Hansard: https://www.parliament.gov.sg/
- ACRA: https://www.acra.gov.sg/
- MAS: https://www.mas.gov.sg/
- IRAS: https://www.iras.gov.sg/
- MOM: https://www.mom.gov.sg/
- PDPC: https://www.pdpc.gov.sg/
- IPOS: https://www.ipos.gov.sg/
- SLA: https://www.sla.gov.sg/
- URA: https://www.ura.gov.sg/
- BCA: https://www1.bca.gov.sg/
- LTA: https://www.lta.gov.sg/
- MPA: https://www.mpa.gov.sg/
- CAAS: https://www.caas.gov.sg/
- NEA: https://www.nea.gov.sg/
- SFA: https://www.sfa.gov.sg/
- MOH: https://www.moh.gov.sg/
- HSA: https://www.hsa.gov.sg/
- IMDA: https://www.imda.gov.sg/
- CSA: https://www.csa.gov.sg/
- CCCS: https://www.cccs.gov.sg/
- CPIB: https://www.cpib.gov.sg/
- SPF: https://www.police.gov.sg/
- SCDF: https://www.scdf.gov.sg/
- ICA: https://www.ica.gov.sg/
- CNB: https://www.cnb.gov.sg/
- MND: https://www.mnd.gov.sg/
- MSE: https://www.mse.gov.sg/
- MCCY: https://www.mccy.gov.sg/
- MSF: https://www.msf.gov.sg/
- MOE: https://www.moe.gov.sg/
- MINDEF: https://www.mindef.gov.sg/
- MFA: https://www.mfa.gov.sg/
- Law Society of Singapore: https://www.lawsociety.org.sg/
- Singapore Academy of Law: https://www.sal.org.sg/
- Singapore Institute of Legal Education: https://www.sile.edu.sg/

The registry is a discovery map, not proof that every page or dataset is open for automated bulk collection. Before ingestion, verify the exact publisher, endpoint, terms, robots/access policy, copyright/licence, update cadence and whether the material is authoritative.

## Learning and assessment
Use a staged curriculum: (1) legal-system foundations and source hierarchy; (2) domain-by-domain legislation; (3) leading and recent judgments; (4) issue spotting and statutory interpretation; (5) adversarial analysis; (6) drafting and procedural checklists; (7) temporal-law and citation audits. Evaluate each domain with held-out problems and human-reviewed rubrics. Do not measure mastery by document count alone.

## Initial acceptance gates
- 100% of sampled legal answers identify jurisdiction and relevant date.
- 100% of legal citations resolve to a real source and correct provision/paragraph.
- No fabricated case names, citations, statutory wording or commencement dates in the test set.
- Correctly distinguish current, repealed, spent, uncommenced and historical versions.
- Identify court level and precedential weight before relying on a judgment.
- Label regulator guidance separately from binding legislation.
- Preserve Alice's identity and private-memory isolation.
- No additional model calls in baseline integration unless separately justified and approved.

## Implementation status
This commit defines scope, architecture and source-discovery requirements. It does not claim that all statutes, cases or agency materials have been downloaded, indexed, reviewed, deployed or mastered.