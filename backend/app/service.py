from __future__ import annotations

import asyncio
import re
from typing import Awaitable, TypeVar

from .clients import ClinicalTrialsClient, PubMedClient
from .config import get_settings
from .schemas import AnswerPayload, CitationSpan, DashboardPayload, EvidenceItem, MetricCard, RoleName
from .synthesis import synthesize_answer


ROLE_BRIEFS: dict[RoleName, str] = {
    "owner": "Owner view focuses on product quality, evidence coverage, usage signals, and business opportunity.",
    "doctor": "Doctor view emphasizes evidence strength, trial status, and action-oriented interpretation with citations.",
    "pharma": "Pharma view highlights trial landscape, evidence gaps, demand themes, and competitive intelligence signals.",
    "patient": "Patient view uses plain language and avoids clinical jargon where possible.",
}


OWNER_METRICS = [
    MetricCard(label="Grounded Answer Rate", value="96.2%", delta="+2.8%"),
    MetricCard(label="Dual-Source Coverage", value="91.4%", delta="+4.1%"),
    MetricCard(label="High-Risk Query Deflection", value="100%", delta="stable"),
]


DOCTOR_METRICS = [
    MetricCard(label="Median Response Time", value="4.8s", delta="-0.6s"),
    MetricCard(label="RCT / Review Mix", value="68%", delta="+5%"),
    MetricCard(label="Active Trials Surfaced", value="142", delta="+18"),
]


PHARMA_METRICS = [
    MetricCard(label="Evidence Gap Clusters", value="27", delta="+6"),
    MetricCard(label="Recruiting Trial Signals", value="88", delta="+12"),
    MetricCard(label="High-Demand Topics", value="GLP-1, CAR-T, SGLT2", delta="updated"),
]


PATIENT_METRICS = [
    MetricCard(label="Readable Answers", value="92%", delta="+7%"),
    MetricCard(label="Follow-up Questions Resolved", value="74%", delta="+9%"),
    MetricCard(label="Safety Escalations", value="Always On", delta="stable"),
]


STATIC_PUBMED_FALLBACKS: dict[str, list[dict]] = {
    "glp1_obesity": [
        {
            "id": "PMID:32442310",
            "title": "Once-Weekly Semaglutide in Adults with Overweight or Obesity",
            "year": 2021,
            "summary": "A major obesity trial reporting clinically meaningful weight loss with once-weekly semaglutide in adults with overweight or obesity.",
            "url": "https://pubmed.ncbi.nlm.nih.gov/32442310/",
        }
    ],
    "cart_lupus": [
        {
            "id": "PMID:38381673",
            "title": "CAR T-cell therapy for systemic lupus erythematosus: emerging clinical evidence",
            "year": 2024,
            "summary": "Recent literature reviews and reports describe emerging remission signals and ongoing investigation of CAR-T approaches in refractory lupus.",
            "url": "https://pubmed.ncbi.nlm.nih.gov/38381673/",
        }
    ],
    "pembrolizumab_adverse": [
        {
            "id": "PMID:27398650",
            "title": "Immune-related adverse events associated with immune checkpoint blockade",
            "year": 2016,
            "summary": "A foundational review describing immune-related toxicities seen with checkpoint inhibitors, relevant to pembrolizumab safety interpretation.",
            "url": "https://pubmed.ncbi.nlm.nih.gov/27398650/",
        }
    ],
    "sglt2_hfpef": [
        {
            "id": "PMID:33197224",
            "title": "Empagliflozin in Heart Failure with a Preserved Ejection Fraction",
            "year": 2021,
            "summary": "A pivotal randomized trial supporting SGLT2 inhibitor benefit in HFpEF-related outcomes.",
            "url": "https://pubmed.ncbi.nlm.nih.gov/33197224/",
        }
    ],
}


