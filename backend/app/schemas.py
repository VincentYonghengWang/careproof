from typing import Literal
from pydantic import BaseModel, Field


RoleName = Literal["owner", "doctor", "pharma", "patient"]


class ChatRequest(BaseModel):
    question: str = Field(min_length=5, max_length=2000)
    role: RoleName = "doctor"


class EvidenceItem(BaseModel):
    id: str
    source: Literal["PubMed", "ClinicalTrials.gov"]
    title: str
    year: int | None = None
    summary: str
    url: str | None = None
    status: str | None = None
    phase: str | None = None
    evidence_type: str | None = None
    sample_size: str | None = None
    effect_size: str | None = None
    p_value: str | None = None
    evidence_level: str | None = None


class CitationSpan(BaseModel):
    source_id: str
    source: Literal["PubMed", "ClinicalTrials.gov"]
    title: str
    snippet: str
    section: str | None = None
    support_type: Literal["abstract-snippet", "trial-summary", "summary-snippet"] = "summary-snippet"
    figure_label: str | None = None
    table_label: str | None = None
    evidence_level: str | None = None


class AnswerPayload(BaseModel):
    direct_answer: str
    supporting_evidence: list[EvidenceItem]
    citations: list[str]
    claim_citations: list[CitationSpan] = Field(default_factory=list)
    uncertainty_note: str
    verifier_notes: list[str] = Field(default_factory=list)
    safety_notes: list[str] = Field(default_factory=list)
    role_brief: str
    visual_data: dict


class MetricCard(BaseModel):
    label: str
    value: str
    delta: str


class DashboardPayload(BaseModel):
    role: RoleName
    title: str
    summary: str
    metrics: list[MetricCard]
    highlights: list[str]


class UploadItem(BaseModel):
    name: str
    media_type: str
    size_bytes: int
    category: Literal["pdf", "word", "image", "other"]


class UploadResponse(BaseModel):
    files: list[UploadItem]


class TranscriptionResponse(BaseModel):
    text: str
    provider: str
    model: str | None = None
    note: str | None = None
