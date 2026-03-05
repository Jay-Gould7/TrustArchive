import CryptoJS from "crypto-js";
import { ethers } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTrustProtocol } from "../hooks/useTrustProtocol";
import { decryptWithDerivedKey, deriveFileKey, fetchEncryptedFromPinataGateway } from "../services/securityService";
import { batchIssueEncryptedSBTs } from "../services/cryptoEnvelope";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  FileText,
  Users,
  CheckCircle,
  AlertCircle,
  Plus,
  Search,
  Download,
  Trash2,
  ExternalLink,
  Key,
  Database,
  Layers,
  FileCheck,
  X,
  ChevronLeft,
  ChevronRight,
  Settings,
  RefreshCw,
  Shield,
  Upload,
  ArrowRight,
  Loader2
} from "lucide-react";

// --- UI Components ---

const MagneticCard = ({ children, className = "", onClick, colSpan = "col-span-1" }) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
    onClick={onClick}
    className={`
      relative overflow-hidden rounded-3xl border border-white/5 bg-[#0B0E14]/80 backdrop-blur-xl
      transition-all duration-300
      hover:scale-[1.01] hover:bg-white/[0.04] hover:border-cyan-500/30 hover:shadow-[0_4px_20px_-12px_rgba(6,182,212,0.5)]
      ${colSpan} ${className}
    `}
  >
    {children}
  </motion.div>
);

const StatCard = ({ label, value, loading, icon: Icon, color = "cyan" }) => {
  const colorStyles = {
    cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20 shadow-[0_0_20px_-5px_rgba(6,182,212,0.3)]",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20 shadow-[0_0_20px_-5px_rgba(168,85,247,0.3)]",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]",
  };

  return (
    <div className="group relative flex flex-col justify-between h-full p-6">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</span>
        <div className={`rounded-lg border p-2 ${colorStyles[color]}`}>
          {Icon && <Icon size={18} />}
        </div>
      </div>
      <div className="mt-4">
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded-lg bg-slate-800" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-100">{value}</span>
            <span className={`h-2 w-2 rounded-full ${color === 'cyan' ? 'bg-cyan-500' : color === 'purple' ? 'bg-purple-500' : 'bg-emerald-500'} shadow-[0_0_8px_currentColor]`} />
          </div>
        )}
      </div>
    </div>
  );
};

const ActionButton = ({ children, onClick, disabled, variant = "primary", className = "", icon: Icon }) => {
  const variants = {
    primary: "bg-slate-100 text-slate-950 hover:bg-white shadow-[0_0_15px_rgba(255,255,255,0.3)]",
    secondary: "border border-slate-700 bg-slate-950/30 text-slate-200 hover:bg-slate-900 hover:border-slate-600",
    danger: "border border-rose-900/60 bg-rose-950/30 text-rose-200 hover:bg-rose-950/50",
    ghost: "text-slate-400 hover:text-slate-200 hover:bg-white/5",
    accent: "bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] border border-white/10"
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        group relative flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200
        active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none
        ${variants[variant]} ${className}
      `}
    >
      {Icon && <Icon size={16} className="transition-transform group-hover:scale-110" />}
      {children}
    </button>
  );
};

const SectionHeader = ({ title, subtitle, action }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/5 pb-4">
    <div>
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
        <span className="h-5 w-1 rounded-full bg-gradient-to-b from-cyan-400 to-purple-500" />
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-xs text-slate-400 font-mono pl-3">{subtitle}</p>}
    </div>
    {action}
  </div>
);

const Modal = ({ isOpen, onClose, title, children, footer, className = "" }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={`relative w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0B0E14] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] ${className}`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/5 p-5 bg-white/[0.02]">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              {title}
            </h3>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t border-white/5 p-5 bg-white/[0.02]">
              {footer}
            </div>
          )}
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function formatAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const val = n / Math.pow(1024, idx);
  return `${val.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function deriveReviewKeyWordArray(institutionAddress) {
  return CryptoJS.SHA256(`TA_CLAIM_REVIEW_V1|${String(institutionAddress || "").toLowerCase()}`);
}

function isPdfLike({ name, type }) {
  const n = String(name || "").toLowerCase();
  if (n.endsWith(".pdf")) return true;
  return String(type || "").toLowerCase().includes("pdf");
}

function defaultArchiveCategoryNames() {
  return ["Original Documents", "Contracts & Agreements", "Financial Assets"];
}

function normalizeArchiveCategoryName(name) {
  const n = String(name || "").trim();
  if (n === "证件原件") return "Original Documents";
  if (n === "合同协议") return "Contracts & Agreements";
  if (n === "财务资产") return "Financial Assets";
  return n;
}

function parseMaybeJson(text) {
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return null;
  }
}

function decryptArchiveField({ seedHex, encText }) {
  const env = parseMaybeJson(encText);
  const fileId = typeof env?.fileId === "string" ? env.fileId : "";
  const ivHex = typeof env?.ivHex === "string" ? env.ivHex : "";
  const ciphertext = typeof env?.ciphertext === "string" ? env.ciphertext : "";
  if (!fileId || !ivHex || !ciphertext) return "";
  const key = deriveFileKey({ masterSeedHex: String(seedHex || ""), fileId });
  return decryptWithDerivedKey({ ciphertext, ivHex, key });
}

async function decryptArchivePayloadByCid({ seedHex, cid }) {
  const { raw, cipherText } = await fetchEncryptedFromPinataGateway(cid);
  if (!raw || typeof raw !== "object" || typeof raw.fileId !== "string" || typeof raw.ivHex !== "string") {
    if (!cipherText) throw new Error("档案格式不正确");
    throw new Error("档案格式不正确");
  }
  const key = deriveFileKey({ masterSeedHex: String(seedHex || ""), fileId: raw.fileId });
  const plain = decryptWithDerivedKey({ ciphertext: String(raw.ciphertext || ""), ivHex: raw.ivHex, key });
  const parsed = parseMaybeJson(plain);
  if (!parsed || typeof parsed !== "object" || !parsed.dataUrl) throw new Error("解密结果格式不正确");
  return parsed;
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(svg || ""))}`;
}

function makeDefaultBadgeSvg({ title, issuerName }) {
  const safeTitle = String(title || "Credential").slice(0, 32);
  const safeIssuer = String(issuerName || "Issuer").slice(0, 32);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="640" height="400" rx="28" fill="url(#bg)"/>
  <rect x="24" y="24" width="592" height="352" rx="22" fill="none" stroke="#334155" stroke-width="2"/>
  <circle cx="86" cy="92" r="26" fill="#e2e8f0"/>
  <path d="M86 76 L94 90 L112 92 L98 104 L102 122 L86 112 L70 122 L74 104 L60 92 L78 90 Z" fill="#0f172a"/>
  <text x="140" y="92" font-family="ui-sans-serif, system-ui" font-size="20" fill="#e2e8f0">${safeIssuer}</text>
  <text x="60" y="190" font-family="ui-sans-serif, system-ui" font-weight="700" font-size="30" fill="#f8fafc">${safeTitle}</text>
  <text x="60" y="230" font-family="ui-sans-serif, system-ui" font-size="16" fill="#94a3b8">Soulbound Credential (SBT)</text>
  <text x="60" y="310" font-family="ui-sans-serif, system-ui" font-size="12" fill="#64748b">Issued on-chain • Encrypted attachment stored off-chain</text>
</svg>`;
}

