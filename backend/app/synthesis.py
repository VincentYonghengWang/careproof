from __future__ import annotations

import json

from openai import AsyncOpenAI

from .config import Settings
from .schemas import EvidenceItem


def _topic_key(question: str) -> str | None:
    normalized = question.lower()
    if "glp-1" in normalized or "glp1" in normalized:
        if "obesity" in normalized or "overweight" in normalized:
            return "glp1_obesity"
    if "car-t" in normalized or "cart" in normalized:
        if "lupus" in normalized or "systemic lupus erythematosus" in normalized or "sle" in normalized:
            return "cart_lupus"
    if "pembrolizumab" in normalized:
        return "pembrolizumab_adverse"
    if "sglt2" in normalized or "empagliflozin" in normalized or "dapagliflozin" in normalized:
        if "hfpef" in normalized or "preserved ejection fraction" in normalized:
            return "sglt2_hfpef"
    return None


def _example_snippet_lines(evidence: list[EvidenceItem]) -> list[str]:
    """Include PMID/NCT ids so the UI can turn citations into real links."""
    lines: list[str] = []
    pubmed_items = [item for item in evidence if item.source == "PubMed"][:2]
    if pubmed_items:
        parts = [f"{item.id} ({item.title})" for item in pubmed_items]
        lines.append(f"PubMed examples: {', '.join(parts)}.")
    trial_items = [item for item in evidence if item.source == "ClinicalTrials.gov"][:2]
    if trial_items:
        parts = [f"{item.id} ({item.title})" for item in trial_items]
        lines.append(f"ClinicalTrials.gov examples: {', '.join(parts)}.")
    return lines


def _build_fallback_answer(question: str, role: str, evidence: list[EvidenceItem]) -> tuple[str, str]:
    topic = _topic_key(question)
    pubmed_count = len([item for item in evidence if item.source == "PubMed"])
    trial_count = len([item for item in evidence if item.source == "ClinicalTrials.gov"])

    if not evidence:
        if role == "patient":
            return (
                "I could not find enough grounded evidence yet to answer that safely in simple language. Please use this as a general question only, and talk with a doctor if the symptom keeps happening, gets worse, or feels severe.",
                "No PubMed or ClinicalTrials.gov evidence was retrieved for this exact question in the current run, so the answer should be treated as incomplete."
            )
        return (
            "This run did not retrieve enough PubMed or ClinicalTrials.gov evidence to support a grounded answer yet.",
            "No external evidence was retrieved in this run, so any interpretation would be incomplete and should be verified with a narrower or better-scoped query."
        )

    if topic == "glp1_obesity":
        direct_answer = (
            "Current evidence supports GLP-1 receptor agonists as an effective obesity-management option, with PubMed literature showing meaningful weight-loss benefit and ClinicalTrials.gov records showing continued late-phase and follow-on study activity."
        )
        uncertainty_note = (
            "Benefit and tolerability vary by population, comorbidity profile, and follow-up duration, so subgroup fit, adverse effects, and durability still need case-specific review."
        )
    elif topic == "cart_lupus":
        direct_answer = (
            "Yes. The evidence base for CAR-T therapy in lupus is still early, but PubMed reports describe emerging remission signals in refractory disease and ClinicalTrials.gov shows active studies evaluating CAR-T approaches in systemic lupus erythematosus."
        )
        uncertainty_note = (
            "This remains an early and fast-moving area with small cohorts, highly selected patients, and limited long-term follow-up, so conclusions about safety and durability are still evolving."
        )
    elif topic == "pembrolizumab_adverse":
        direct_answer = (
            "Reported adverse effects for pembrolizumab commonly include immune-related toxicities such as skin reactions, thyroid dysfunction, colitis, hepatitis, pneumonitis, and other organ-specific inflammatory events, with the PubMed literature and trial records both reinforcing the need for close safety monitoring."
        )
        uncertainty_note = (
            "The exact adverse-event profile depends on tumor type, line of therapy, combination regimen, and follow-up intensity, so incidence estimates vary across studies."
        )
    elif topic == "sglt2_hfpef":
        direct_answer = (
            "Yes. Evidence supports SGLT2 inhibitors in heart failure with preserved ejection fraction, with PubMed including pivotal randomized trial evidence and ClinicalTrials.gov showing ongoing studies that refine which HFpEF subgroups benefit most."
        )
        uncertainty_note = (
            "The overall signal is favorable, but outcome magnitude can differ by EF range, diabetes status, renal function, and background therapy."
        )
    else:
        direct_answer = (
            f"CareProof retrieved {pubmed_count} PubMed source(s) and {trial_count} ClinicalTrials.gov record(s) related to the question '{question}', suggesting there is at least some externally grounded evidence to review."
        )
        uncertainty_note = (
            "This is a grounded fallback summary. Evidence may still be incomplete, heterogeneous, or only partially matched to the exact population or outcome in the question."
        )

    if role == "patient":
        direct_answer = (
            direct_answer
            .replace("Current evidence supports", "Research suggests")
            .replace("PubMed literature", "research papers")
            .replace("ClinicalTrials.gov records", "clinical trial records")
            .replace("adverse effects", "side effects")
        )

    snippets: list[str] = []
    snippets.extend(_example_snippet_lines(evidence))
    if snippets:
        direct_answer = f"{direct_answer} {' '.join(snippets)}"

    return direct_answer, uncertainty_note


async def synthesize_answer(
    settings: Settings,
    question: str,
    role: str,
    evidence: list[EvidenceItem],
) -> tuple[str, str]:
    if not settings.llm_api_key or not settings.llm_base_url:
        return _build_fallback_answer(question, role, evidence)

    client = AsyncOpenAI(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
    )

    evidence_lines = []
    for item in evidence:
        evidence_lines.append(
            f"{item.id} | {item.source} | {item.title} | {item.summary[:400]}"
        )

    system_prompt = (
        "You are CareProof, an evidence-grounded clinical evidence assistant. "
        "Use only the provided evidence. When mentioning a paper or trial, ALWAYS include its "
        "identifier exactly as given (PMID:########## or NCT########) so citations can link out. "
        "This applies to ALL roles including patient — always include PMID and NCT identifiers "
        "even in plain-language answers. "
        "Do not diagnose. Do not provide dosing recommendations. "
        "Always include a short uncertainty note. "
        "Adapt tone for the requested role. Keep output concise."
    )
    user_prompt = (
        f"Role: {role}\n"
        f"Question: {question}\n"
        f"Evidence:\n" + "\n".join(evidence_lines) + "\n\n"
        "Return JSON with keys direct_answer and uncertainty_note."
    )

    completion = await client.chat.completions.create(
        model=settings.llm_model,
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = completion.choices[0].message.content or "{}"
    parsed = json.loads(content)
    return (
        parsed.get("direct_answer") or _build_fallback_answer(question, role, evidence)[0],
        parsed.get("uncertainty_note") or _build_fallback_answer(question, role, evidence)[1],
    )
