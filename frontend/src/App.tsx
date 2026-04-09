import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type SVGProps } from "react";

type Role = "owner" | "doctor" | "pharma" | "patient";
type UploadCategory = "pdf" | "word" | "image" | "other";
type AuthMode = "login" | "register";
type MessageSender = "user" | "assistant";
type ThemeMode = "light" | "dark";
type LlmModel = "Gemini 3.1" | "GPT-5.3" | "Opus 4.6" | "Qwen 3.5 Free";

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

type AuthUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  createdAt: string;
};

type ChatMessage = {
  id: string;
  sender: MessageSender;
  text: string;
  createdAt: string;
  roleSnapshot?: Role;
  uploads?: UploadItem[];
  answerPayload?: AnswerPayload;
};

type Conversation = {
  id: string;
  userId: string;
  title: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
};

type SpeechRecognitionEventLike = Event & {
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type RoleCopy = {
  title: string;
  subtitle: string;
  helper: string;
  inputPlaceholder: string;
  runProofLabel: string;
  uploadLabel: string;
  voiceLabel: string;
  helpTitle: string;
  helpBody: string;
};

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  doctor: "Doctor",
  pharma: "Pharma",
  patient: "Patient"
};

const ROLE_ORDER: Role[] = ["patient", "doctor", "pharma", "owner"];

const ROLE_COPY: Record<Role, RoleCopy> = {
  patient: {
    title: "Hello, let's talk about your health",
    subtitle: "Simple explanations, calm guidance, and no medical jargon.",
    helper: "This view keeps things easy to read for kids, older adults, and first-time users.",
    inputPlaceholder: "For example: Why do I feel dizzy so often?",
    runProofLabel: "Run Proof for simple guidance",
    uploadLabel: "Upload my health report",
    voiceLabel: "Hold to speak",
    helpTitle: "Patient guide",
    helpBody: "Ask a health question, upload a report, or use voice. CareProof will reply in plain language and tell you when it is important to see a doctor."
  },
  doctor: {
    title: "Clinical decision support workspace",
    subtitle: "Traceable evidence, claim-level citations, and conflict-aware synthesis.",
    helper: "Designed for dense evidence review, PICO framing, and defensible notes.",
    inputPlaceholder: "Example: GLP-1 in obesity",
    runProofLabel: "Run Proof for evidence retrieval",
    uploadLabel: "Import EHR or files",
    voiceLabel: "Dictate question",
    helpTitle: "Doctor guide",
    helpBody: "Use natural clinical queries or a PICO framing. Review PubMed and ClinicalTrials evidence side by side, then export a provenance-ready note."
  },
  pharma: {
    title: "Drug and trial landscape dashboard",
    subtitle: "Commercial and R&D intelligence from demand, gaps, trials, and safety signals.",
    helper: "Even when live feeds are sparse, the UI keeps placeholders visible so future value is legible.",
    inputPlaceholder: "Example: GLP-1 obesity evidence gaps in adolescents",
    runProofLabel: "Run Proof for landscape refresh",
    uploadLabel: "Upload internal deck or protocol",
    voiceLabel: "Capture market question",
    helpTitle: "Pharma guide",
    helpBody: "Filter by disease, drug class, and phase. Review mock and live cards for evidence gaps, competitor movement, demand signals, and trial status."
  },
  owner: {
    title: "System monitoring and data flywheel",
    subtitle: "Usage, quality, infra, and knowledge asset tracking in one control room.",
    helper: "This is the operational layer that turns product traffic into reusable performance and knowledge signals.",
    inputPlaceholder: "Example: Show quality risks in doctor queries this week",
    runProofLabel: "Run Proof for report generation",
    uploadLabel: "Import ops snapshot",
    voiceLabel: "Capture ops note",
    helpTitle: "Owner guide",
    helpBody: "Use this workspace to monitor visits, latency, costs, safety triggers, hallucination rate, and unanswered demand across roles."
  }
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8001";
const USERS_STORAGE_KEY = "careproof-users";
const ACTIVE_USER_STORAGE_KEY = "careproof-active-user";
const CONVERSATIONS_STORAGE_KEY = "careproof-conversations";
const THEME_STORAGE_KEY = "careproof-theme";

const ROLE_HEADER_TAGLINES: Record<Role, string[]> = {
  patient: ["Simple language", "Voice-friendly", "Gentle reminders"],
  doctor: ["Claim-level citation", "Conflict detection", "PICO-aligned"],
  pharma: ["Gap map", "Trial landscape", "Demand intelligence"],
  owner: ["Visits and DAU", "Infra telemetry", "Quality flywheel"]
};

const PATIENT_SUMMARY_CARDS = [
  { label: "Blood sugar", value: "5.2 mmol/L", status: "Normal" },
  { label: "Blood pressure", value: "128 / 82", status: "A little high" },
  { label: "Daily steps", value: "7,420", status: "On track" }
];

const PATIENT_TAKEAWAYS = ["Drink more water", "Avoid staying up late", "Recheck if it continues"];
const PATIENT_ASK_DOCTOR = [
  "Do I need medicine for this?",
  "What should I do when it happens again?",
  "When should I come in for a checkup?"
];

const PATIENT_HISTORY = [
  { time: "Today 9:10 AM", answer: "Rest more and watch symptoms." },
  { time: "Yesterday 7:42 PM", answer: "Your step goal looks steady." }
];

const DOCTOR_PICO = [
  { label: "P", value: "Adults with obesity, with or without T2D" },
  { label: "I", value: "GLP-1 receptor agonists" },
  { label: "C", value: "Placebo or standard weight-management care" },
  { label: "O", value: "Weight loss, cardiometabolic markers, adverse events" }
];

const DOCTOR_CONFLICT_BARS = [
  { label: "FOR", value: 78, count: 12 },
  { label: "AGAINST", value: 34, count: 5 }
];

const PHARMA_FILTERS = ["Obesity", "Metabolic disease", "GLP-1", "Phase 3", "Recruiting"];

const PHARMA_MODULES = [
  {
    title: "Evidence Gap Map",
    body: "Heatmap highlights obesity + hypertension subgroup as under-studied. Current signal: only one small-study cluster mapped.",
    placeholder: "No data yet — will be populated from aggregated queries"
  },
  {
    title: "Trial Landscape",
    body: "Phase distribution, recruiting status, duration, and key sites sit here in a table + chart pairing.",
    placeholder: "Data accumulating... live trial updates will appear here"
  },
  {
    title: "Adverse Event Demand",
    body: "Safety interest clusters around nausea, GI tolerability, and long-term adherence.",
    placeholder: "No data yet — will be populated from aggregated queries"
  },
  {
    title: "Top Unmet Questions",
    body: "Child safety, long-term durability, and subgroup dosing continue to surface as demand peaks.",
    placeholder: "Data accumulating... market demand signals are being aggregated"
  }
];

const OWNER_OVERVIEW = [
  { label: "Total visits", value: "1.28M", delta: "+14% vs last month" },
  { label: "Today live", value: "8,492", delta: "+9% since 8 AM" },
  { label: "DAU / MAU", value: "12.4k / 91k", delta: "13.6% stickiness" },
  { label: "Evidence coverage", value: "91.8%", delta: "Inside target range" }
];

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createConversation(userId: string, role: Role, seedQuestion?: string): Conversation {
  const now = new Date().toISOString();
  return {
    id: createId("chat"),
    userId,
    title: seedQuestion ? seedQuestion.slice(0, 56) : "New chat",
    role,
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatUploadTitle(item: UploadItem) {
  if (item.category === "image") {
    return "Image";
  }
  if (item.category === "pdf") {
    return "PDF";
  }
  if (item.category === "word") {
    return "Document";
  }
  return "File";
}

function patientRiskTone(text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes("urgent") || normalized.includes("emergency") || normalized.includes("immediately")) {
    return { icon: "x", label: "High risk", tone: "high" as const };
  }
  if (normalized.includes("monitor") || normalized.includes("follow up") || normalized.includes("watch")) {
    return { icon: "!", label: "Medium risk", tone: "medium" as const };
  }
  return { icon: "check", label: "Low risk", tone: "low" as const };
}

function makeSimpleExplanation(text: string) {
  const firstSentence = text.split(".")[0]?.trim();
  return firstSentence
    ? `${firstSentence}. This is a simple summary to help you understand what may be going on.`
    : "This answer is translated into simple language so it is easier to understand.";
}

function patientMeaning(text: string) {
  const firstClause = text.split(".")[0]?.trim() || "Your recent information";
  return `${firstClause} means you can start with simple next steps, keep track of how you feel, and ask for help if symptoms continue.`;
}

function patientWhenToSeeDoctor(text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes("chest pain") || normalized.includes("shortness of breath")) {
    return "If this comes with chest pain, trouble breathing, or you feel faint, get medical help right away.";
  }
  return "If this keeps happening for more than 3 days, gets worse, or comes with vomiting or severe weakness, see a doctor.";
}

function patientKeyTakeaways(answer: AnswerPayload) {
  return [
    answer.direct_answer.split(".")[0]?.slice(0, 48) || "Symptoms may have a simple cause",
    "Track changes for a few days",
    "Ask for help if symptoms get worse"
  ];
}

function getExampleQuestions(role: Role) {
  if (role === "patient") {
    return [
      "Why do I feel dizzy in the morning?",
      "What does my blood sugar result mean?",
      "Is my step count okay this week?",
      "What should I ask my doctor next?"
    ];
  }
  if (role === "doctor") {
    return [
      "GLP-1 in obesity",
      "CAR-T in lupus",
      "Pembrolizumab adverse effects",
      "SGLT2 inhibitors in HFpEF"
    ];
  }
  if (role === "pharma") {
    return [
      "GLP-1 obesity evidence gaps in adolescents",
      "Top unanswered questions in obesity trials",
      "Competitor landscape for SGLT2 vs GLP-1",
      "Recruiting phase 3 metabolic disease trials"
    ];
  }
  return [
    "Show query growth by role this week",
    "Where is hallucination rate rising?",
    "What are our top unanswered queries?",
    "Summarize latency and API cost trends"
  ];
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5 12.5-12.5Z" />
    </svg>
  );
}

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

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7.1 7.1 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5" />
      <path d="M12 19.5V22" />
      <path d="M4.9 4.9 6.7 6.7" />
      <path d="m17.3 17.3 1.8 1.8" />
      <path d="M2 12h2.5" />
      <path d="M19.5 12H22" />
      <path d="m4.9 19.1 1.8-1.8" />
      <path d="m17.3 6.7 1.8-1.8" />
    </svg>
  );
}

function HelpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.7 9a2.7 2.7 0 1 1 4.5 2c-.9.8-1.7 1.3-1.7 2.5" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BarChart({
  title,
  items,
  tone = "teal",
  suffix = ""
}: {
  title: string;
  items: { label: string; value: number }[];
  tone?: "teal" | "rose" | "gold";
  suffix?: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <section className="panel chart-panel">
      <div className="panel-title-row">
        <strong>{title}</strong>
      </div>
      <div className={`chart-stack tone-${tone}`}>
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="chart-row">
            <div className="chart-label-row">
              <span>{item.label}</span>
              <strong>
                {item.value}
                {suffix}
              </strong>
            </div>
            <div className="chart-track">
              <div className="chart-fill" style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlaceholderPanel({ title, note }: { title: string; note: string }) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <strong>{title}</strong>
        <span className="ghost-badge">Future feed</span>
      </div>
      <div className="placeholder-note">{note}</div>
    </section>
  );
}

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const [users, setUsers] = useState<AuthUser[]>(() => readStorage<AuthUser[]>(USERS_STORAGE_KEY, []));
  const [activeUserId, setActiveUserId] = useState<string | null>(() => readStorage<string | null>(ACTIVE_USER_STORAGE_KEY, null));
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    readStorage<Conversation[]>(CONVERSATIONS_STORAGE_KEY, [])
  );
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [role, setRole] = useState<Role>("patient");
  const [theme, setTheme] = useState<ThemeMode>(() => readStorage<ThemeMode>(THEME_STORAGE_KEY, "light"));
  const [question, setQuestion] = useState("");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [llmModel, setLlmModel] = useState<LlmModel>("GPT-5.3");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Ask with text, voice, or files.");
  const [helpOpen, setHelpOpen] = useState(false);

  const activeUser = useMemo(
    () => users.find((item) => item.id === activeUserId) ?? null,
    [users, activeUserId]
  );

  const userConversations = useMemo(() => {
    if (!activeUserId) {
      return [];
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    return conversations
      .filter((item) => item.userId === activeUserId)
      .filter((item) => {
        if (!normalizedQuery) {
          return true;
        }
        return (
          item.title.toLowerCase().includes(normalizedQuery) ||
          item.messages.some((message) => message.text.toLowerCase().includes(normalizedQuery))
        );
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [activeUserId, conversations, searchQuery]);

  const selectedConversation = useMemo(
    () => userConversations.find((item) => item.id === selectedConversationId) ?? null,
    [userConversations, selectedConversationId]
  );

  const recentPatientAnswers = useMemo(
    () =>
      userConversations
        .filter((item) => item.role === "patient")
        .flatMap((item) => item.messages)
        .filter((message) => message.sender === "assistant")
        .slice(-3)
        .reverse(),
    [userConversations]
  );

  useEffect(() => {
    writeStorage(USERS_STORAGE_KEY, users);
  }, [users]);

  useEffect(() => {
    writeStorage(ACTIVE_USER_STORAGE_KEY, activeUserId);
  }, [activeUserId]);

  useEffect(() => {
    writeStorage(CONVERSATIONS_STORAGE_KEY, conversations);
  }, [conversations]);

  useEffect(() => {
    writeStorage(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!activeUserId) {
      setSelectedConversationId(null);
      return;
    }

    const available = conversations
      .filter((item) => item.userId === activeUserId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    if (available.length === 0) {
      const seededConversation = createConversation(activeUserId, role);
      setConversations((current) => [...current, seededConversation]);
      setSelectedConversationId(seededConversation.id);
      return;
    }

    if (!selectedConversationId || !available.some((item) => item.id === selectedConversationId)) {
      setSelectedConversationId(available[0].id);
    }
  }, [activeUserId, conversations, role, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }
    setRole(selectedConversation.role);
  }, [selectedConversation]);

  useEffect(() => {
    if (!activeUser) {
      return;
    }

    const fetchDashboard = async () => {
      setDashboardLoading(true);
      try {
        const response = await fetch(`${API_BASE}/api/dashboard/${role}`);
        if (!response.ok) {
          throw new Error("Dashboard request failed.");
        }
        const data = (await response.json()) as DashboardPayload;
        setDashboard(data);
      } catch {
        setDashboard(null);
      } finally {
        setDashboardLoading(false);
      }
    };

    void fetchDashboard();
  }, [activeUser, role]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [selectedConversation?.messages.length]);

  const persistConversationUpdate = (conversationId: string, updater: (conversation: Conversation) => Conversation) => {
    setConversations((current) =>
      current.map((item) => {
        if (item.id !== conversationId) {
          return item;
        }
        return updater(item);
      })
    );
  };

  const handleAuthSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);

    const normalizedEmail = authEmail.trim().toLowerCase();
    if (!normalizedEmail || !authPassword.trim()) {
      setAuthError("Email and password are required.");
      return;
    }

    if (authMode === "register") {
      if (!authName.trim()) {
        setAuthError("Name is required for registration.");
        return;
      }

      if (users.some((item) => item.email.toLowerCase() === normalizedEmail)) {
        setAuthError("An account with this email already exists.");
        return;
      }

      const newUser: AuthUser = {
        id: createId("user"),
        name: authName.trim(),
        email: normalizedEmail,
        password: authPassword,
        createdAt: new Date().toISOString()
      };
      setUsers((current) => [...current, newUser]);
      setActiveUserId(newUser.id);
      setAuthName("");
      setAuthEmail("");
      setAuthPassword("");
      return;
    }

    const existingUser = users.find(
      (item) => item.email.toLowerCase() === normalizedEmail && item.password === authPassword
    );

    if (!existingUser) {
      setAuthError("Incorrect email or password.");
      return;
    }

    setActiveUserId(existingUser.id);
    setAuthName("");
    setAuthEmail("");
    setAuthPassword("");
  };

  const handleLogout = () => {
    setActiveUserId(null);
    setSelectedConversationId(null);
    setSearchQuery("");
    setQuestion("");
    setUploadedFiles([]);
    setStatusMessage("You have been logged out.");
  };

  const handleNewChat = () => {
    if (!activeUserId) {
      return;
    }
    const freshConversation = createConversation(activeUserId, role);
    setConversations((current) => [...current, freshConversation]);
    setSelectedConversationId(freshConversation.id);
    setQuestion("");
    setUploadedFiles([]);
    setStatusMessage("New chat created.");
  };

  const handleRoleChange = (nextRole: Role) => {
    setRole(nextRole);
    setHelpOpen(false);
    if (!selectedConversationId) {
      return;
    }

    persistConversationUpdate(selectedConversationId, (conversation) => ({
      ...conversation,
      role: nextRole,
      updatedAt: new Date().toISOString()
    }));
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
      setUploadedFiles((current) => [...current, ...data.files]);
      setStatusMessage("Files uploaded. Add your question and run proof.");
    } catch {
      setStatusMessage("Upload failed. Please use PDF, Word, or image files.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const removeUpload = (target: UploadItem) => {
    setUploadedFiles((current) =>
      current.filter((item) => !(item.name === target.name && item.size_bytes === target.size_bytes))
    );
  };

  const handleAudioInput = async () => {
    const browserRecognition =
      typeof window !== "undefined"
        ? ((window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor })
            .SpeechRecognition ??
            (window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition)
        : undefined;

    if (browserRecognition) {
      setTranscribing(true);
      setRecording(true);
      setStatusMessage("Listening... speak now.");

      try {
        const recognition = new browserRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        await new Promise<void>((resolve, reject) => {
          recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
              .map((result) => result[0]?.transcript ?? "")
              .join(" ")
              .trim();
            setQuestion(transcript);
          };

          recognition.onerror = () => {
            reject(new Error("Browser speech recognition failed. Check microphone permission and try again."));
          };

          recognition.onend = () => {
            resolve();
          };

          recognition.start();
        });

        setStatusMessage("Voice transcription ready from your browser.");
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Browser speech recognition failed.");
      } finally {
        setRecording(false);
        setTranscribing(false);
      }
      return;
    }

    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setStatusMessage("Voice input needs Chrome or Safari speech recognition, or backend transcription with CAREPROOF_ELEVENLABS_API_KEY.");
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
      setStatusMessage("Sending audio for transcription...");

      const response = await fetch(`${API_BASE}/api/transcribe`, {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as TranscriptionResponse | { detail?: string };
      if (!response.ok) {
        const detail = "detail" in data ? data.detail : "Audio transcription failed.";
        if (detail?.includes("CAREPROOF_ELEVENLABS_API_KEY")) {
          throw new Error("Voice input is not configured on the backend. Use Chrome/Safari browser speech input, or set CAREPROOF_ELEVENLABS_API_KEY and restart the backend.");
        }
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

  const submitQuestion = async () => {
    if (!selectedConversation || !question.trim()) {
      setStatusMessage(role === "patient" ? "Type a health question before running proof." : "Add a question before running proof.");
      return;
    }

    const trimmedQuestion = question.trim();
    const now = new Date().toISOString();
    const nextUserMessage: ChatMessage = {
      id: createId("msg"),
      sender: "user",
      text: trimmedQuestion,
      createdAt: now,
      roleSnapshot: role,
      uploads: uploadedFiles
    };

    persistConversationUpdate(selectedConversation.id, (conversation) => ({
      ...conversation,
      role,
      title: conversation.messages.length === 0 ? trimmedQuestion.slice(0, 56) : conversation.title,
      updatedAt: now,
      messages: [...conversation.messages, nextUserMessage]
    }));

    setLoading(true);
    setQuestion("");
    setUploadedFiles([]);
    setStatusMessage(
      role === "patient"
        ? "CareProof is preparing an easy-to-read answer..."
        : role === "doctor"
          ? "CareProof is retrieving evidence..."
          : role === "pharma"
            ? "Refreshing landscape signals..."
            : "Generating monitoring summary..."
    );

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ question: trimmedQuestion, role })
      });

      if (!response.ok) {
        throw new Error("Chat request failed.");
      }

      const data = (await response.json()) as AnswerPayload;
      const assistantMessage: ChatMessage = {
        id: createId("msg"),
        sender: "assistant",
        text: data.direct_answer,
        createdAt: new Date().toISOString(),
        roleSnapshot: role,
        answerPayload: data
      };

      persistConversationUpdate(selectedConversation.id, (conversation) => ({
        ...conversation,
        role,
        updatedAt: assistantMessage.createdAt,
        messages: [...conversation.messages, assistantMessage]
      }));
      setStatusMessage("Run complete.");
    } catch {
      const failedMessage: ChatMessage = {
        id: createId("msg"),
        sender: "assistant",
        text: "CareProof could not complete the run. Please check that the backend is reachable and try again.",
        createdAt: new Date().toISOString(),
        roleSnapshot: role
      };

      persistConversationUpdate(selectedConversation.id, (conversation) => ({
        ...conversation,
        updatedAt: failedMessage.createdAt,
        messages: [...conversation.messages, failedMessage]
      }));
      setStatusMessage("CareProof could not complete the run.");
    } finally {
      setLoading(false);
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const currentCopy = ROLE_COPY[role];
  const currentExamples = getExampleQuestions(role);
  const latestAnswerPayload =
    selectedConversation?.messages
      .slice()
      .reverse()
      .find((item) => item.answerPayload)?.answerPayload ?? null;

  const renderRoleWorkspace = () => {
    if (role === "patient") {
      return (
        <section className="workspace workspace-patient">
          <div className="workspace-grid patient-grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">My health summary</div>
                </div>
              </div>
              <div className="simple-card-grid">
                {PATIENT_SUMMARY_CARDS.map((item) => (
                  <div key={item.label} className="simple-health-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <em>{item.status}</em>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">Today</div>
                  <h3>Reminders</h3>
                </div>
              </div>
              <div className="stack-list">
                <div className="soft-row-card">Today you need to take medicine 1 time, at 8:00 PM.</div>
                <div className="soft-row-card">Clinical trial match: No suitable trial matched yet.</div>
                <div className="soft-row-card">7-day step trend: steady progress this week.</div>
              </div>
            </div>

            <BarChart
              title="Simple 7-day trend"
              tone="rose"
              items={[
                { label: "Mon", value: 4 },
                { label: "Tue", value: 5 },
                { label: "Wed", value: 6 },
                { label: "Thu", value: 5 },
                { label: "Fri", value: 7 }
              ]}
            />

            <div className="side-rail">
              <div className="panel">
                <div className="panel-kicker">Key takeaways</div>
                <ul className="plain-list">
                  {PATIENT_TAKEAWAYS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="panel">
                <div className="panel-kicker">What should I ask my doctor?</div>
                <ul className="plain-list">
                  {PATIENT_ASK_DOCTOR.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="panel">
                <div className="panel-kicker">Recent answers</div>
                <div className="history-snippets">
                  {(recentPatientAnswers.length > 0 ? recentPatientAnswers : PATIENT_HISTORY).map((item) => (
                    <div key={"id" in item ? item.id : item.time} className="history-snippet">
                      <strong>{"createdAt" in item ? formatTimestamp(item.createdAt) : item.time}</strong>
                      <span>{"text" in item ? item.text : item.answer}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="patient-disclaimer">
            This information is only for health education. It cannot replace a doctor’s diagnosis or treatment. Please contact a healthcare professional if you are worried.
          </div>
        </section>
      );
    }

    if (role === "doctor") {
      return (
        <section className="workspace workspace-doctor">
          <div className="workspace-hero doctor-hero">
            <div>
              <div className="workspace-kicker">Doctor view</div>
              <h1>{currentCopy.title}</h1>
              <p>{currentCopy.subtitle}</p>
            </div>
            <div className="hero-meta-strip">
              {ROLE_HEADER_TAGLINES[role].map((item) => (
                <span key={item} className="hero-tag">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="workspace-grid doctor-grid">
            <div className="panel sticky-panel">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">PICO parser</div>
                  <h3>Structured framing</h3>
                </div>
                <span className="status-chip">Collapsible</span>
              </div>
              <div className="pico-grid">
                {DOCTOR_PICO.map((item) => (
                  <div key={item.label} className="pico-card">
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="evidence-main">
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <div className="panel-kicker">Core evidence</div>
                    <h3>PubMed + ClinicalTrials</h3>
                  </div>
                  <div className="header-inline-actions">
                    <span className="status-chip">Claim-level citation</span>
                    <span className="status-chip danger">Conflict-aware</span>
                  </div>
                </div>
                <div className="dual-column">
                  <div className="evidence-column">
                    <div className="column-title">PubMed</div>
                    {(latestAnswerPayload?.supporting_evidence ?? []).map((item) => (
                      <div key={item.id} className="doctor-evidence-card">
                        <div className="evidence-inline-topline">
                          <span className="source-tag">{item.source}</span>
                          <span className="evidence-id">{item.id}</span>
                          <span className="status-tag">{item.evidence_type ?? "RCT"}</span>
                          <span className="status-tag">n=500</span>
                          <span className="status-tag">p=0.003</span>
                        </div>
                        <strong>{item.title}</strong>
                        <p>{item.summary}</p>
                        <div className="doctor-evidence-footer">
                          <span className="grade-chip">Level 1 evidence</span>
                          <span className="metric-chip">HR 0.72</span>
                          {item.url ? (
                            <a href={item.url} target="_blank" rel="noreferrer">
                              Open source
                            </a>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="evidence-column">
                    <div className="column-title">ClinicalTrials</div>
                    {(latestAnswerPayload?.supporting_evidence ?? []).map((item) => (
                      <div key={`${item.id}-trial`} className="doctor-evidence-card trial">
                        <div className="evidence-inline-topline">
                          <span className="source-tag">ClinicalTrials</span>
                          <span className="evidence-id">{item.id.replace("PMID", "NCT")}</span>
                          <span className="status-tag">{item.phase ?? "Phase 3"}</span>
                          <span className="status-tag">{item.status ?? "Recruiting"}</span>
                        </div>
                        <strong>{item.title}</strong>
                        <p>Population, intervention, recruitment state, and endpoints sit here with provenance-ready trial metadata.</p>
                        <div className="doctor-evidence-footer">
                          <span className="metric-chip">Primary endpoint: weight loss</span>
                          <span className="metric-chip">Adults with obesity + T2D</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="tri-panel-grid">
                <div className="panel">
                  <div className="panel-kicker">Evidence strength</div>
                  <h3>Strength bar</h3>
                  <div className="bar-stack">
                    {[5, 4, 3, 2, 1].map((level) => (
                      <div key={level} className="bar-row">
                        <span>Level {level}</span>
                        <div className="bar-track">
                          <div className="bar-fill evidence" style={{ width: `${18 * level}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-kicker">Conflict visualization</div>
                  <h3>FOR / AGAINST</h3>
                  <div className="bar-stack">
                    {DOCTOR_CONFLICT_BARS.map((item) => (
                      <div key={item.label} className="bar-row">
                        <span>
                          {item.label} ({item.count})
                        </span>
                        <div className="bar-track">
                          <div className={item.label === "FOR" ? "bar-fill positive" : "bar-fill negative"} style={{ width: `${item.value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-kicker">Forest plot / evidence graph</div>
                  <h3>Effect consistency</h3>
                  <div className="forest-plot">
                    {[62, 48, 72, 39].map((width, index) => (
                      <div key={width} className="forest-row">
                        <span>Study {index + 1}</span>
                        <div className="forest-line">
                          <div className="forest-point" style={{ left: `${width}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div>
                    <div className="panel-kicker">Case workbench</div>
                    <h3>EHR and multimodal review</h3>
                  </div>
                </div>
                <div className="doctor-workbench">
                  <div className="workbench-card">
                    <strong>Imported data</strong>
                    <span>PDF, image, and voice parsing ready</span>
                  </div>
                  <div className="workbench-card">
                    <strong>Auto summary</strong>
                    <span>Age, history, labs, and risk points extracted</span>
                  </div>
                  <div className="workbench-card danger-card">
                    <strong>Uncertainty + hedging score</strong>
                    <span>Score 6 / 10. Small sample, subgroup mismatch, short follow-up.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (role === "pharma") {
      return (
        <section className="workspace workspace-pharma">
          <div className="workspace-hero pharma-hero">
            <div>
              <div className="workspace-kicker">Pharma view</div>
              <h1>{currentCopy.title}</h1>
              <p>{currentCopy.subtitle}</p>
            </div>
            <div className="hero-meta-strip">
              {PHARMA_FILTERS.map((item) => (
                <span key={item} className="hero-tag">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="pharma-dashboard-top">
            <div className="panel large-panel">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">Drug / Trial Landscape Dashboard</div>
                  <h3>Portfolio snapshot</h3>
                </div>
                <span className="status-chip">Mock + placeholder aware</span>
              </div>
              <div className="chart-cluster">
                <div className="mock-chart-card">
                  <strong>Phase distribution</strong>
                  <div className="bar-stack">
                    {["Phase 1", "Phase 2", "Phase 3", "Phase 4"].map((item, index) => (
                      <div key={item} className="bar-row">
                        <span>{item}</span>
                        <div className="bar-track">
                          <div className="bar-fill positive" style={{ width: `${28 + index * 15}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mock-chart-card">
                  <strong>Question trend</strong>
                  <div className="sparkline">
                    {[30, 48, 44, 62, 57, 74, 80].map((height) => (
                      <span key={height} style={{ height: `${height}%` }} />
                    ))}
                  </div>
                </div>
                <div className="mock-chart-card">
                  <strong>Trial status tracker</strong>
                  <div className="status-cluster">
                    <span className="status-chip">Recruiting 14</span>
                    <span className="status-chip">Completed 31</span>
                    <span className="status-chip danger">Terminated 2</span>
                    <span className="status-chip">Pending 4</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="workspace-grid pharma-grid">
            {PHARMA_MODULES.map((item) => (
              <PlaceholderPanel key={item.title} title={item.title} note={`${item.body} ${item.placeholder}`} />
            ))}

            <div className="panel">
              <div className="panel-kicker">Competitor comparison</div>
              <h3>SGLT2 vs GLP-1</h3>
              <div className="comparison-grid">
                <div className="comparison-card">
                  <strong>Trial count</strong>
                  <span>GLP-1 leads in phase 3 density</span>
                </div>
                <div className="comparison-card">
                  <strong>Evidence strength</strong>
                  <span>Both high, GLP-1 broader obesity-specific support</span>
                </div>
                <div className="comparison-card">
                  <strong>Safety attention</strong>
                  <span>GI tolerability dominates demand</span>
                </div>
                <div className="comparison-card">
                  <strong>Market coverage</strong>
                  <span>Coverage broad, but subgroup gaps remain</span>
                </div>
              </div>
            </div>

            <BarChart
              title="Drug-specific question trends"
              tone="teal"
              items={[
                { label: "Safety", value: 68 },
                { label: "Efficacy", value: 82 },
                { label: "Dosing", value: 39 },
                { label: "Pediatrics", value: 56 }
              ]}
              suffix="%"
            />

            <div className="panel">
              <div className="panel-kicker">Exports and subscriptions</div>
              <h3>Excel / PDF and scheduled updates</h3>
              <div className="stack-list">
                <div className="soft-row-card">Weekly clinical trial status update</div>
                <div className="soft-row-card">Monthly evidence gap report</div>
                <div className="soft-row-card">Data is for R&D and market reference, not clinical decision-making.</div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="workspace workspace-owner">
        <div className="workspace-hero owner-hero">
          <div>
            <div className="workspace-kicker">Owner view</div>
            <h1>{currentCopy.title}</h1>
            <p>{currentCopy.subtitle}</p>
            <div className="hero-helper">Realtime refresh + export-ready monitoring surface</div>
          </div>
          <div className="hero-meta-strip">
            {ROLE_HEADER_TAGLINES[role].map((item) => (
              <span key={item} className="hero-tag">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="owner-overview-grid">
          {OWNER_OVERVIEW.map((item) => (
            <div key={item.label} className="owner-stat-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <em>{item.delta}</em>
            </div>
          ))}
        </div>

        <div className="workspace-grid owner-grid">
          <div className="panel">
            <div className="panel-kicker">Usage</div>
            <h3>Daily queries, active users, query types</h3>
            <div className="chart-cluster">
              <div className="mock-chart-card">
                <strong># queries / day</strong>
                <div className="sparkline">
                  {[22, 36, 41, 55, 61, 44, 73].map((height) => (
                    <span key={height} style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
              <div className="mock-chart-card">
                <strong>Role mix</strong>
                <div className="status-cluster">
                  <span className="status-chip">Patient 48%</span>
                  <span className="status-chip">Doctor 27%</span>
                  <span className="status-chip">Pharma 14%</span>
                  <span className="status-chip">Owner 11%</span>
                </div>
              </div>
            </div>
          </div>

          <BarChart
            title="Infra"
            tone="gold"
            items={[
              { label: "Latency P50", value: 44 },
              { label: "Latency P95", value: 68 },
              { label: "Token usage", value: 59 },
              { label: "GPU usage", value: 51 },
              { label: "API cost", value: 72 }
            ]}
            suffix="%"
          />

          <div className="panel">
            <div className="panel-kicker">Quality</div>
            <h3>Hallucination, evidence missing, citation accuracy</h3>
            <div className="comparison-grid">
              <div className="comparison-card">
                <strong>Hallucination rate</strong>
                <span>1.8% overall, redline at 3%</span>
              </div>
              <div className="comparison-card">
                <strong>Missing evidence rate</strong>
                <span>6.4%, concentrated in patient lifestyle questions</span>
              </div>
              <div className="comparison-card">
                <strong>Conflict detection rate</strong>
                <span>84.2%, improving week over week</span>
              </div>
              <div className="comparison-card">
                <strong>Citation accuracy</strong>
                <span>97.1%, with a small trial-link mismatch backlog</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-kicker">Data flywheel</div>
            <h3>Top questions, unanswered queries, preference feedback</h3>
            <div className="history-snippets">
              <div className="history-snippet">
                <strong>Top question</strong>
                <span>GLP-1 side effects in real-world use</span>
              </div>
              <div className="history-snippet">
                <strong>Unanswered query</strong>
                <span>Pediatric obesity subgroup evidence remains sparse</span>
              </div>
              <div className="history-snippet">
                <strong>A/B preference</strong>
                <span>Users prefer concise answer + citations format by 63%</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-kicker">System logs</div>
            <h3>Error log, safety trigger rate, flywheel log</h3>
            <div className="stack-list">
              <div className="soft-row-card">API timeout spike on evidence retrieval endpoint at 10:12 AM</div>
              <div className="soft-row-card">Safety trigger rate increased for patient diagnosis-seeking prompts</div>
              <div className="soft-row-card">Knowledge gap tag added for pediatric dosing evidence requests</div>
            </div>
          </div>
        </div>
      </section>
    );
  };

  const renderAssistantPayload = (message: ChatMessage) => {
    if (!message.answerPayload) {
      return null;
    }

    const answer = message.answerPayload;

    if (role === "patient") {
      const risk = patientRiskTone(answer.uncertainty_note);
      return (
        <div className="assistant-panels patient-answer">
          <div className="patient-answer-grid">
            <div className="mini-panel hero-panel">
              <div className="mini-panel-title">Answer Summary</div>
              <p className="large-copy">{answer.direct_answer}</p>
            </div>
            <div className={`mini-panel risk-panel ${risk.tone}`}>
              <div className="mini-panel-title">Risk</div>
              <div className="risk-line">
                <span className={`risk-icon ${risk.tone}`}>{risk.icon}</span>
                <strong>{risk.label}</strong>
              </div>
              <p>{answer.uncertainty_note}</p>
            </div>
          </div>

          <div className="mini-panel">
            <div className="mini-panel-title">Simple Explanation</div>
            <p>{makeSimpleExplanation(answer.direct_answer)}</p>
          </div>

          <div className="mini-panel">
            <div className="mini-panel-title">What this means for you</div>
            <p>{patientMeaning(answer.direct_answer)}</p>
          </div>

          <div className="mini-panel">
            <div className="mini-panel-title">When to see a doctor</div>
            <p>{patientWhenToSeeDoctor(answer.direct_answer)}</p>
          </div>

          <div className="mini-panel">
            <div className="mini-panel-title">Key Takeaways</div>
            <ul className="plain-list compact">
              {patientKeyTakeaways(answer).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <details className="mini-panel collapsible-panel">
            <summary className="mini-panel-title">Evidence (optional, collapsed)</summary>
            <p>Related health research suggests this guidance, but the technical details are hidden in patient view.</p>
          </details>
        </div>
      );
    }

    if (role === "doctor") {
      return (
        <div className="assistant-panels">
          <div className="assistant-role-brief">{answer.role_brief}</div>
          <div className="mini-panel">
            <div className="mini-panel-title">Direct Answer</div>
            <p>{answer.direct_answer}</p>
          </div>
          <div className="mini-panel">
            <div className="mini-panel-title">Limitations</div>
            <p>{answer.uncertainty_note}</p>
          </div>
          <div className="mini-panel">
            <div className="mini-panel-title">Evidence Table</div>
            <div className="doctor-table">
              {answer.supporting_evidence.map((item) => (
                <div key={`${message.id}-${item.id}`} className="doctor-table-row">
                  <span>{item.id}</span>
                  <span>{item.evidence_type ?? "RCT"}</span>
                  <span>n=500</span>
                  <span>HR 0.72</span>
                  <span>p=0.003</span>
                  <span>Level 1</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mini-panel">
            <div className="mini-panel-title">Claim-level citations</div>
            <div className="citation-strip">
              {answer.citations.map((citation) => (
                <span key={citation} className="citation-pill">
                  {citation}
                </span>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (role === "pharma") {
      return (
        <div className="assistant-panels">
          <div className="mini-panel">
            <div className="mini-panel-title">Landscape Summary</div>
            <p>{answer.direct_answer}</p>
          </div>
          <div className="mini-panel">
            <div className="mini-panel-title">Signals to watch</div>
            <div className="comparison-grid">
              <div className="comparison-card">
                <strong>Evidence gap</strong>
                <span>Subgroup evidence is thinner than market demand suggests.</span>
              </div>
              <div className="comparison-card">
                <strong>Competitor pressure</strong>
                <span>Watch late-phase density and recruiting acceleration.</span>
              </div>
              <div className="comparison-card">
                <strong>Safety demand</strong>
                <span>Adverse event questions are clustering around tolerability.</span>
              </div>
            </div>
          </div>
          <div className="mini-panel">
            <div className="mini-panel-title">Sources and placeholders</div>
            <p>{answer.uncertainty_note}</p>
            <div className="placeholder-note">No data yet — will be populated from aggregated queries</div>
          </div>
        </div>
      );
    }

    return (
      <div className="assistant-panels">
        <div className="mini-panel">
          <div className="mini-panel-title">Monitoring Summary</div>
          <p>{answer.direct_answer}</p>
        </div>
        <div className="mini-panel">
          <div className="mini-panel-title">Quality watch</div>
          <p>{answer.uncertainty_note}</p>
        </div>
        <div className="mini-panel">
          <div className="mini-panel-title">Operational signals</div>
          <div className="comparison-grid">
            <div className="comparison-card">
              <strong>Visits</strong>
              <span>Track cumulative visits, daily traffic, and role share.</span>
            </div>
            <div className="comparison-card">
              <strong>Infra</strong>
              <span>Latency P50/P95, GPU load, and API cost stay visible here.</span>
            </div>
            <div className="comparison-card">
              <strong>Data flywheel</strong>
              <span>Top questions and unanswered demand are treated as assets.</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!activeUser) {
    return (
      <div className="auth-shell">
        <div className="auth-panel">
          <div className="brand-mark">CareProof</div>
          <h1>Clinical evidence chat with role-specific workspaces</h1>
          <p className="auth-subcopy">
            Sign in to keep private chat history, switch between Patient, Doctor, Pharma, and Owner views, and preserve each role's working context.
          </p>

          <div className="auth-toggle">
            <button
              type="button"
              className={authMode === "login" ? "auth-toggle-button active" : "auth-toggle-button"}
              onClick={() => setAuthMode("login")}
            >
              Log in
            </button>
            <button
              type="button"
              className={authMode === "register" ? "auth-toggle-button active" : "auth-toggle-button"}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === "register" ? (
              <label className="auth-field">
                <span>Name</span>
                <input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Yongheng Wang" />
              </label>
            ) : null}

            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="Enter password"
              />
            </label>

            {authError ? <div className="auth-error">{authError}</div> : null}

            <button className="auth-submit" type="submit">
              {authMode === "login" ? "Continue to CareProof" : "Create account"}
            </button>
          </form>

          <div className="auth-demo-note">Demo note: account and chat history are stored in local browser storage.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-shell">
      <aside className="history-sidebar">
        <div className="sidebar-topbar">
          <button className="sidebar-icon-button" type="button" title="New chat" onClick={handleNewChat}>
            <PencilIcon className="sidebar-icon" />
          </button>
        </div>

        <div className="sidebar-brand">
          <div className="brand-mark small">CareProof</div>
          <div className="search-shell">
            <SearchIcon className="search-icon" />
            <input
              className="search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search chats"
            />
          </div>
        </div>

        <button className="new-chat-button" type="button" onClick={handleNewChat}>
          <PlusIcon className="mini-icon" />
          New chat
        </button>

        <div className="role-stack">
          {ROLE_ORDER.map((item) => (
            <button
              key={item}
              type="button"
              className={item === role ? "role-chip active" : "role-chip"}
              onClick={() => handleRoleChange(item)}
            >
              {ROLE_LABELS[item]}
            </button>
          ))}
        </div>

        <div className="sidebar-section-title">Recent chats</div>
        <div className="history-list">
          {userConversations.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === selectedConversationId ? "history-item active" : "history-item"}
              onClick={() => setSelectedConversationId(item.id)}
            >
              <span className="history-title">{item.title}</span>
              <span className="history-meta">
                {ROLE_LABELS[item.role]} · {formatTimestamp(item.updatedAt)}
              </span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{activeUser.name.slice(0, 1).toUpperCase()}</div>
            <div className="user-meta">
              <strong>{activeUser.name}</strong>
              <span>{activeUser.email}</span>
            </div>
          </div>
          <button className="logout-button" type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-header">
          <div className="chat-header-copy">
            <div className="chat-header-title">
              <span>{role === "patient" ? "CareProof" : selectedConversation?.title ?? currentCopy.title}</span>
              <ChevronIcon className="header-chevron" />
            </div>
            {role === "patient" ? null : <div className="chat-header-subtitle">{currentCopy.helper}</div>}
          </div>

          <div className="header-actions">
            {role === "patient" ? null : (
              <div className="header-pills">
                {ROLE_HEADER_TAGLINES[role].map((item) => (
                  <span key={item} className="top-pill">
                    {item}
                  </span>
                ))}
              </div>
            )}
            <button className="header-icon-button" type="button" title="Help" onClick={() => setHelpOpen((value) => !value)}>
              <HelpIcon className="toolbar-icon" />
            </button>
            <button
              className="header-icon-button"
              type="button"
              title="Toggle theme"
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            >
              {theme === "light" ? <MoonIcon className="toolbar-icon" /> : <SunIcon className="toolbar-icon" />}
            </button>
          </div>
        </header>

        {helpOpen ? (
          <div className="help-banner">
            <strong>{currentCopy.helpTitle}</strong>
            <span>{currentCopy.helpBody}</span>
          </div>
        ) : null}

        <div className="chat-scroll" ref={chatScrollRef}>
          <div className="scroll-frame">
            {renderRoleWorkspace()}

            {selectedConversation && selectedConversation.messages.length > 0 ? (
              <div className="message-stack">
                {selectedConversation.messages.map((message) => (
                  <article
                    key={message.id}
                    className={message.sender === "assistant" ? "message-row assistant" : "message-row user"}
                  >
                    <div className={message.sender === "assistant" ? "message-card assistant" : "message-card user"}>
                      <div className="message-meta">
                        <span>{message.sender === "assistant" ? "CareProof" : activeUser.name}</span>
                        <span>{formatTimestamp(message.createdAt)}</span>
                      </div>
                      <div className="message-text">{message.text}</div>

                      {message.uploads && message.uploads.length > 0 ? (
                        <div className="message-uploads">
                          {message.uploads.map((item) => (
                            <span key={`${message.id}-${item.name}-${item.size_bytes}`} className="upload-pill">
                              {item.category}: {item.name}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {renderAssistantPayload(message)}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-chat-state">
                {role === "patient" ? null : (
                  <div className="empty-chat-card">
                    <div className="eyebrow">{ROLE_LABELS[role]} workspace</div>
                    <h2>{currentCopy.title}</h2>
                    <p>{dashboard?.summary ?? currentCopy.subtitle}</p>

                    <div className="example-grid">
                      {currentExamples.map((item) => (
                        <button key={item} type="button" className="example-card" onClick={() => setQuestion(item)}>
                          {item}
                        </button>
                      ))}
                    </div>

                    <div className="dashboard-preview">
                      <div className="dashboard-preview-head">
                        <span>{dashboardLoading ? "Loading role brief..." : dashboard?.title ?? "Role briefing"}</span>
                      </div>
                      <p>{dashboard?.summary ?? currentCopy.helper}</p>
                      <div className="metric-strip">
                        {(dashboard?.metrics.length ? dashboard.metrics : OWNER_OVERVIEW.slice(0, 3)).map((metric) => (
                          <div key={metric.label} className="metric-pill">
                            <strong>{metric.value}</strong>
                            <span>{metric.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="composer-region">
          {uploadedFiles.length > 0 ? (
            <div className="upload-list">
              {uploadedFiles.map((item) => (
                <div key={`${item.name}-${item.size_bytes}`} className="upload-pill removable">
                  <span>
                    {item.category}: {item.name}
                  </span>
                  <button type="button" className="upload-remove-button" onClick={() => removeUpload(item)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="status-line">{statusMessage}</div>

          <section className={`composer-card composer-${role}`}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="question-input"
              placeholder={currentCopy.inputPlaceholder}
            />

            <div className="composer-toolbar">
              <div className="composer-left">
                <button className="icon-button" type="button" title={currentCopy.uploadLabel} onClick={openFilePicker}>
                  <PlusIcon className="toolbar-icon" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden-input"
                  multiple
                  accept=".pdf,.doc,.docx,image/*"
                  onChange={handleUpload}
                />
                <label className="model-select-shell" aria-label="Choose LLM model">
                  <select
                    className="model-select"
                    value={llmModel}
                    onChange={(event) => setLlmModel(event.target.value as LlmModel)}
                  >
                    <option value="Gemini 3.1">Gemini 3.1</option>
                    <option value="GPT-5.3">GPT-5.3</option>
                    <option value="Opus 4.6">Opus 4.6</option>
                    <option value="Qwen 3.5 Free">Qwen 3.5 Free</option>
                  </select>
                </label>
              </div>

              <div className="composer-right">
                <button
                  className={recording ? "icon-button recording" : "icon-button"}
                  type="button"
                  title={currentCopy.voiceLabel}
                  onClick={handleAudioInput}
                  disabled={transcribing}
                >
                  <MicIcon className="toolbar-icon" />
                </button>
                <button
                  className="send-button"
                  type="button"
                  title={currentCopy.runProofLabel}
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