function makeBadgeSvgVariant({ title, issuerName, colorA, colorB }) {
  const safeTitle = String(title || "Credential").slice(0, 32);
  const safeIssuer = String(issuerName || "Issuer").slice(0, 32);
  const a = String(colorA || "#0f172a");
  const b = String(colorB || "#111827");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="640" height="400" rx="28" fill="url(#bg)"/>
  <rect x="24" y="24" width="592" height="352" rx="22" fill="none" stroke="#334155" stroke-width="2"/>
  <circle cx="86" cy="92" r="26" fill="#e2e8f0"/>
  <path d="M86 76 L94 90 L112 92 L98 104 L102 122 L86 112 L70 122 L74 104 L60 92 L78 90 Z" fill="#0f172a"/>
  <text x="140" y="92" font-family="ui-sans-serif, system-ui" font-size="20" fill="#e2e8f0">${safeIssuer}</text>
  <text x="60" y="190" font-family="ui-sans-serif, system-ui" font-weight="700" font-size="30" fill="#f8fafc">${safeTitle}</text>
  <text x="60" y="230" font-family="ui-sans-serif, system-ui" font-size="16" fill="#94a3b8">Soulbound Credential (SBT)</text>
  <text x="60" y="310" font-family="ui-sans-serif, system-ui" font-size="12" fill="#64748b">Issued on-chain • Encrypted attachment stored off-chain</text>
</svg>`;
}

function coverPresetOptions({ title, issuerName }) {
  const base = { title, issuerName };
  return [
    { id: "slate", label: "Slate", svg: makeBadgeSvgVariant({ ...base, colorA: "#0f172a", colorB: "#111827" }) },
    { id: "emerald", label: "Emerald", svg: makeBadgeSvgVariant({ ...base, colorA: "#064e3b", colorB: "#022c22" }) },
    { id: "indigo", label: "Indigo", svg: makeBadgeSvgVariant({ ...base, colorA: "#1e1b4b", colorB: "#111827" }) },
    { id: "rose", label: "Rose", svg: makeBadgeSvgVariant({ ...base, colorA: "#4c0519", colorB: "#111827" }) },
    { id: "amber", label: "Amber", svg: makeBadgeSvgVariant({ ...base, colorA: "#78350f", colorB: "#111827" }) },
    { id: "cyan", label: "Cyan", svg: makeBadgeSvgVariant({ ...base, colorA: "#083344", colorB: "#111827" }) }
  ];
}

function toIpfsUri(cid) {
  const c = String(cid || "").trim();
  if (!c) return "";
  if (c.startsWith("ipfs://")) return c;
  return `ipfs://${c}`;
}

function isHttpUrl(v) {
  const s = String(v || "").trim();
  return s.startsWith("http://") || s.startsWith("https://");
}

function sanitizeFileName(name) {
  const s = String(name || "template").trim() || "template";
  return s.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 60);
}

