import { useEffect, useState, type ChangeEvent } from "react";

type Role = "owner" | "doctor" | "pharma" | "patient";
type UploadCategory = "pdf" | "word" | "image" | "other";

type MetricCard = {
  label: string;
  value: string;
  delta: string;
};

type DashboardPayload = {
  role: Role;
  title: string;
  summary: string;
  metrics: MetricCard[];
  highlights: string[];
};

type EvidenceItem = {
  id: string;
  source: "PubMed" | "ClinicalTrials.gov";
  title: string;
  year?: number | null;
  summary: string;
  url?: string | null;
  status?: string | null;
  phase?: string | null;
  evidence_type?: string | null;
};

type AnswerPayload = {
  direct_answer: string;
  supporting_evidence: EvidenceItem[];
  citations: string[];
  uncertainty_note: string;
  role_brief: string;
  visual_data: {
    evidenceStrength: { label: string; value: number }[];
    timeline: { label: string; value: number }[];
  };
};

type UploadItem = {
  name: string;
  media_type: string;
  size_bytes: number;
  category: UploadCategory;
};

type UploadResponse = {
  files: UploadItem[];
};

type TranscriptionResponse = {
  text: string;
  provider: string;
  model?: string | null;
  note?: string | null;
};

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  doctor: "Doctor",
  pharma: "Pharma",
  patient: "Patient"
};

const EXAMPLE_QUESTIONS = [
  "What is the current evidence for GLP-1 receptor agonists in obesity management?",
  "Are there active clinical trials for CAR-T therapy in lupus?",
  "What are the common adverse effects reported for pembrolizumab?",
  "Is there evidence supporting SGLT2 inhibitors in heart failure with preserved ejection fraction?"
];

const API_BASE = "http://localhost:8000";

