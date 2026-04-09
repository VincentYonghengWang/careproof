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


class AnswerPayload(BaseModel):
    direct_answer: str
    supporting_evidence: list[EvidenceItem]
    citations: list[str]
    uncertainty_note: str
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