function downloadTextFile({ filename, content, mime }) {
  const blob = new Blob([String(content || "")], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(v) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsvTemplate({ fields, hasPrivateAttachment }) {
  const header = ["wallet_address", ...(fields || []).map((f) => String(f.key || "").trim()).filter(Boolean)];
  if (hasPrivateAttachment) header.push("attachment_path");
  const example = ["0x1234...abcd"];
  for (const f of fields || []) {
    const t = String(f.type || "Text");
    if (t === "Number") example.push("1");
    else if (t === "Date") example.push("2026-01-01");
    else if (t === "URL") example.push("https://example.com");
    else example.push("Example");
  }
  if (hasPrivateAttachment) example.push("./cert.pdf");
  return `${header.map(escapeCsvCell).join(",")}\n${example.map(escapeCsvCell).join(",")}\n`;
}

function normalizeFieldType(t) {
  const v = String(t || "").trim();
  if (v === "Number" || v === "Date" || v === "URL" || v === "Text") return v;
  return "Text";
}

function buildTemplateSchema({ templateId, name, category, description, image, hasPrivateAttachment, fields }) {
  return {
    "@context": "https://schema.org",
    "@type": "TrustArchiveTemplate",
    templateId,
    name: String(name || templateId || ""),
    category: String(category || ""),
    description: String(description || ""),
    image: String(image || ""),
    coverImageUrl: String(image || ""),
    hasPrivateAttachment: Boolean(hasPrivateAttachment),
    fields: (fields || [])
      .map((f) => ({
        key: String(f.key || "").trim(),
        type: normalizeFieldType(f.type),
        required: Boolean(f.required)
      }))
      .filter((f) => f.key)
  };
}

async function fetchJsonFromIpfsCid(cid) {
  const c = String(cid || "").trim();
  if (!c) return null;
  const gateway = (import.meta.env.VITE_PINATA_GATEWAY || "").trim();
  const base = gateway ? gateway.replace(/\/+$/, "") : "https://gateway.pinata.cloud";
  const url = base.includes("/ipfs/") ? `${base}/${c}` : `${base}/ipfs/${c}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`IPFS 获取失败（${res.status}）`);
  return await res.json();
}

function parseCsv(text) {
  const src = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let cur = "";
  let inQuotes = false;
  let row = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      const next = src[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }
    if (!inQuotes && ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((x) => String(x || "").trim() !== ""));
  const header = (nonEmpty[0] || []).map((h) => String(h || "").trim()).filter(Boolean);
  const dataRows = nonEmpty.slice(1);
  const objects = dataRows
    .map((r) => {
      const obj = {};
      for (let i = 0; i < header.length; i++) obj[header[i]] = String(r[i] ?? "").trim();
      return obj;
    })
    .filter((r) => Object.values(r).some((v) => String(v || "").trim() !== ""));
  return { header, rows: objects };
}

function hashPairSorted(a, b) {
  const x = BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
  return ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], x));
}

function buildMerkleTreeSorted(leaves) {
  const lv = leaves.map((x) => String(x));
  if (lv.length === 0) return { root: ethers.ZeroHash, proofs: [] };
  const layers = [lv];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = prev[i + 1] || prev[i];
      next.push(hashPairSorted(left, right));
    }
    layers.push(next);
  }
  const root = layers[layers.length - 1][0];
  const proofs = lv.map((_, idx) => {
    const proof = [];
    let index = idx;
    for (let layer = 0; layer < layers.length - 1; layer++) {
      const arr = layers[layer];
      const siblingIndex = index ^ 1;
      const sibling = arr[siblingIndex] || arr[index];
      proof.push(sibling);
      index = Math.floor(index / 2);
    }
    return proof;
  });
  return { root, proofs };
}

export default function IssuerDashboard() {
  const navigate = useNavigate();
  const {
    account,
    parseProviderError,
    isInstitution,
    listInstitutions,
    getPendingClaims,
    rejectClaim,
    approveClaimAndMint,
    uploadFileToIpfs,
    uploadJsonToIpfs,
    fileToBase64,
    issueOffer,
    getIssuerMintedCount,
    getIssuerBatchStats,
    createIssuerTemplate,
    getMyIssuerTemplates,
    deactivateIssuerTemplate,
    createBatchIssuance,
    getMyIssuerBatches,
    unlockMasterSeedSession,
    getMyFiles,
    getUserCategories,
    clearSessionSeed
  } = useTrustProtocol();

  const [error, setError] = useState("");
  const [issuerName, setIssuerName] = useState("");
  const [issuerOk, setIssuerOk] = useState(false);
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const apiKey = String(import.meta.env.VITE_TRUSTCONNECT_API_KEY || "").trim();

  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [statsLoading, setStatsLoading] = useState(false);
  const [templateCount, setTemplateCount] = useState(0);
  const [totalIssuedCount, setTotalIssuedCount] = useState(0);
  const [unclaimedCount, setUnclaimedCount] = useState(0);

  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateCreateOpen, setTemplateCreateOpen] = useState(false);
  const [templateCreateWorking, setTemplateCreateWorking] = useState(false);
  const [templateCreateError, setTemplateCreateError] = useState("");
  const [templateIdDraft, setTemplateIdDraft] = useState("");
  const [templateNameDraft, setTemplateNameDraft] = useState("");
  const [templateCategoryDraft, setTemplateCategoryDraft] = useState("Academic Certification");
  const [templateDescriptionDraft, setTemplateDescriptionDraft] = useState("");
  const [templateCoverUrlDraft, setTemplateCoverUrlDraft] = useState("");
  const [templateCoverFile, setTemplateCoverFile] = useState(null);
  const [templateCoverPresetId, setTemplateCoverPresetId] = useState("slate");
  const [templateCoverPresetSvg, setTemplateCoverPresetSvg] = useState("");
  const [templateHasAttachment, setTemplateHasAttachment] = useState(false);
  const [templateFieldsDraft, setTemplateFieldsDraft] = useState(() => [
    { id: "f1", key: "name", type: "Text", required: true },
    { id: "f2", key: "role", type: "Text", required: true },
    { id: "f3", key: "expiresAt", type: "Date", required: false }
  ]);
  const [templateDetailOpen, setTemplateDetailOpen] = useState(false);
  const [templateDetailWorking, setTemplateDetailWorking] = useState(false);
  const [templateDetailError, setTemplateDetailError] = useState("");
  const [templateDetailSchema, setTemplateDetailSchema] = useState(null);
  const [templateDetailTemplate, setTemplateDetailTemplate] = useState(null);
  const [templateDeleteWorking, setTemplateDeleteWorking] = useState(false);

  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [batchSearch, setBatchSearch] = useState("");
  const [batchPage, setBatchPage] = useState(1);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchWorking, setBatchWorking] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [batchTemplateId, setBatchTemplateId] = useState("");
  const [batchCsvText, setBatchCsvText] = useState("");
  const [batchAttachmentColumn, setBatchAttachmentColumn] = useState("attachment_path");
  const [batchAttachments, setBatchAttachments] = useState([]);
  const [batchProgressText, setBatchProgressText] = useState("");
  const [batchResult, setBatchResult] = useState(null);

  useEffect(() => {
    setBatchPage(1);
  }, [batchSearch, batches.length]);

  const filteredBatches = useMemo(() => {
    const q = String(batchSearch || "").trim().toLowerCase();
    if (!q) return batches || [];
    return (batches || []).filter((b) => {
      const hay = `${b.templateId || ""} ${b.merkleRoot || ""} ${b.distributionCID || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [batchSearch, batches]);

  const batchPageSize = 10;
  const batchTotalPages = Math.max(1, Math.ceil(filteredBatches.length / batchPageSize));
  const batchSafePage = Math.min(Math.max(batchPage, 1), batchTotalPages);
  const batchPageRows = useMemo(() => {
    const start = (batchSafePage - 1) * batchPageSize;
    return filteredBatches.slice(start, start + batchPageSize);
  }, [batchSafePage, filteredBatches]);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewClaim, setReviewClaim] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewPayload, setReviewPayload] = useState(null);
  const [reviewRejectReason, setReviewRejectReason] = useState("");
  const [reviewBadgeFile, setReviewBadgeFile] = useState(null);
  const [reviewWorking, setReviewWorking] = useState(false);

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueError, setIssueError] = useState("");
  const [issueStudentAddress, setIssueStudentAddress] = useState("");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueCategory, setIssueCategory] = useState(0);
  const [issueBadgeFile, setIssueBadgeFile] = useState(null);
  const [issueFile, setIssueFile] = useState(null);
  const [issueWorking, setIssueWorking] = useState(false);

  const [archivePickOpen, setArchivePickOpen] = useState(false);
  const [archivePickPassword, setArchivePickPassword] = useState("");
  const [archivePickError, setArchivePickError] = useState("");
  const [archivePickWorking, setArchivePickWorking] = useState(false);
  const [archivePickSeedHex, setArchivePickSeedHex] = useState("");
  const [archiveCategories, setArchiveCategories] = useState(() => defaultArchiveCategoryNames());
  const [archiveCategorySyncing, setArchiveCategorySyncing] = useState(false);
  const [archivePickCategoryName, setArchivePickCategoryName] = useState("Original Documents");
  const [archivePickFiles, setArchivePickFiles] = useState([]);
  const [archivePickSelectedId, setArchivePickSelectedId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError("");
      setIssuerName("");
      setIssuerOk(false);
      if (!account) return;
      try {
        const ok = await isInstitution(account);
        if (!ok) {
          if (!cancelled) setIssuerOk(false);
          return;
        }
        if (!cancelled) setIssuerOk(true);
        try {
          const inst = await listInstitutions();
          const me = inst.find((x) => String(x.address || "").toLowerCase() === String(account || "").toLowerCase());
          if (!cancelled) setIssuerName(me?.name || "Approved Issuer");
        } catch {
          if (!cancelled) setIssuerName("Approved Issuer");
        }
      } catch (e) {
        if (!cancelled) setError(parseProviderError(e));
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [account, isInstitution, listInstitutions, parseProviderError]);

  async function refreshArchiveCategories() {
    if (!account) {
      setArchiveCategories(defaultArchiveCategoryNames());
      return;
    }
    setArchiveCategorySyncing(true);
    try {
      const list = await getUserCategories();
      const base = list.length ? list : defaultArchiveCategoryNames();
      const mapped = (base || []).map((x) => normalizeArchiveCategoryName(x)).filter(Boolean);
      const uniq = [];
      for (const n of mapped) if (!uniq.includes(n)) uniq.push(n);
      const next = uniq.length ? uniq : defaultArchiveCategoryNames();
      setArchiveCategories(next);
      setArchivePickCategoryName((prev) => {
        const current = normalizeArchiveCategoryName(prev);
        if (next.includes(current)) return current;
        return next[0] || current || "Original Documents";
      });
    } catch {
      setArchiveCategories(defaultArchiveCategoryNames());
    } finally {
      setArchiveCategorySyncing(false);
    }
  }

  async function refreshTasks() {
    setError("");
    setIsLoading(true);
    try {
      const rows = await getPendingClaims();
      setTasks(rows);
    } catch (e) {
      setError(parseProviderError(e));
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshStats() {
    setStatsLoading(true);
    try {
      if (!account) {
        setTemplateCount(0);
        setTotalIssuedCount(0);
        setUnclaimedCount(0);
        return;
      }
      const [batch, minted] = await Promise.all([getIssuerBatchStats(account), getIssuerMintedCount(account)]);
      const tCount = Number(batch?.templateCount || 0);
      const batchIssued = Number(batch?.issuedCount || 0);
      const unclaimed = Number(batch?.unclaimed || 0);
      const legacyIssued = Number(minted || 0);
      setTemplateCount(tCount);
      setUnclaimedCount(unclaimed);
      setTotalIssuedCount(batchIssued + legacyIssued);
    } catch {
      setTemplateCount(0);
      setTotalIssuedCount(0);
      setUnclaimedCount(0);
    } finally {
      setStatsLoading(false);
    }
  }

  async function refreshTemplates() {
    setTemplatesLoading(true);
    try {
      const rows = await getMyIssuerTemplates();
      const activeRows = (rows || []).filter((t) => Boolean(t?.isActive));
      setTemplates(activeRows);
      if (!batchTemplateId) {
        if (activeRows.length) setBatchTemplateId(activeRows[0].templateId);
      } else if (!activeRows.find((t) => String(t.templateId) === String(batchTemplateId))) {
        setBatchTemplateId(activeRows.length ? activeRows[0].templateId : "");
      }
    } catch (e) {
      setError(parseProviderError(e));
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function openTemplateDetail(t) {
    setTemplateDetailError("");
    setTemplateDetailSchema(null);
    setTemplateDetailTemplate(t || null);
    setTemplateDetailOpen(true);
    setTemplateDetailWorking(true);
    try {
      const schema = await fetchJsonFromIpfsCid(t?.schemaCID);
      setTemplateDetailSchema(schema);
    } catch (e) {
      setTemplateDetailError(parseProviderError(e));
    } finally {
      setTemplateDetailWorking(false);
    }
  }

  function closeTemplateDetail() {
    setTemplateDetailOpen(false);
    setTemplateDetailWorking(false);
    setTemplateDetailError("");
    setTemplateDetailSchema(null);
    setTemplateDetailTemplate(null);
  }

  async function deleteTemplate(t) {
    setError("");
    try {
      const ok = window.confirm(`确认删除模板「${t?.templateId || ""}」？删除后将无法用于创建新批次。`);
      if (!ok) return;
      setTemplateDeleteWorking(true);
      await deactivateIssuerTemplate({ templateId: t.templateId });
      setTemplates((prev) => (prev || []).filter((x) => String(x?.templateId) !== String(t?.templateId)));
      await refreshTemplates();
      await refreshStats();
    } catch (e) {
      setError(parseProviderError(e));
    } finally {
      setTemplateDeleteWorking(false);
    }
  }

  async function refreshBatches() {
    setBatchesLoading(true);
    try {
      const rows = await getMyIssuerBatches();
      setBatches(rows);
    } catch (e) {
      setError(parseProviderError(e));
    } finally {
      setBatchesLoading(false);
    }
  }

  useEffect(() => {
    if (!account || !issuerOk) return;
    refreshTasks();
    refreshStats();
    refreshTemplates();
    refreshBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, issuerOk]);

  async function openReview(claim) {
    setReviewError("");
    setReviewClaim(claim);
    setReviewPayload(null);
    setReviewRejectReason("");
    setReviewBadgeFile(null);
    setReviewOpen(true);
    setReviewLoading(true);
    try {
      const cid = claim?.reviewCid;
      if (!cid) throw new Error("缺少审核 CID");
      if (!account) throw new Error("请先连接钱包");
      const { raw } = await fetchEncryptedFromPinataGateway(cid);
      const ivHex = typeof raw?.ivHex === "string" ? raw.ivHex : "";
      const ciphertext = typeof raw?.ciphertext === "string" ? raw.ciphertext : "";
      if (!ivHex || !ciphertext) throw new Error("审核文件格式不正确");
      const key = deriveReviewKeyWordArray(account);
      const plain = decryptWithDerivedKey({ ciphertext, ivHex, key });
      const parsed = JSON.parse(plain);
      setReviewPayload(parsed);
    } catch (e) {
      setReviewError(parseProviderError(e));
    } finally {
      setReviewLoading(false);
    }
  }

  function openIssue() {
    setIssueError("");
    setIssueStudentAddress("");
    setIssueTitle("");
    setIssueCategory(0);
    setIssueBadgeFile(null);
    setIssueFile(null);
    setIssueWorking(false);
    setIssueOpen(true);
  }

  function closeIssue() {
    setIssueOpen(false);
    setIssueError("");
    setIssueWorking(false);
  }

  function openTemplateCreate() {
    setTemplateCreateError("");
    setTemplateIdDraft("");
    setTemplateNameDraft("");
    setTemplateCategoryDraft("Academic Certification");
    setTemplateDescriptionDraft("");
    setTemplateCoverUrlDraft("");
    setTemplateCoverFile(null);
    const presets = coverPresetOptions({ title: "Credential", issuerName: issuerName || "Issuer" });
    const first = presets[0] || null;
    setTemplateCoverPresetId(first?.id || "slate");
    setTemplateCoverPresetSvg(first?.svg || "");
    setTemplateHasAttachment(false);
    setTemplateFieldsDraft([
      { id: crypto.randomUUID(), key: "name", type: "Text", required: true },
      { id: crypto.randomUUID(), key: "role", type: "Text", required: true },
      { id: crypto.randomUUID(), key: "expiresAt", type: "Date", required: false }
    ]);
    setTemplateCreateOpen(true);
  }

  function downloadCsvForTemplateDesign({ templateId, name, fields, hasPrivateAttachment }) {
    const file = `${sanitizeFileName(name || templateId || "template")}_template.csv`;
    const csv = buildCsvTemplate({ fields, hasPrivateAttachment: Boolean(hasPrivateAttachment) });
    downloadTextFile({ filename: file, content: csv, mime: "text/csv;charset=utf-8" });
  }

  async function submitTemplateCreate() {
    setTemplateCreateError("");
    setTemplateCreateWorking(true);
    try {
      const tid = String(templateIdDraft || "").trim();
      if (!tid) throw new Error("模板 ID 不能为空");
      const fields = (templateFieldsDraft || [])
        .map((f) => ({
          key: String(f.key || "").trim(),
          type: normalizeFieldType(f.type),
          required: Boolean(f.required)
        }))
        .filter((f) => f.key);
      if (!fields.length) throw new Error("至少添加 1 个字段");
      const keySet = new Set();
      for (const f of fields) {
        if (keySet.has(f.key.toLowerCase())) throw new Error(`字段 Key 重复：${f.key}`);
        keySet.add(f.key.toLowerCase());
      }
      let imageUri = "";
      if (templateCoverFile) {
        const imageCid = await uploadFileToIpfs(templateCoverFile);
        imageUri = toIpfsUri(imageCid);
      } else if (templateCoverPresetSvg) {
        const file = new File([templateCoverPresetSvg], `badge-${templateCoverPresetId || "preset"}.svg`, { type: "image/svg+xml" });
        const imageCid = await uploadFileToIpfs(file);
        imageUri = toIpfsUri(imageCid);
      }

      const schema = buildTemplateSchema({
        templateId: tid,
        name: templateNameDraft,
        category: templateCategoryDraft,
        description: templateDescriptionDraft,
        image: imageUri,
        hasPrivateAttachment: Boolean(templateHasAttachment),
        fields
      });
      const schemaCID = await uploadJsonToIpfs(schema);
      await createIssuerTemplate({ templateId: tid, hasPrivateAttachment: Boolean(templateHasAttachment), schemaCID });
      setTemplateCreateOpen(false);
      await refreshTemplates();
      await refreshStats();
    } catch (e) {
      setTemplateCreateError(parseProviderError(e));
    } finally {
      setTemplateCreateWorking(false);
    }
  }

  function openBatchIssuance() {
    setBatchError("");
    setBatchCsvText("");
    setBatchAttachmentColumn("attachment_path");
    setBatchAttachments([]);
    setBatchProgressText("");
    setBatchResult(null);
    setBatchOpen(true);
    refreshTemplates();
  }

  async function buildAndSubmitBatch() {
    setBatchError("");
    setBatchProgressText("");
    setBatchResult(null);
    setBatchWorking(true);
    try {
      if (!account) throw new Error("请先连接钱包");
      const tpl = templates.find((t) => t.templateId === batchTemplateId) || null;
      if (!tpl) throw new Error("请先选择模板");
      const templateSchema = await fetchJsonFromIpfsCid(tpl.schemaCID);
      const schemaFields = Array.isArray(templateSchema?.fields) ? templateSchema.fields : [];
      if (!schemaFields.length) throw new Error("模板 schema 缺少 fields 定义");
      const templateCategory = String(templateSchema?.category || "Academic Certification");
      const coverImageUrl = String(templateSchema?.image || templateSchema?.coverImageUrl || "");
      const parsed = parseCsv(batchCsvText);
      if (!parsed.rows.length) throw new Error("CSV 为空或格式不正确");
      const addrKey =
        parsed.header.find((h) => h.toLowerCase() === "wallet_address") || parsed.header.find((h) => h.toLowerCase() === "address") || "";
      if (!addrKey) throw new Error("CSV 必须包含 wallet_address 列");

      // --- Collect all recipient addresses from CSV ---
      const headerKeyMap = new Map();
      for (const h of parsed.header || []) headerKeyMap.set(String(h || "").toLowerCase(), h);

      // Optional: CSV may contain a "public_key" column as an override
      const pubKeyCol =
        parsed.header.find((h) => h.toLowerCase() === "public_key") ||
        parsed.header.find((h) => h.toLowerCase() === "publickey") ||
        "";

      const allAddresses = [];
      const csvRowsForSchema = [];

      for (let i = 0; i < parsed.rows.length; i++) {
        const r = parsed.rows[i];
        const rawAddr = String(r[addrKey] || "").trim();
        const userAddress = ethers.getAddress(rawAddr);
        allAddresses.push(userAddress);

        // Build per-row field values for schema validation
        const rowFields = {};
        for (const f of schemaFields) {
          const key = String(f?.key || "").trim();
          if (!key) continue;
          const col = headerKeyMap.get(key.toLowerCase()) || key;
          rowFields[key] = String(r[col] ?? "").trim();
        }
        csvRowsForSchema.push(rowFields);
      }

      // --- Fetch recipient public keys from backend ---
      // These were registered when each user first connected their wallet.
      setBatchProgressText("Fetching recipient public keys from registry...");
      let pubKeyMap = new Map();
      try {
        const res = await fetch("/api/users/public-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: allAddresses })
        });
        if (!res.ok) throw new Error(`Backend responded with ${res.status}`);
        const data = await res.json();
        // Expected response: { keys: { "0xAAA...": "0x04...", "0xBBB...": "0x04..." } }
        const keysObj = data?.keys || {};
        for (const [addr, key] of Object.entries(keysObj)) {
          if (key) pubKeyMap.set(addr.toLowerCase(), key);
        }
      } catch (fetchErr) {
        throw new Error(
          `Failed to fetch recipient public keys from backend: ${fetchErr.message}. ` +
          `Ensure all recipients have connected to TrustArchive at least once.`
        );
      }

      // --- Build recipients array, merging CSV overrides with backend keys ---
      const recipients = [];
      for (let i = 0; i < allAddresses.length; i++) {
        const userAddress = allAddresses[i];
        const r = parsed.rows[i];

        // Priority: CSV public_key column > backend registry
        let publicKey = pubKeyCol ? String(r[pubKeyCol] || "").trim() : "";
        if (!publicKey) {
          publicKey = pubKeyMap.get(userAddress.toLowerCase()) || "";
        }

        if (!publicKey) {
          throw new Error(
            `Missing public key for recipient ${userAddress}. ` +
            `This user has not registered their public key yet. ` +
            `They must connect to TrustArchive at least once, or provide the key in a "public_key" CSV column.`
          );
        }

        recipients.push({ address: userAddress, publicKey });
      }

      // --- Read the shared attachment file into an ArrayBuffer (if applicable) ---
      let fileBuffer = null;
      if (tpl.hasPrivateAttachment && batchAttachments.length > 0) {
        const attachFile = batchAttachments[0];
        setBatchProgressText("Reading attachment file...");
        fileBuffer = await attachFile.arrayBuffer();
      }

      // --- Delegate to the hybrid-encryption batch service ---
      const result = await batchIssueEncryptedSBTs({
        fileBuffer,
        recipients,
        templateId: batchTemplateId,
        templateSchema,
        issuerName: issuerName || "Approved Issuer",
        issuerAddress: account,
        coverImageUrl,
        templateCategory,
        csvRows: csvRowsForSchema,
        schemaFields,
        uploadJsonToIpfs,
        createBatchIssuance,
        onProgress: (msg) => setBatchProgressText(msg)
      });

      setBatchProgressText("交易已确认，正在刷新批次...");
      setBatchResult({
        merkleRoot: result.merkleRoot,
        distributionCID: result.distributionCID,
        total: result.total
      });
      setBatchProgressText("完成");
      setBatchOpen(false);
      await refreshBatches();
      await refreshStats();
    } catch (e) {
      setBatchError(parseProviderError(e));
    } finally {
      setBatchWorking(false);
    }
  }

  async function handleIssueSubmit() {
    setIssueError("");
    setIssueWorking(true);
    try {
      if (!account) throw new Error("请先连接钱包");
      const instOk = await isInstitution(account);
      if (!instOk) throw new Error("当前地址不是已授权机构");
      const to = issueStudentAddress.trim();
      if (!to) throw new Error("请输入用户地址");
      const title = issueTitle.trim();
      if (!title) throw new Error("请输入凭证名称");
      if (!issueFile) throw new Error("请上传凭证文件（PDF/图片）");
      const isArchiveObj = typeof issueFile === "object" && issueFile && typeof issueFile.dataUrl === "string";
      const dataUrl = isArchiveObj ? issueFile.dataUrl : await fileToBase64(issueFile);
      const name = isArchiveObj ? String(issueFile.name || "attachment") : issueFile.name;
      const size = Number(isArchiveObj ? issueFile.size : issueFile.size);
      if (size > MAX_FILE_SIZE_BYTES) throw new Error(`文件过大（${formatBytes(size)}）`);
      const attachmentType =
        (isArchiveObj ? String(issueFile.type || "") : issueFile.type) || (isPdfLike({ name }) ? "application/pdf" : "");
      const attachmentCid = await uploadJsonToIpfs({
        kind: "credential-offer-attachment",
        name,
        type: attachmentType,
        size,
        dataUrl,
        student: to,
        title,
        category: Number(issueCategory) || 0,
        issuer: account,
        createdAt: new Date().toISOString()
      });

      let publicImageCid = "";
      if (issueBadgeFile) {
        publicImageCid = await uploadFileToIpfs(issueBadgeFile);
      } else {
        const svg = makeDefaultBadgeSvg({ title, issuerName });
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const badgeFile = new File([blob], "badge.svg", { type: "image/svg+xml" });
        publicImageCid = await uploadFileToIpfs(badgeFile);
      }

      await issueOffer({
        studentAddress: to,
        title,
        category: Number(issueCategory) || 0,
        publicImageCid,
        attachmentCid
      });
      closeIssue();
      await refreshTasks();
    } catch (e) {
      setIssueError(parseProviderError(e));
      setIssueWorking(false);
    }
  }

  function openArchivePickForIssue() {
    setArchivePickPassword("");
    setArchivePickError("");
    setArchivePickWorking(false);
    setArchivePickSeedHex("");
    setArchivePickCategoryName("Original Documents");
    setArchivePickFiles([]);
    setArchivePickSelectedId("");
    setArchivePickOpen(true);
    refreshArchiveCategories();
  }

  async function loadArchivePickFiles() {
    setArchivePickError("");
    if (!account) {
      setArchivePickError("请先连接钱包");
      return;
    }
    const pwd = String(archivePickPassword || "");
    if (!pwd) {
      setArchivePickError("个人密码不能为空");
      return;
    }
    setArchivePickWorking(true);
    try {
      const seedHex = await unlockMasterSeedSession({ personalPassword: pwd });
      setArchivePickSeedHex(seedHex);
      const rows = await getMyFiles();
      const out = [];
      for (const r of rows) {
        const name = decryptArchiveField({ seedHex, encText: r.nameEnc });
        const categoryName = decryptArchiveField({ seedHex, encText: r.categoryEnc });
        out.push({
          id: String(r.id),
          cid: String(r.cid || ""),
          name: String(name || "未命名"),
          categoryName: normalizeArchiveCategoryName(categoryName),
          mime: String(r.mime || ""),
          size: Number(r.size || 0),
          createdAt: Number(r.createdAt || 0)
        });
      }
      setArchivePickFiles(out);
    } catch (e) {
      setArchivePickError(parseProviderError(e));
    } finally {
      setArchivePickWorking(false);
    }
  }

  const archivePickVisibleFiles = useMemo(() => {
    const cat = normalizeArchiveCategoryName(archivePickCategoryName);
    return (archivePickFiles || []).filter((f) => normalizeArchiveCategoryName(f.categoryName) === cat);
  }, [archivePickCategoryName, archivePickFiles]);

  async function confirmArchivePick() {
    setArchivePickError("");
    if (!account) {
      setArchivePickError("请先连接钱包");
      return;
    }
    const seedHex = String(archivePickSeedHex || "");
    if (!seedHex) {
      setArchivePickError("请先解锁并加载档案列表");
      return;
    }
    const selected = archivePickVisibleFiles.find((x) => x.id === archivePickSelectedId) || null;
    if (!selected) {
      setArchivePickError("请先选择一个档案");
      return;
    }
    setArchivePickWorking(true);
    try {
      const payload = await decryptArchivePayloadByCid({ seedHex, cid: selected.cid });
      setIssueFile({
        name: String(payload.name || selected.name || "attachment"),
        type: String(payload.type || selected.mime || ""),
        size: Number(payload.size || selected.size || 0),
        dataUrl: String(payload.dataUrl)
      });
      setArchivePickOpen(false);
      setArchivePickPassword("");
      setArchivePickSeedHex("");
      setArchivePickFiles([]);
      setArchivePickSelectedId("");
      try {
        clearSessionSeed(account);
      } catch {
      }
    } catch (e) {
      setArchivePickError(parseProviderError(e));
    } finally {
      setArchivePickWorking(false);
    }
  }

  function closeReview() {
    setReviewOpen(false);
    setReviewError("");
    setReviewClaim(null);
    setReviewPayload(null);
    setReviewRejectReason("");
    setReviewBadgeFile(null);
    setReviewWorking(false);
    setReviewLoading(false);
  }

  async function handleReject() {
    setReviewError("");
    setReviewWorking(true);
    try {
      if (!reviewClaim) throw new Error("缺少审核对象");
      await rejectClaim({ claimId: reviewClaim.id, reason: reviewRejectReason });
      closeReview();
      await refreshTasks();
    } catch (e) {
      setReviewError(parseProviderError(e));
      setReviewWorking(false);
    }
  }

  async function handleApprove() {
    setReviewError("");
    setReviewWorking(true);
    try {
      if (!reviewClaim) throw new Error("缺少审核对象");
      let publicImageCid = "";
      if (reviewBadgeFile) {
        if (reviewBadgeFile.size > MAX_FILE_SIZE_BYTES) throw new Error(`勋章图片过大（${formatBytes(reviewBadgeFile.size)}）`);
        publicImageCid = await uploadFileToIpfs(reviewBadgeFile);
      } else {
        const svg = makeDefaultBadgeSvg({ title: reviewClaim?.title || "", issuerName });
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const badgeFile = new File([blob], "badge.svg", { type: "image/svg+xml" });
        publicImageCid = await uploadFileToIpfs(badgeFile);
      }
      await approveClaimAndMint({ claimId: reviewClaim.id, publicImageCid, displayed: false });
      closeReview();
      await refreshTasks();
    } catch (e) {
      setReviewError(parseProviderError(e));
      setReviewWorking(false);
    }
  }

  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0E14] p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1)_0%,transparent_70%)] pointer-events-none" />
        <MagneticCard className="max-w-md w-full p-10 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-slate-900/50 shadow-[0_0_30px_rgba(6,182,212,0.2)]">
            <LayoutDashboard className="h-10 w-10 text-cyan-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Issuer Dashboard</h1>
          <p className="text-slate-400 mb-8">Please connect your wallet to access the issuer panel.</p>
        </MagneticCard>
      </div>
    );
  }

  if (!issuerOk) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0E14] p-6">
        <MagneticCard className="max-w-md w-full p-10 text-center border-rose-500/20">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-rose-900/20 shadow-[0_0_30px_rgba(244,63,94,0.2)]">
            <AlertCircle className="h-10 w-10 text-rose-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">403 Forbidden</h1>
          <p className="text-slate-400 mb-6">Access Restricted. Your address is not an authorized institution.</p>
          {error && (
            <div className="mt-4 rounded-xl border border-rose-900/60 bg-rose-950/30 p-3 text-sm text-rose-200">
              {error}
            </div>
          )}
        </MagneticCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] font-sans text-slate-200 selection:bg-cyan-500/30 relative overflow-hidden pb-20">
      {/* Ambient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pb-6 pt-3 md:px-10 md:pb-10 md:pt-4 space-y-8">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-300/80">
              <Shield className="h-3.5 w-3.5" />
              Issuer Dashboard
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <span className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-white/10">
                <Shield className="w-8 h-8 text-cyan-400" />
              </span>
              Issuer Dashboard
            </h1>
            <div className="mt-3 flex items-center gap-3 text-sm text-slate-400">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-slate-300">{formatAddress(account)}</span>
              </div>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300">{issuerName || "Approved Issuer"}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton variant="secondary" onClick={() => navigate("/connect/manage")} icon={Settings}>
              Market
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => setApiKeyOpen(true)} icon={Key}>
              API Key
            </ActionButton>
            <ActionButton
              variant="secondary"
              onClick={() => {
                refreshStats();
                refreshTemplates();
                refreshBatches();
                refreshTasks();
              }}
              disabled={isLoading || statsLoading || templatesLoading || batchesLoading}
              icon={RefreshCw}
            >
              {statsLoading ? "Syncing..." : "Sync Data"}
            </ActionButton>
          </div>
        </header>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-rose-900/60 bg-rose-950/20 p-4 flex items-start gap-3 text-rose-200 mb-6"
          >
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </motion.div>
        )}

        {/* 12-Column Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pb-12">

          {/* Row 1: Stats (Full Width -> 3 Columns) */}
          <div className="col-span-1 md:col-span-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <MagneticCard>
              <StatCard
                label="Active Templates"
                value={templateCount}
                icon={Layers}
                color="purple"
                loading={statsLoading}
              />
            </MagneticCard>
            <MagneticCard>
              <StatCard
                label="Total Credentials"
                value={totalIssuedCount}
                icon={Database}
                color="cyan"
                loading={statsLoading}
              />
            </MagneticCard>
            <MagneticCard>
              <StatCard
                label="Unclaimed"
                value={unclaimedCount}
                icon={Users}
                color="emerald"
                loading={statsLoading}
              />
            </MagneticCard>
          </div>

          {/* Row 2: Main Control Area */}

          {/* Left Area (2/3) */}
          <div className="col-span-1 md:col-span-8 flex flex-col gap-6">

            {/* Direct Issuance */}
            <MagneticCard className="">
              <div className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-5 rounded-[22px] h-full flex flex-col justify-center">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">Direct Issuance</h2>
                    <p className="text-sm text-slate-400 mt-1">Issue a single Soulbound Token to a specific wallet.</p>
                  </div>
                  <ActionButton
                    variant="accent"
                    onClick={openIssue}
                    icon={Plus}
                    disabled={!account}
                    className="active:scale-95 transition-transform"
                  >
                    New Issuance
                  </ActionButton>
                </div>
              </div>
            </MagneticCard>

            {/* Verification Queue */}
            <section className="col-span-1 md:col-span-4 flex flex-col h-full max-h-[calc(100vh-350px)] overflow-hidden">
              <SectionHeader
                title="Verification Queue"
                subtitle="Pending claims requiring review"
                action={
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    onClick={refreshTasks}
                    disabled={isLoading}
                    icon={RefreshCw}
                    className="active:scale-95 transition-transform"
                  >
                    Refresh
                  </ActionButton>
                }
              />
              <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[175px]">
                {isLoading && tasks.length === 0 ? (
                  [1, 2].map((i) => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-800/50 border border-white/5" />
                  ))
                ) : tasks.length === 0 ? (
                  <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/50 text-slate-500">
                      <CheckCircle size={24} />
                    </div>
                    <p className="text-slate-400 text-sm">All caught up! No pending tasks.</p>
                  </div>
                ) : (
                  tasks.map((c) => (
                    <MagneticCard key={c.id} className="p-3 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center transition-all duration-300 hover:scale-[1.01] hover:bg-white/[0.04] hover:border-cyan-500/30 hover:shadow-[0_4px_20px_-12px_rgba(6,182,212,0.5)] cursor-pointer">
                      <div>
                        <h3 className="text-base font-semibold text-slate-100">{c.title}</h3>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 font-mono">
                          <span className="flex items-center gap-1">
                            <Users size={12} />
                            {formatAddress(c.student)}
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText size={12} />
                            CID: {String(c.reviewCid || "").slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                      <ActionButton variant="secondary" onClick={() => openReview(c)} className="shrink-0 active:scale-95 transition-transform">
                        Review
                      </ActionButton>
                    </MagneticCard>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Right Area (1/3) - Templates */}
          <div className="col-span-1 md:col-span-4 flex flex-col h-full max-h-[calc(100vh-350px)] overflow-hidden">
            <SectionHeader
              title="Templates"
              subtitle="Credential schemas"
              action={
                <button
                  onClick={openTemplateCreate}
                  disabled={templateCreateWorking}
                  className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors active:scale-95 transition-transform"
                >
                  <Plus size={18} />
                </button>
              }
            />
            <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-2 min-h-[400px] max-h-[600px]">
              {statsLoading && templates.length === 0 ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-800/50 border border-slate-800" />
                ))
              ) : templates.length === 0 ? (
                <div className="text-center p-6 border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                  No templates created yet.
                </div>
              ) : (
                templates.map((t) => (
                  <div key={t.idHash} className="group relative rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-all duration-300 hover:scale-[1.01] hover:bg-white/[0.04] hover:border-cyan-500/30 hover:shadow-[0_4px_20px_-12px_rgba(6,182,212,0.5)] cursor-pointer">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-slate-200 truncate pr-8">{t.templateId}</h4>
                      <div className="flex gap-1">
                        <button onClick={(e) => { e.stopPropagation(); openTemplateDetail(t); }} className="p-1 text-slate-400 hover:text-cyan-400 transition-colors active:scale-95">
                          <ExternalLink size={14} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteTemplate(t); }} className="p-1 text-slate-400 hover:text-rose-400 transition-colors active:scale-95" disabled={!t.isActive}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {t.hasPrivateAttachment && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] border border-purple-500/20">Private Attach</span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded text-[10px] border ${t.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-800 text-slate-500 border-slate-700"}`}>
                        {t.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const schema = await fetchJsonFromIpfsCid(t.schemaCID);
                            const fields = Array.isArray(schema?.fields) ? schema.fields : [];
                            downloadCsvForTemplateDesign({
                              templateId: t.templateId,
                              name: schema?.name || t.templateId,
                              fields,
                              hasPrivateAttachment: Boolean(schema?.hasPrivateAttachment ?? t.hasPrivateAttachment)
                            });
                          } catch (err) {
                            setError(parseProviderError(err));
                          }
                        }}
                        className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-xs text-slate-300 transition-colors active:scale-95"
                      >
                        <Download size={12} /> CSV
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBatchTemplateId(t.templateId);
                          openBatchIssuance();
                        }}
                        disabled={!t.isActive}
                        className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-xs text-slate-300 transition-colors disabled:opacity-50 active:scale-95"
                      >
                        <Layers size={12} /> Batch
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Row 3: Batch History (Full Width) */}
          <div className="col-span-1 md:col-span-12">
            <SectionHeader
              title="Batch History"
              subtitle="Merkle tree issuances"
              action={
                <button
                  onClick={openBatchIssuance}
                  disabled={batchWorking}
                  className="p-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors active:scale-95 transition-transform"
                >
                  <Plus size={18} />
                </button>
              }
            />
            <div className="mb-4 relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input
                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-200 focus:outline-none focus:border-slate-600 transition-colors"
                placeholder="Search root, CID..."
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              {batchWorking && batchPageRows.length === 0 ? (
                [1, 2].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-800/50 border border-slate-800" />)
              ) : batchPageRows.length === 0 ? (
                <div className="text-center p-6 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">No batches found.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {batchPageRows.map((b) => (
                    <div key={b.merkleRoot} className="rounded-xl border border-slate-800 bg-slate-900/20 p-4 text-xs flex flex-wrap items-center justify-between gap-4 transition-all duration-300 hover:scale-[1.01] hover:bg-white/[0.04] hover:border-cyan-500/30 hover:shadow-[0_4px_20px_-12px_rgba(6,182,212,0.5)] cursor-pointer">
                      <div className="flex-1 min-w-[200px]">
                        <div className="font-semibold text-slate-300 mb-1 text-base">{b.templateId}</div>
                        <div className="flex gap-4 text-slate-500 font-mono">
                          <span title={b.merkleRoot}>Root: {b.merkleRoot.slice(0, 10)}...</span>
                          <span title={b.distributionCID}>CID: {b.distributionCID.slice(0, 10)}...</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 block mb-1">Progress</span>
                        <span className="text-cyan-400 font-mono text-lg">{b.claimed} / {b.total}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {batchTotalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
                <span>Page {batchSafePage} of {batchTotalPages}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setBatchPage((p) => Math.max(1, p - 1))}
                    disabled={batchSafePage <= 1}
                    className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 active:scale-95 transition-transform"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setBatchPage((p) => Math.min(batchTotalPages, p + 1))}
                    disabled={batchSafePage >= batchTotalPages}
                    className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 active:scale-95 transition-transform"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* --- Modals --- */}

      {/* API Key Modal */}
      <Modal isOpen={apiKeyOpen} onClose={() => setApiKeyOpen(false)} title="API Key Configuration">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
            <div className="text-xs text-slate-400 mb-2">Current Environment Key</div>
            <div className="p-3 rounded-lg bg-black/50 border border-slate-800 font-mono text-xs text-cyan-400 break-all">
              {apiKey || "VITE_TRUSTCONNECT_API_KEY is not set"}
            </div>
          </div>
          <div className="flex gap-3">
            <ActionButton onClick={async () => { try { await navigator.clipboard.writeText(apiKey); } catch { } }} disabled={!apiKey} variant="secondary">
              Copy Key
            </ActionButton>
          </div>
          {!apiKey && <p className="text-xs text-amber-500">Please add VITE_TRUSTCONNECT_API_KEY to your .env file and restart.</p>}
        </div>
      </Modal>

      {/* Template Create Modal */}
      <Modal
        isOpen={templateCreateOpen}
        onClose={() => setTemplateCreateOpen(false)}
        title="Create Credential Template"
        footer={
          <div className="flex justify-end gap-3">
            <ActionButton variant="ghost" onClick={() => setTemplateCreateOpen(false)} disabled={templateCreateWorking}>Cancel</ActionButton>
            <ActionButton variant="primary" onClick={submitTemplateCreate} disabled={templateCreateWorking || !templateIdDraft.trim()}>
              {templateCreateWorking ? "Minting..." : "Create Template"}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-6">
          {templateCreateError && (
            <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-200 text-sm">{templateCreateError}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm text-slate-400">Template ID</label>
              <input
                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-cyan-500/50 outline-none"
                value={templateIdDraft}
                onChange={(e) => setTemplateIdDraft(e.target.value)}
                placeholder="e.g. employee-proof-v1"
                disabled={templateCreateWorking}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-400">Name</label>
              <input
                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-cyan-500/50 outline-none"
                value={templateNameDraft}
                onChange={(e) => setTemplateNameDraft(e.target.value)}
                placeholder="e.g. Employee Certificate"
                disabled={templateCreateWorking}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-400">Description</label>
            <textarea
              className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-cyan-500/50 outline-none min-h-[80px]"
              value={templateDescriptionDraft}
              onChange={(e) => setTemplateDescriptionDraft(e.target.value)}
              placeholder="Internal description..."
              disabled={templateCreateWorking}
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm text-slate-400">Cover Design</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {coverPresetOptions({
                title: templateNameDraft || templateIdDraft || "Credential",
                issuerName: issuerName || "Issuer"
              }).map((p) => {
                const preview = svgToDataUrl(p.svg);
                const selected = !templateCoverFile && templateCoverPresetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${selected ? "border-cyan-500 ring-2 ring-cyan-500/20" : "border-transparent opacity-60 hover:opacity-100"}`}
                    onClick={() => {
                      setTemplateCoverFile(null);
                      setTemplateCoverPresetId(p.id);
                      setTemplateCoverPresetSvg(p.svg);
                      setTemplateCoverUrlDraft("");
                    }}
                    disabled={templateCreateWorking}
                  >
                    <img src={preview} alt={p.label} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Or upload custom:</span>
              <input
                type="file"
                accept="image/*,.svg"
                className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setTemplateCoverFile(f);
                  setTemplateCoverUrlDraft("");
                }}
                disabled={templateCreateWorking}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-offset-slate-900"
                  checked={templateHasAttachment}
                  onChange={(e) => setTemplateHasAttachment(e.target.checked)}
                  disabled={templateCreateWorking}
                />
                <span className="text-sm font-medium text-slate-200">Enable Private Attachments</span>
              </label>
              <ActionButton size="sm" variant="secondary" onClick={() => setTemplateFieldsDraft(p => [...(p || []), { id: crypto.randomUUID(), key: "", type: "Text", required: false }])} disabled={templateCreateWorking}>
                <Plus size={14} /> Add Field
              </ActionButton>
            </div>

            <div className="space-y-2">
              {(templateFieldsDraft || []).map((f, idx) => (
                <div key={f.id} className="flex flex-wrap md:flex-nowrap gap-2 items-center bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                  <input
                    className="flex-1 min-w-[120px] bg-transparent border-b border-slate-700 focus:border-cyan-500 px-2 py-1 text-sm text-slate-200 outline-none"
                    placeholder="Field Key"
                    value={f.key}
                    onChange={(e) => setTemplateFieldsDraft(p => p.map(x => x.id === f.id ? { ...x, key: e.target.value } : x))}
                  />
                  <select
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none"
                    value={f.type}
                    onChange={(e) => setTemplateFieldsDraft(p => p.map(x => x.id === f.id ? { ...x, type: e.target.value } : x))}
                  >
                    <option value="Text">Text</option>
                    <option value="Number">Number</option>
                    <option value="Date">Date</option>
                    <option value="URL">URL</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer px-2">
                    <input type="checkbox" checked={Boolean(f.required)} onChange={(e) => setTemplateFieldsDraft(p => p.map(x => x.id === f.id ? { ...x, required: e.target.checked } : x))} />
                    Req
                  </label>
                  <button
                    onClick={() => setTemplateFieldsDraft(p => p.filter(x => x.id !== f.id))}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                    disabled={(templateFieldsDraft || []).length <= 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Template Detail Modal */}
      <Modal isOpen={templateDetailOpen} onClose={closeTemplateDetail} title="Template Details">
        <div className="space-y-4">
          {templateDetailWorking && <div className="flex justify-center p-4"><Loader2 className="animate-spin text-cyan-500" /></div>}
          {templateDetailSchema && !templateDetailWorking && (
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-1/3 aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                  {templateDetailSchema.image ? (
                    <img src={toIpfsUri(templateDetailSchema.image)} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">No Preview</div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="text-lg font-bold text-white">{templateDetailSchema.name}</div>
                  <div className="text-sm text-slate-400">{templateDetailSchema.description}</div>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 rounded bg-slate-800 text-xs text-slate-300">{templateDetailSchema.category}</span>
                    {templateDetailSchema.hasPrivateAttachment && <span className="px-2 py-1 rounded bg-purple-900/30 text-purple-300 text-xs border border-purple-800/50">Encrypted Attachment</span>}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-2">Schema Fields</h4>
                <div className="grid gap-2">
                  {(Array.isArray(templateDetailSchema.fields) ? templateDetailSchema.fields : []).map(f => (
                    <div key={f.key} className="flex justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                      <span className="text-sm text-slate-200 font-mono">{f.key}</span>
                      <div className="flex gap-3 text-xs">
                        <span className="text-slate-500">{f.type}</span>
                        {f.required && <span className="text-amber-500">Required</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Batch Issuance Modal */}
      <Modal
        isOpen={batchOpen}
        onClose={() => setBatchOpen(false)}
        title="Batch Issuance Engine"
        footer={
          <div className="flex justify-end gap-3">
            <ActionButton variant="ghost" onClick={() => setBatchOpen(false)} disabled={batchWorking}>Cancel</ActionButton>
            <ActionButton variant="primary" onClick={buildAndSubmitBatch} disabled={batchWorking || !batchTemplateId || !batchCsvText.trim()}>
              {batchWorking ? "Processing..." : "Generate & Mint"}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-5">
          {batchError && <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-200 text-sm">{batchError}</div>}
          {batchProgressText && <div className="text-sm text-cyan-400 animate-pulse">{batchProgressText}</div>}

          <div className="space-y-1">
            <label className="text-sm text-slate-400">Select Template</label>
            <select
              className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-cyan-500/50 outline-none"
              value={batchTemplateId}
              onChange={(e) => setBatchTemplateId(e.target.value)}
              disabled={batchWorking}
            >
              <option value="" disabled>Select a template...</option>
              {templates.map(t => (
                <option key={t.idHash} value={t.templateId}>
                  {t.templateId} {t.hasPrivateAttachment ? "(with attachment)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-slate-400">CSV Data</label>
            <div className="relative">
              <textarea
                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-sm text-slate-300 font-mono focus:border-cyan-500/50 outline-none min-h-[120px]"
                value={batchCsvText}
                onChange={(e) => setBatchCsvText(e.target.value)}
                placeholder="wallet_address,name,role..."
                disabled={batchWorking}
              />
              <div className="absolute bottom-2 right-2">
                <label className="cursor-pointer px-2 py-1 rounded bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                  Upload CSV
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setBatchCsvText(await f.text());
                  }} disabled={batchWorking} />
                </label>
              </div>
            </div>
          </div>

          {templates.find((t) => t.templateId === batchTemplateId)?.hasPrivateAttachment && (
            <div className="p-4 rounded-xl bg-purple-900/10 border border-purple-500/20 space-y-4">
              <h4 className="text-sm font-semibold text-purple-200">Private Attachments Configuration</h4>
              <div className="space-y-1">
                <label className="text-xs text-purple-300/70">CSV Column Name for Filename</label>
                <input
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-2 text-sm text-white"
                  value={batchAttachmentColumn}
                  onChange={(e) => setBatchAttachmentColumn(e.target.value)}
                  placeholder="attachment_path"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-purple-300/70">Upload Files (Multi-select)</label>
                <input
                  type="file" multiple
                  className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:bg-slate-800 file:text-slate-200"
                  onChange={(e) => setBatchAttachments(Array.from(e.target.files || []))}
                  disabled={batchWorking}
                />
                <div className="text-xs text-slate-500">{batchAttachments.length} files selected</div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Review Modal */}
      <Modal
        isOpen={reviewOpen}
        onClose={closeReview}
        title="Review Claim"
        footer={
          <div className="flex justify-end gap-3">
            <ActionButton variant="danger" onClick={handleReject} disabled={reviewWorking}>Reject</ActionButton>
            <ActionButton variant="primary" onClick={handleApprove} disabled={reviewWorking}>Approve & Mint</ActionButton>
          </div>
        }
      >
        <div className="space-y-5">
          {reviewError && <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-200 text-sm">{reviewError}</div>}
          {reviewLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-cyan-500" /></div>
          ) : (
            <>
              {reviewPayload && (
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Title</div>
                      <div className="text-sm text-white font-medium">{reviewPayload.title}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">File Name</div>
                      <div className="text-sm text-white font-medium">{reviewPayload.name}</div>
                    </div>
                  </div>
                  {reviewPayload.dataUrl && (
                    <div className="pt-2">
                      <div className="text-xs text-slate-500 mb-2">Preview</div>
                      {reviewPayload.type?.startsWith("image") ? (
                        <img src={reviewPayload.dataUrl} className="max-h-48 rounded border border-slate-700" />
                      ) : (
                        <div className="p-3 bg-slate-800 rounded text-xs text-slate-300 font-mono break-all">
                          {reviewPayload.dataUrl.slice(0, 50)}... (Non-image data)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm text-slate-400">Custom Badge Image (Optional)</label>
                <input
                  type="file" accept="image/*,.svg"
                  className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:bg-slate-800 file:text-slate-200"
                  onChange={(e) => setReviewBadgeFile(e.target.files?.[0] || null)}
                  disabled={reviewWorking}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm text-slate-400">Rejection Reason</label>
                <textarea
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-rose-500/50 outline-none"
                  placeholder="Only required if rejecting..."
                  value={reviewRejectReason}
                  onChange={(e) => setReviewRejectReason(e.target.value)}
                  disabled={reviewWorking}
                />
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Issue Modal */}
      <Modal
        isOpen={issueOpen}
        onClose={closeIssue}
        title="Issue Credential"
        footer={
          <div className="flex justify-end gap-3">
            <ActionButton variant="ghost" onClick={closeIssue} disabled={issueWorking}>Cancel</ActionButton>
            <ActionButton variant="primary" onClick={handleIssueSubmit} disabled={issueWorking || !issueStudentAddress || !issueTitle || !issueFile}>
              {issueWorking ? "Issuing..." : "Send Offer"}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          {issueError && <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-200 text-sm">{issueError}</div>}

          <div className="space-y-1">
            <label className="text-sm text-slate-400">Recipient Address</label>
            <input
              className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-cyan-500/50 outline-none font-mono"
              value={issueStudentAddress}
              onChange={(e) => setIssueStudentAddress(e.target.value)}
              placeholder="0x..."
              disabled={issueWorking}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm text-slate-400">Title</label>
              <input
                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-cyan-500/50 outline-none"
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                placeholder="e.g. Certificate of Excellence"
                disabled={issueWorking}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-400">Category</label>
              <select
                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-cyan-500/50 outline-none"
                value={issueCategory}
                onChange={(e) => setIssueCategory(Number(e.target.value))}
                disabled={issueWorking}
              >
                <option value={0}>Academic</option>
                <option value={1}>Professional</option>
              </select>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-dashed border-slate-700 bg-slate-900/30 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-200">Credential File (Private)</label>
              <button onClick={openArchivePickForIssue} className="text-xs text-cyan-400 hover:text-cyan-300" disabled={!account || issueWorking}>
                Select from Archive
              </button>
            </div>
            <input
              type="file" accept="image/*,.pdf"
              className="w-full text-sm text-slate-400 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-500/10 file:text-cyan-400 hover:file:bg-cyan-500/20"
              onChange={(e) => setIssueFile(e.target.files?.[0] || null)}
              disabled={issueWorking}
            />
            {issueFile && <div className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle size={12} /> {issueFile.name} ({formatBytes(issueFile.size)})</div>}
          </div>

          <div className="p-4 rounded-xl border border-dashed border-slate-700 bg-slate-900/30 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-200">Badge Image (Public)</label>
              <span className="text-[10px] text-slate-500">Optional</span>
            </div>
            <input
              type="file" accept="image/*,.svg"
              className="w-full text-sm text-slate-400 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-500/10 file:text-cyan-400 hover:file:bg-cyan-500/20"
              onChange={(e) => setIssueBadgeFile(e.target.files?.[0] || null)}
              disabled={issueWorking}
            />
            {issueBadgeFile ? (
              <div className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle size={12} /> {issueBadgeFile.name} ({formatBytes(issueBadgeFile.size)})
              </div>
            ) : (
              <p className="text-[10px] text-slate-500">Defaults to generated SVG if empty.</p>
            )}
          </div>
        </div>
      </Modal>

      {/* Archive Pick Modal */}
      <Modal isOpen={archivePickOpen} onClose={() => setArchivePickOpen(false)} title="Select from Archive">
        <div className="space-y-4">
          {archivePickError && <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/50 text-rose-200 text-sm">{archivePickError}</div>}

          <div className="flex gap-2">
            <select
              className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl p-2 text-sm text-white outline-none"
              value={archivePickCategoryName}
              onChange={(e) => setArchivePickCategoryName(e.target.value)}
              disabled={archivePickWorking}
            >
              {archiveCategories.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <input
              type="password"
              className="flex-1 bg-slate-900/50 border border-slate-800 rounded-xl p-2 text-sm text-white outline-none"
              placeholder="Encryption Password"
              value={archivePickPassword}
              onChange={(e) => setArchivePickPassword(e.target.value)}
              disabled={archivePickWorking}
              onKeyDown={(e) => e.key === "Enter" && loadArchivePickFiles()}
            />
            <button
              onClick={loadArchivePickFiles}
              disabled={archivePickWorking || !archivePickPassword}
              className="px-3 py-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {archivePickWorking ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/30 h-64 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {archivePickVisibleFiles.length === 0 ? (
              <div className="flex h-full items-center justify-center text-slate-500 text-sm">No files loaded or found in category.</div>
            ) : (
              archivePickVisibleFiles.map(f => (
                <button
                  key={f.id}
                  onClick={() => setArchivePickSelectedId(f.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${archivePickSelectedId === f.id ? "border-cyan-500 bg-cyan-900/20" : "border-transparent hover:bg-slate-900"}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-slate-200 text-sm truncate">{f.name}</span>
                    <span className="text-xs text-slate-500">{formatBytes(f.size)}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{f.mime}</div>
                </button>
              ))
            )}
          </div>

          <div className="flex justify-end gap-2">
            <ActionButton variant="ghost" onClick={() => setArchivePickOpen(false)}>Cancel</ActionButton>
            <ActionButton variant="primary" onClick={confirmArchivePick} disabled={archivePickWorking || !archivePickSelectedId}>
              Confirm Selection
            </ActionButton>
          </div>
        </div>
      </Modal>

    </div>
  );
}