function App() {
  const [role, setRole] = useState<Role>("doctor");
  const [question, setQuestion] = useState(EXAMPLE_QUESTIONS[0]);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [answer, setAnswer] = useState<AnswerPayload | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Audio input is ready when ElevenLabs is configured.");
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const fetchDashboard = async () => {
      setDashboardLoading(true);
      try {
        const response = await fetch(`${API_BASE}/api/dashboard/${role}`);
        const data = (await response.json()) as DashboardPayload;
        setDashboard(data);
      } finally {
        setDashboardLoading(false);
      }
    };
    void fetchDashboard();
  }, [role]);

  const submitQuestion = async () => {
    setLoading(true);
    setStatusMessage("CareProof is retrieving evidence...");
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ question, role })
      });
      const data = (await response.json()) as AnswerPayload;
      setAnswer(data);
      setStatusMessage("Evidence retrieval complete.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));
    setUploading(true);
    setStatusMessage("Uploading supporting files...");
    try {
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as UploadResponse;
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      setUploadedFiles(data.files);
      setStatusMessage("Files uploaded. You can now ask a question with document context.");
    } catch (error) {
      setStatusMessage("Upload failed. Please use PDF, Word, or image files.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleAudioInput = async () => {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setStatusMessage("This browser does not support in-browser audio capture.");
      return;
    }

    setTranscribing(true);
    setRecording(true);
    setStatusMessage("Recording for 5 seconds...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      const completion = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          resolve(new Blob(chunks, { type: "audio/webm" }));
        };
      });

      recorder.start();
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
      recorder.stop();
      const audioBlob = await completion;

      const formData = new FormData();
      formData.append("file", audioBlob, "careproof-question.webm");
      setStatusMessage("Sending audio to ElevenLabs for transcription...");

      const response = await fetch(`${API_BASE}/api/transcribe`, {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as TranscriptionResponse | { detail?: string };
      if (!response.ok) {
        const detail = "detail" in data ? data.detail : "Audio transcription failed.";
        throw new Error(detail ?? "Audio transcription failed.");
      }
      setQuestion((data as TranscriptionResponse).text);
      setStatusMessage(`Transcription ready from ${(data as TranscriptionResponse).provider}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Audio transcription failed.");
    } finally {
      setRecording(false);
      setTranscribing(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-kicker">Evidence-grounded clinical intelligence</div>
          <h1>CareProof</h1>
          <p>
            A dual-source clinical evidence demo that retrieves from PubMed and
            ClinicalTrials.gov, then adapts the experience for different stakeholders.
          </p>
        </div>

        <div className="role-switcher">
          {(["patient", "doctor", "pharma", "owner"] as Role[]).map((item) => (
            <button
              key={item}
              className={item === role ? "role-button active" : "role-button"}
              onClick={() => setRole(item)}
              type="button"
            >
              {ROLE_LABELS[item]}
            </button>
          ))}
        </div>

        <div className="question-panel">
          <div className="panel-title">Demo Prompts</div>
          {EXAMPLE_QUESTIONS.map((item) => (
            <button
              key={item}
              className={item === question ? "example-button active" : "example-button"}
              onClick={() => setQuestion(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </aside>

      <main className="main-grid">
        <section className="hero-card">
          <div className="hero-copy">
            <div className="eyebrow">{ROLE_LABELS[role]} facing experience</div>
            <h2>{dashboard?.title ?? "Loading role view..."}</h2>
            <p>{dashboardLoading ? "Loading workspace context..." : dashboard?.summary}</p>
          </div>
          <div className="hero-meta">
            <div className="meta-badge">Model path: Qwen3.5-ready</div>
            <div className="meta-badge">Sources: PubMed + ClinicalTrials.gov</div>
            <div className="meta-badge">Safety: Non-diagnostic by design</div>
          </div>
        </section>

        <section className="chat-card">
          <div className="panel-header">
            <div>
              <div className="panel-title">Clinical Question</div>
              <div className="panel-subtitle">
                The backend retrieves both required sources before answering.
              </div>
            </div>
          </div>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            className="question-input"
          />
          <div className="composer-tools">
            <label className="upload-button" htmlFor="file-upload">
              {uploading ? "Uploading..." : "Upload Word / PDF / Images"}
            </label>
            <input
              id="file-upload"
              type="file"
              className="hidden-input"
              multiple
              accept=".pdf,.doc,.docx,image/*"
              onChange={handleUpload}
            />
          </div>
          {uploadedFiles.length > 0 ? (
            <div className="upload-list">
              {uploadedFiles.map((item) => (
                <div key={`${item.name}-${item.size_bytes}`} className="upload-pill">
                  {item.category}: {item.name}
                </div>
              ))}
            </div>
          ) : null}
          <div className="composer-actions">
            <button
              className={recording ? "secondary-button recording" : "secondary-button"}
              type="button"
              onClick={handleAudioInput}
              disabled={transcribing}
            >
              {transcribing ? "Audio..." : "Ask by Audio"}
            </button>
            <button className="primary-button" type="button" onClick={submitQuestion} disabled={loading}>
              {loading ? "Retrieving evidence..." : "Run Proof"}
            </button>
          </div>
          <div className="status-line">{statusMessage}</div>
          {answer ? (
            <div className="answer-block">
              <div className="role-brief">{answer.role_brief}</div>
              <h3>Direct Answer</h3>
              <p>{answer.direct_answer}</p>
              <div className="uncertainty-box">
                <strong>Uncertainty and limitations:</strong> {answer.uncertainty_note}
              </div>
              <div className="citation-strip">
                {answer.citations.map((citation) => (
                  <span key={citation} className="citation-pill">
                    {citation}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              Choose a role, pick one of the company-required examples, and run the demo.
            </div>
          )}
        </section>

        <section className="metrics-card">
          <div className="panel-title">Role Dashboard</div>
          <div className="metric-grid">
            {dashboard?.metrics.map((metric) => (
              <div key={metric.label} className="metric-item">
                <div className="metric-label">{metric.label}</div>
                <div className="metric-value">{metric.value}</div>
                <div className="metric-delta">{metric.delta}</div>
              </div>
            ))}
          </div>
          <div className="highlights-list">
            {dashboard?.highlights.map((highlight) => (
              <div key={highlight} className="highlight-row">
                {highlight}
              </div>
            ))}
          </div>
        </section>

        <section className="visual-card">
          <div className="panel-header">
            <div>
              <div className="panel-title">Evidence Snapshot</div>
              <div className="panel-subtitle">A lightweight owner/doctor/pharma/patient visual layer.</div>
            </div>
          </div>
          <div className="bars">
            {(answer?.visual_data.evidenceStrength ?? []).map((item) => (
              <div key={item.label} className="bar-row">
                <span>{item.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.min(item.value * 18, 100)}%` }} />
                </div>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="evidence-card">
          <div className="panel-header">
            <div>
              <div className="panel-title">Supporting Evidence</div>
              <div className="panel-subtitle">
                Every answer shows source identifiers from both required systems.
              </div>
            </div>
          </div>
          <div className="evidence-list">
            {answer?.supporting_evidence.map((item) => (
              <article key={`${item.source}-${item.id}`} className="evidence-item">
                <div className="evidence-topline">
                  <span className="source-tag">{item.source}</span>
                  <span className="evidence-id">{item.id}</span>
                  {item.phase ? <span className="status-tag">{item.phase}</span> : null}
                  {item.status ? <span className="status-tag">{item.status}</span> : null}
                </div>
                <h4>{item.title}</h4>
                <p>{item.summary}</p>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer">
                    Open source
                  </a>
                ) : null}
              </article>
            )) ?? <div className="empty-state">Evidence cards appear after running a question.</div>}
          </div>
        </section>

        <section className="footer-card">
          <div className="panel-title">Safety Boundary</div>
          <p>
            CareProof is designed for evidence review and explanation. It does not provide
            diagnosis, treatment decisions, or dosing recommendations. Clinical decisions
            should be made by licensed professionals.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
