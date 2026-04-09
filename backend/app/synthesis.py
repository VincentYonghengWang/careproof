from __future__ import annotations

from openai import AsyncOpenAI

from .config import Settings
from .schemas import EvidenceItem


def _build_fallback_answer(question: str, role: str, evidence: list[EvidenceItem]) -> tuple[str, str]:
    pubmed_titles = [item.title for item in evidence if item.source == "PubMed"][:2]
    trial_titles = [item.title for item in evidence if item.source == "ClinicalTrials.gov"][:2]
    direct_answer = (
        f"CareProof found relevant published literature and active or completed trial records for the question: "
        f"'{question}'. The current evidence suggests the topic is supported by peer-reviewed findings in PubMed "
        f"and complemented by ClinicalTrials.gov records that indicate the trial landscape, status, and ongoing evidence generation."
    )
    uncertainty_note = (
        "This is a grounded demo summary. Evidence may be incomplete, heterogenous, or not perfectly matched to the exact patient subgroup. "
        "Clinical interpretation should confirm population fit, outcomes, and trial status."
    )
    if role == "patient":
        direct_answer = (
            "CareProof found research papers and clinical trial records related to your question. "
            "The evidence points to meaningful ongoing research, but the strength of evidence can vary depending on the exact condition, patient type, and outcome being asked about."
        )
    if pubmed_titles or trial_titles:
        snippets = []
        if pubmed_titles:
            snippets.append(f"PubMed examples include: {', '.join(pubmed_titles)}.")
        if trial_titles:
            snippets.append(f"ClinicalTrials.gov examples include: {', '.join(trial_titles)}.")
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
        "Use only the provided evidence. Cite PMID or NCT identifiers in the answer. "
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
    import json

    parsed = json.loads(content)
    return (
        parsed.get("direct_answer") or _build_fallback_answer(question, role, evidence)[0],
        parsed.get("uncertainty_note") or _build_fallback_answer(question, role, evidence)[1],
    )