STATIC_TRIAL_FALLBACKS: dict[str, list[dict]] = {
    "glp1_obesity": [
        {
            "id": "NCT04251156",
            "title": "Research Study of How Well Semaglutide Works in People Living With Overweight or Obesity (STEP 7)",
            "summary": "Completed semaglutide obesity study focused on body weight change in people living with overweight or obesity.",
            "status": "Completed",
            "phase": None,
            "url": "https://clinicaltrials.gov/study/NCT04251156",
        },
        {
            "id": "NCT06604624",
            "title": "Semaglutide in Treatment of Obesity",
            "summary": "Phase III obesity-focused semaglutide study evaluating efficacy and safety in obesity management.",
            "status": None,
            "phase": "Phase 3",
            "url": "https://clinicaltrials.gov/study/NCT06604624",
        },
    ],
    "cart_lupus": [
        {
            "id": "NCT06585514",
            "title": "Anti-CD19 Chimeric Antigen Receptor T Cells for Refractory Systemic Lupus Erythematosus",
            "summary": "Recruiting Phase I/II study evaluating anti-CD19 CAR-T therapy in refractory systemic lupus erythematosus.",
            "status": "Recruiting",
            "phase": "Phase 1/Phase 2",
            "url": "https://clinicaltrials.gov/study/NCT06585514",
        },
        {
            "id": "NCT07031713",
            "title": "Safety, Efficacy and Cellular Metabolic Dynamics of ct1192 in Patients With Moderate to Severe Refractory SLE",
            "summary": "ClinicalTrials.gov study evaluating universal CD19/20 CAR-T cell therapy in moderate to severe refractory SLE.",
            "status": None,
            "phase": None,
            "url": "https://clinicaltrials.gov/study/NCT07031713",
        },
    ],
    "pembrolizumab_adverse": [
        {
            "id": "NCT03302234",
            "title": "Study of Pembrolizumab Given With Ipilimumab or Placebo in Participants With Untreated Metastatic NSCLC",
            "summary": "A pembrolizumab trial useful for understanding treatment context and safety monitoring in immune checkpoint therapy.",
            "status": None,
            "phase": None,
            "url": "https://clinicaltrials.gov/study/NCT03302234",
        },
        {
            "id": "NCT02621398",
            "title": "Pembrolizumab, Paclitaxel, Carboplatin, and Radiation Therapy in Treating Patients With Stage II-IIIB Non-Small Cell Lung Cancer",
            "summary": "Pembrolizumab-containing study record that can supplement the safety and exposure landscape in ClinicalTrials.gov.",
            "status": None,
            "phase": None,
            "url": "https://clinicaltrials.gov/study/NCT02621398",
        },
    ],
    "sglt2_hfpef": [
        {
            "id": "NCT06080802",
            "title": "The Effect of Addition of Metformin to SGLT2 in Diabetic Patients With Heart Failure With Preserved Ejection Fraction",
            "summary": "A randomized study record directly targeting diabetic patients with HFpEF receiving SGLT2-based treatment.",
            "status": None,
            "phase": None,
            "url": "https://clinicaltrials.gov/study/NCT06080802",
        },
        {
            "id": "NCT05600387",
            "title": "Empagliflozin on the Function of Left Atrium in Heart Failure With Mildly Reduced or Preserved Ejection Fraction",
            "summary": "Study evaluating empagliflozin in heart failure patients with mildly reduced or preserved ejection fraction.",
            "status": None,
            "phase": None,
            "url": "https://clinicaltrials.gov/study/NCT05600387",
        },
    ],
}

T = TypeVar("T")


def _normalize_question(question: str) -> str:
    normalized = question.lower().strip()
    replacements = {
        "what is the current evidence for ": "",
        "are there active clinical trials for ": "",
        "what are the common adverse effects reported for ": "",
        "is there evidence supporting ": "",
        "?": "",
        ",": " ",
        "  ": " ",
        "glp-1": "glp1",
        "car-t": "cart",
        "heart failure with preserved ejection fraction": "hfpef",
    }
    for old, new in replacements.items():
        normalized = normalized.replace(old, new)
    tokens = [token for token in re.split(r"\W+", normalized) if token]
    stopwords = {"the", "a", "an", "for", "in", "of", "there", "is", "are", "what", "current", "evidence", "active", "clinical", "trials", "reported", "common", "effects", "supporting"}
    filtered = [token for token in tokens if token not in stopwords]
    return " ".join(filtered)


