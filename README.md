# CareProof

CareProof is a demo clinical evidence workspace that answers clinical questions with evidence retrieved from both PubMed and ClinicalTrials.gov.

The demo includes:

- A Python FastAPI backend
- A React + TypeScript frontend
- Owner, Doctor, Pharma, and Patient facing views
- Evidence-grounded answer generation with source identifiers
- A configurable synthesis layer intended for Qwen-based models

## Structure

- `backend/`: FastAPI service and evidence pipeline
- `frontend/`: Vite React application

## Quick start

### Backend

```bash
cd /Users/yonghengwang/Downloads/careproof/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd /Users/yonghengwang/Downloads/careproof/frontend
npm install
npm run dev
```

## Environment variables

The backend can work in two modes:

1. `Fallback mode`: no model key required, answer synthesis is templated from retrieved evidence
2. `LLM mode`: uses an OpenAI-compatible endpoint that can point to a Qwen deployment

Example backend environment:

```bash
export CAREPROOF_LLM_BASE_URL="https://your-openai-compatible-endpoint/v1"
export CAREPROOF_LLM_API_KEY="your-api-key"
export CAREPROOF_LLM_MODEL="qwen3.5"
```

If these variables are missing, CareProof still returns grounded demo answers based on retrieved evidence.

## ElevenLabs audio question input

CareProof now includes an audio question button in the UI.

To enable real speech-to-text transcription, set:

```bash
export CAREPROOF_ELEVENLABS_API_KEY="your-elevenlabs-api-key"
export CAREPROOF_ELEVENLABS_STT_MODEL="scribe_v2"
```

Implementation notes:

- The frontend records audio with `MediaRecorder`
- The browser uploads the audio blob to `POST /api/transcribe`
- The backend forwards the file to ElevenLabs Speech-to-Text
- The transcript is inserted into the chat box so the user can edit it before running proof

Official ElevenLabs Speech-to-Text docs:

- API reference: `POST https://api.elevenlabs.io/v1/speech-to-text`
- Required header: `xi-api-key`
- Required form field: `model_id=scribe_v2`

If the ElevenLabs key is not set, the UI still renders the audio control but the backend will return a clear configuration error.

## File uploads

CareProof accepts:

- Word: `.doc`, `.docx`
- PDF: `.pdf`
- Images: common image formats such as `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`
