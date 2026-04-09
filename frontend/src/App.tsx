import { useEffect, useState, type ChangeEvent, type SVGProps } from "react";

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

const ROLE_ORDER: Role[] = ["patient", "doctor", "pharma", "owner"];

const EXAMPLE_QUESTIONS = [
  "What is the current evidence for GLP-1 receptor agonists in obesity management?",
  "Are there active clinical trials for CAR-T therapy in lupus?",
  "What are the common adverse effects reported for pembrolizumab?",
  "Is there evidence supporting SGLT2 inhibitors in heart failure with preserved ejection fraction?"
];

const API_BASE = "http://localhost:8000";

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M12 4v16" />
      <path d="M4 12h16" />
    </svg>
  );
}

function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

function SparkleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M12 3l1.8 4.6L18 9.4l-4.2 1.6L12 16l-1.8-5L6 9.4l4.2-1.8L12 3Z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </svg>
  );
}

function RouteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 18h5a3 3 0 0 0 3-3V8" />
      <path d="m13 8 3-3 3 3" />
    </svg>
  );
}

function RingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
    </svg>
  );
}

function MicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </svg>
  );
}

function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

function App() {
  const [role, setRole] = useState<Role>("patient");
  const [question, setQuestion] = useState(EXAMPLE_QUESTIONS[0]);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [answer, setAnswer] = useState<AnswerPayload | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Ask anything with text, voice, PDF, Word, or images.");
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
    } catch (error) {
      setStatusMessage("CareProof could not complete the evidence run.");
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
      setStatusMessage("Files uploaded. Add your question and run proof.");
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
            A dual-source clinical evidence workspace with a chat-style composer,
            role-aware views, and live evidence cards.
          </p>
        </div>

        <div className="role-switcher">
          {ROLE_ORDER.map((item) => (
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
          <div className="panel-title">Example Questions</div>
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

      <main className="workspace">
        <section className="results-column">
          <div className="hero-card">
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
          </div>

          {answer ? (
            <section className="answer-card">
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
            </section>
          ) : (
            <section className="empty-state large">
              Result cards will appear here. Pick a role, use one of the example prompts or ask your own question, then run proof.
            </section>
          )}

          <section className="dashboard-grid">
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
              <div className="panel-title">Evidence Snapshot</div>
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
          </section>

          <section className="evidence-card">
            <div className="panel-title">Supporting Evidence</div>
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
        </section>

        <div className="composer-dock">
          {uploadedFiles.length > 0 ? (
            <div className="upload-list">
              {uploadedFiles.map((item) => (
                <div key={`${item.name}-${item.size_bytes}`} className="upload-pill">
                  {item.category}: {item.name}
                </div>
              ))}
            </div>
          ) : null}

          <div className="status-line">{statusMessage}</div>

          <section className="composer-card">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="question-input chatgpt-style"
              placeholder="Ask anything"
            />

            <div className="composer-toolbar">
              <div className="composer-left">
                <label className="icon-button" htmlFor="file-upload" title="Upload files">
                  <PlusIcon className="toolbar-icon" />
                </label>
                <input
                  id="file-upload"
                  type="file"
                  className="hidden-input"
                  multiple
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={handleUpload}
                />
                <button className="icon-button" type="button" title="Connected sources">
                  <GlobeIcon className="toolbar-icon" />
                </button>
                <button className="icon-button" type="button" title="Evidence mode">
                  <SparkleIcon className="toolbar-icon" />
                </button>
                <button className="icon-button" type="button" title="Structured retrieval">
                  <RouteIcon className="toolbar-icon" />
                </button>
                <button className="mode-pill" type="button">
                  Auto
                </button>
              </div>

              <div className="composer-right">
                <button className="icon-button" type="button" title="Focus mode">
                  <RingIcon className="toolbar-icon" />
                </button>
                <button
                  className={recording ? "icon-button recording" : "icon-button"}
                  type="button"
                  title="Ask by audio"
                  onClick={handleAudioInput}
                  disabled={transcribing}
                >
                  <MicIcon className="toolbar-icon" />
                </button>
                <button
                  className="send-button"
                  type="button"
                  title="Run Proof"
                  onClick={submitQuestion}
                  disabled={loading || uploading}
                >
                  <SendIcon className="toolbar-icon send-icon" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
