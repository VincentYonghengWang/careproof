from functools import lru_cache
from pydantic import BaseModel
import os


class Settings(BaseModel):
    app_name: str = "CareProof"
    llm_base_url: str | None = os.getenv("CAREPROOF_LLM_BASE_URL")
    llm_api_key: str | None = os.getenv("CAREPROOF_LLM_API_KEY")
    llm_model: str = os.getenv("CAREPROOF_LLM_MODEL", "qwen3.5")
    elevenlabs_api_key: str | None = os.getenv("CAREPROOF_ELEVENLABS_API_KEY") or os.getenv("ELEVENLABS_API_KEY")
    elevenlabs_stt_model: str = os.getenv("CAREPROOF_ELEVENLABS_STT_MODEL", "scribe_v2")
    pubmed_max_results: int = int(os.getenv("CAREPROOF_PUBMED_MAX_RESULTS", "5"))
    trials_max_results: int = int(os.getenv("CAREPROOF_TRIALS_MAX_RESULTS", "5"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