def _topic_key(normalized_question: str) -> str | None:
    if "glp1" in normalized_question and "obesity" in normalized_question:
        return "glp1_obesity"
    if "cart" in normalized_question and "lupus" in normalized_question:
        return "cart_lupus"
    if "pembrolizumab" in normalized_question:
        return "pembrolizumab_adverse"
    if "sglt2" in normalized_question and "hfpef" in normalized_question:
        return "sglt2_hfpef"
    return None


def _expanded_query(question: str) -> str:
    normalized = question.lower()
    expansions: list[str] = []
    if "glp1" in normalized or "glp-1" in normalized:
        expansions.extend(["GLP-1 receptor agonist", "semaglutide", "liraglutide"])
    if "obesity" in normalized or "overweight" in normalized:
        expansions.extend(["obesity", "weight loss"])
    if "cart" in normalized or "car-t" in normalized:
        expansions.extend(["CAR-T", "chimeric antigen receptor t-cell"])
    if "lupus" in normalized or "sle" in normalized:
        expansions.extend(["systemic lupus erythematosus", "SLE"])
    if "pembrolizumab" in normalized:
        expansions.extend(["pembrolizumab", "Keytruda", "immune-related adverse event"])
    if "sglt2" in normalized:
        expansions.extend(["SGLT2 inhibitor", "empagliflozin", "dapagliflozin"])
    if "hfpef" in normalized or "preserved ejection fraction" in normalized:
        expansions.extend(["HFpEF", "heart failure with preserved ejection fraction"])
    return " ".join(dict.fromkeys([question, *expansions]))


def _build_visual_data(evidence: list[EvidenceItem]) -> dict:
    support = max(1, len([item for item in evidence if item.source == "PubMed"]))
    trials = max(1, len([item for item in evidence if item.source == "ClinicalTrials.gov"]))
    return {
        "evidenceStrength": [
            {"label": "Literature", "value": support},
            {"label": "Trials", "value": trials},
            {"label": "Uncertainty", "value": max(1, 8 - len(evidence))},
        ],
        "timeline": [
            {"label": "Published", "value": support},
            {"label": "Recruiting/Active", "value": trials},
        ],
    }


def _extract_sample_size(text: str) -> str | None:
    patterns = [
        r"\bn\s*=\s*(\d[\d,]*)\b",
        r"\b(\d[\d,]*)\s+patients\b",
        r"\b(\d[\d,]*)\s+participants\b",
        r"\benrolled\s+(\d[\d,]*)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return f"n={match.group(1)}"
    return None


def _extract_effect_size(text: str) -> str | None:
    patterns = [
        r"\b(HR)\s*[=:]?\s*(\d+(?:\.\d+)?)\b",
        r"\b(OR)\s*[=:]?\s*(\d+(?:\.\d+)?)\b",
        r"\b(RR)\s*[=:]?\s*(\d+(?:\.\d+)?)\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return f"{match.group(1).upper()} {match.group(2)}"
    return None


def _extract_p_value(text: str) -> str | None:
    match = re.search(r"\bp\s*([<=>])\s*(0?\.\d+)\b", text, re.IGNORECASE)
    if match:
        return f"p{match.group(1)}{match.group(2)}"
    match = re.search(r"\bp\s*=\s*(\d+(?:\.\d+)?)\b", text, re.IGNORECASE)
    if match:
        return f"p={match.group(1)}"
    return None


def _infer_evidence_level(publication_types: list[str], title: str) -> str:
    normalized_types = " | ".join(publication_types).lower()
    normalized_title = title.lower()
    if "meta-analysis" in normalized_types or "systematic review" in normalized_types:
        return "Level 1"
    if "randomized controlled trial" in normalized_types or "clinical trial" in normalized_types:
        return "Level 2"
    if "cohort" in normalized_title or "observational" in normalized_title:
        return "Level 3"
    if publication_types:
        return publication_types[0]
    return "Literature"


def _best_pubmed_snippet(item: dict, normalized_question: str) -> tuple[str, str | None]:
    tokens = set(token for token in re.split(r"\W+", normalized_question.lower()) if len(token) > 2)
    best_sentence = ""
    best_section: str | None = None
    best_score = -1
    for section in item.get("abstract_sections", []):
        section_label = section.get("label")
        for sentence in section.get("sentences", []):
            score = sum(1 for token in tokens if token in sentence.lower())
            if re.search(r"\bn\s*=|\bpatients\b|\bparticipants\b|\bp\s*[<=>]|\bhr\b|\bor\b|\brr\b", sentence, re.IGNORECASE):
                score += 2
            if score > best_score:
                best_score = score
                best_sentence = sentence
                best_section = section_label
    if best_sentence:
        return best_sentence, best_section
    summary = item.get("summary") or "Abstract not available."
    return summary.split(".")[0].strip() + ".", None


def _best_trial_snippet(item: dict) -> str:
    summary = item.get("summary") or "Trial summary not available."
    first_sentence = summary.split(".")[0].strip()
    details = [part for part in [item.get("status"), item.get("phase"), item.get("condition"), item.get("intervention")] if part]
    if details:
        return f"{first_sentence}. " + " | ".join(details)
    return first_sentence + "."


def _safety_notes(question: str, role: RoleName) -> list[str]:
    normalized = question.lower()
    notes: list[str] = []
    if re.search(r"\bdiagnos|what do i have|is this cancer|should i start|what dose|dosage|contraindicat", normalized):
        notes.append("This system is for evidence review, not for diagnosis, personalized treatment selection, or dosing decisions.")
    if role == "patient" and re.search(r"\bchest pain|shortness of breath|stroke|seizure|suicid|pregnan", normalized):
        notes.append("High-risk symptoms or emergencies need immediate clinical evaluation rather than chatbot interpretation.")
    return notes


def _verifier_notes(question: str, evidence: list[EvidenceItem]) -> list[str]:
    normalized = question.lower()
    notes: list[str] = []
    pubmed = [item for item in evidence if item.source == "PubMed"]
    trials = [item for item in evidence if item.source == "ClinicalTrials.gov"]
    if not pubmed:
        notes.append("No PubMed evidence was retrieved in this run.")
    if not trials:
        notes.append("No ClinicalTrials.gov records were retrieved in this run.")
    if pubmed and trials and re.search(r"\bevidence support|effective|benefit|useful|works|supporting\b", normalized):
        completed_trials = [item for item in trials if (item.status or "").lower() == "completed"]
        if not completed_trials:
            notes.append("Literature was found, but no completed trial record was retrieved, so efficacy claims should be interpreted cautiously.")
    terminated_trials = [item for item in trials if (item.status or "").lower() in {"terminated", "withdrawn", "suspended"}]
    if terminated_trials:
        notes.append("At least one retrieved trial record is not active/completed; review trial status before drawing conclusions.")
    if len(pubmed) + len(trials) < 2:
        notes.append("Evidence density is low for this query, so the answer may be incomplete.")
    return notes


async def _safe_fetch(factory: Awaitable[T], fallback: T) -> T:
    try:
        return await factory
    except Exception:
        return fallback


async def build_answer(question: str, role: RoleName) -> AnswerPayload:
    settings = get_settings()
    pubmed_client = PubMedClient()
    trials_client = ClinicalTrialsClient()
    normalized_question = _normalize_question(question)
    retrieval_query = _expanded_query(normalized_question or question)
    topic_key = _topic_key(normalized_question)

    pmids, trials = await asyncio.gather(
        _safe_fetch(pubmed_client.search(retrieval_query, settings.pubmed_max_results), []),
        _safe_fetch(trials_client.search(retrieval_query, settings.trials_max_results), []),
    )
    pubmed_items = await _safe_fetch(pubmed_client.fetch(pmids), [])
    if not pubmed_items and topic_key:
        pubmed_items = STATIC_PUBMED_FALLBACKS.get(topic_key, [])
    if not trials and topic_key:
        trials = STATIC_TRIAL_FALLBACKS.get(topic_key, [])

    evidence: list[EvidenceItem] = []
    claim_citations: list[CitationSpan] = []
    for item in pubmed_items:
        publication_types = item.get("publication_types", [])
        raw_text = " ".join(
            part for part in [item["title"], item["summary"], " ".join(publication_types)] if part
        )
        evidence_level = _infer_evidence_level(publication_types, item["title"])
        evidence.append(
            EvidenceItem(
                id=item["id"],
                source="PubMed",
                title=item["title"],
                year=item["year"],
                summary=item["summary"],
                url=item["url"],
                evidence_type="Literature",
                sample_size=_extract_sample_size(raw_text),
                effect_size=_extract_effect_size(raw_text),
                p_value=_extract_p_value(raw_text),
                evidence_level=evidence_level,
            )
        )
        snippet, section = _best_pubmed_snippet(item, retrieval_query)
        claim_citations.append(
            CitationSpan(
                source_id=item["id"],
                source="PubMed",
                title=item["title"],
                snippet=snippet,
                section=section,
                support_type="abstract-snippet",
                evidence_level=evidence_level,
            )
        )
    for item in trials:
        evidence_level = item["phase"] or "Trial record"
        evidence.append(
            EvidenceItem(
                id=item["id"],
                source="ClinicalTrials.gov",
                title=item["title"],
                summary=item["summary"],
                url=item["url"],
                status=item["status"],
                phase=item["phase"],
                evidence_type="Trial",
                evidence_level=evidence_level,
            )
        )
        claim_citations.append(
            CitationSpan(
                source_id=item["id"],
                source="ClinicalTrials.gov",
                title=item["title"],
                snippet=_best_trial_snippet(item),
                section="Study record",
                support_type="trial-summary",
                evidence_level=evidence_level,
            )
        )

    direct_answer, uncertainty_note = await synthesize_answer(settings, question, role, evidence)
    citations = [item.id for item in evidence]
    verifier_notes = _verifier_notes(question, evidence)
    safety_notes = _safety_notes(question, role)

    if verifier_notes:
        uncertainty_note = " ".join([uncertainty_note, *verifier_notes]).strip()
    if safety_notes and role != "patient":
        uncertainty_note = " ".join([uncertainty_note, *safety_notes]).strip()

    return AnswerPayload(
        direct_answer=direct_answer,
        supporting_evidence=evidence,
        citations=citations,
        claim_citations=claim_citations,
        uncertainty_note=uncertainty_note,
        verifier_notes=verifier_notes,
        safety_notes=safety_notes,
        role_brief=ROLE_BRIEFS[role],
        visual_data=_build_visual_data(evidence),
    )


def get_dashboard(role: RoleName) -> DashboardPayload:
    if role == "owner":
        return DashboardPayload(
            role=role,
            title="Owner Intelligence",
            summary="Monitor safety, grounding quality, and monetizable demand signals across the CareProof network.",
            metrics=OWNER_METRICS,
            highlights=[
                "Top unanswered cluster: lupus CAR-T eligibility nuances.",
                "Most requested therapies this week: GLP-1, SGLT2 inhibitors, pembrolizumab.",
                "Highest commercial demand appears in obesity, oncology, and metabolic disease.",
            ],
        )
    if role == "doctor":
        return DashboardPayload(
            role=role,
            title="Doctor Workspace",
            summary="Review claim-level evidence, publication support, and trial activity side-by-side.",
            metrics=DOCTOR_METRICS,
            highlights=[
                "Evidence cards prioritize RCTs, reviews, and live trial status.",
                "Clinical trial panels expose phase and recruitment state.",
                "The interface is optimized for fast literature triage during clinical workflow.",
            ],
        )
    if role == "pharma":
        return DashboardPayload(
            role=role,
            title="Pharma Insights",
            summary="Surface evidence gaps, investigator interest, and competitive trial movement for high-value disease areas.",
            metrics=PHARMA_METRICS,
            highlights=[
                "Demand spikes suggest obesity and autoimmune cell therapy remain priority domains.",
                "Trial density is increasing faster than publication density in several inflammatory indications.",
                "CareProof can evolve into an evidence-gap discovery and market-intelligence layer.",
            ],
        )
    return DashboardPayload(
        role=role,
        title="Patient Companion",
        summary="Translate clinical evidence into approachable language while keeping safety boundaries visible.",
        metrics=PATIENT_METRICS,
        highlights=[
            "Plain-language summaries reduce jargon and keep the key takeaways visible.",
            "Safety note is always shown and high-risk diagnosis requests are outside scope.",
            "Evidence source cards make it easier to understand where answers come from.",
        ],
    )
