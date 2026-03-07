import CryptoJS from "crypto-js";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  FileText,
  Upload,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  MoreHorizontal,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Trash2,
  Lock,
  Share2,
  AlertTriangle,
  File,
  Loader2,
  Award,
  Briefcase,
  GraduationCap,
  Gift,
  Tag,
  Building2,
  ChevronLeft,
  ChevronDown,
  FileUp,
  History,
  Scan,
  FolderOpen,
  Send,
  Hash,
  Archive,
  Zap,
  Settings,
  Unlock,
  Info
} from "lucide-react";
import { useTrustProtocol } from "../hooks/useTrustProtocol";
import { fetchEncryptedFromPinataGateway, decryptWithDerivedKey, deriveFileKey, unpinFromPinata } from "../services/securityService";
import { decryptForSingleRecipient } from "../services/cryptoEnvelope";
import { logSafeLinkCreated } from "../services/trustScoreService";
import SBTCard from "../components/SBTCard";

import { GlassCard, NeonButton, StatusBadge, TabButton, GlassInput, GlassSelect } from "../components/ui/GlassKit";
import {
  cn,
  formatAddress,
  formatBytes,
  categoryLabel,
  claimStatusLabel,
  isPdfLike,
  isImageLike
} from "../utils/credentialUtils";
import CredentialClaimForm from "../components/credential/CredentialClaimForm";
import MerkleClaimQuery from "../components/credential/MerkleClaimQuery";
import PendingCredentialList from "../components/credential/PendingCredentialList";

const PAGE_SIZE = 10;
const MEDAL_PAGE_SIZE = 6;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function deriveReviewKeyWordArray(institutionAddress) {
  return CryptoJS.SHA256(`TA_CLAIM_REVIEW_V1|${String(institutionAddress || "").toLowerCase()}`);
}

function gatewayUrlForCid(cid) {
  const c = String(cid || "").trim();
  if (!c) return "";
  const pinataGateway = import.meta.env.VITE_PINATA_GATEWAY;
  return pinataGateway ? `https://${pinataGateway}/ipfs/${c}` : `https://gateway.pinata.cloud/ipfs/${c}`;
}

function gatewayUrlForTokenUri(uri) {
  const u = String(uri || "").trim();
  if (!u) return "";
  if (u.startsWith("ipfs://")) return gatewayUrlForCid(u.slice("ipfs://".length));
  return u;
}

function tokenMetaCacheKey() {
  return "TA_TOKEN_META_CACHE_V1";
}

function loadTokenMetaCache() {
  try {
    const raw = localStorage.getItem(tokenMetaCacheKey());
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveTokenMetaCache(cache) {
  try {
    localStorage.setItem(tokenMetaCacheKey(), JSON.stringify(cache || {}));
  } catch {
  }
}

async function fetchJsonByUri(uri) {
  const url = gatewayUrlForTokenUri(uri);
  if (!url) throw new Error("Missing URI");
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`Metadata fetch failed (${res.status})`);
  return await res.json();
}

async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read attachment"));
    reader.readAsDataURL(blob);
  });
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(svg || ""))}`;
}

function makeDefaultBadgeSvg({ title, issuerName }) {
  const safeTitle = String(title || "Credential").slice(0, 32);
  const safeIssuer = String(issuerName || "Institution").slice(0, 32);
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
    if (!cipherText) throw new Error("Invalid archive format");
    throw new Error("Invalid archive format");
  }
  const key = deriveFileKey({ masterSeedHex: String(seedHex || ""), fileId: raw.fileId });
  const plain = decryptWithDerivedKey({ ciphertext: String(raw.ciphertext || ""), ivHex: raw.ivHex, key });
  const parsed = parseMaybeJson(plain);
  if (!parsed || typeof parsed !== "object" || !parsed.dataUrl) throw new Error("Invalid decryption result format");
  return parsed;
}

async function fetchJsonByCid(cid) {
  const url = gatewayUrlForCid(cid);
  if (!url) throw new Error("Missing CID");
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`Failed to fetch distribution list (${res.status})`);
  return await res.json();
}

function batchCacheKey() {
  return "TA_BATCH_DISTRIBUTION_CACHE_V1";
}

function loadBatchCache() {
  try {
    const raw = localStorage.getItem(batchCacheKey());
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveBatchCache(cache) {
  try {
    localStorage.setItem(batchCacheKey(), JSON.stringify(cache || {}));
  } catch {
  }
}

function normalizeBatchEntry(e) {
  return {
    address: String(e?.address || ""),
    tokenURI: String(e?.tokenURI || ""),
    attachmentCID: String(e?.attachmentCID || ""),
    proof: Array.isArray(e?.proof) ? e.proof.map((x) => String(x)) : []
  };
}

function batchDismissKey(account) {
  return `TA_BATCH_DISMISS_V1|${String(account || "").toLowerCase()}`;
}

function loadBatchDismissed(account) {
  try {
    const raw = localStorage.getItem(batchDismissKey(account));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) return new Set();
    return new Set(parsed.items.map((x) => String(x)));
  } catch {
    return new Set();
  }
}

function saveBatchDismissed(account, set) {
  try {
    localStorage.setItem(batchDismissKey(account), JSON.stringify({ items: Array.from(set || []) }));
  } catch {
  }
}

function batchPrivateCidKey(account) {
  return `TA_BATCH_PRIVATE_CID_V1|${String(account || "").toLowerCase()}`;
}

function loadBatchPrivateCidMap(account) {
  try {
    const raw = localStorage.getItem(batchPrivateCidKey(account));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveBatchPrivateCidMap(account, map) {
  try {
    localStorage.setItem(batchPrivateCidKey(account), JSON.stringify(map || {}));
  } catch {
  }
}

function sessionSeedStorageKey(account) {
  return `TA_SESSION_MASTER_SEED_${String(account || "").trim().toLowerCase()}`;
}

function hasSessionSeed(account) {
  try {
    const v = sessionStorage.getItem(sessionSeedStorageKey(account)) || "";
    return typeof v === "string" && !!v;
  } catch {
    return false;
  }
}

function shouldHideMetaKey(key) {
  const k = String(key || "").toLowerCase();
  return k.endsWith("cid") || k.endsWith("uri") || k.endsWith("root") || k.endsWith("proof");
}

function filterBusinessMetadata(json) {
  if (!json || typeof json !== "object") return json;
  const allowed = ["name", "category", "issuerName", "issuerAddress", "image", "description", "attributes", "createdAt", "issuedAt", "templateId"];
  const out = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(json, k) && !shouldHideMetaKey(k)) {
      out[k] = json[k];
    }
  }
  if (Array.isArray(out.attributes)) {
    out.attributes = out.attributes
      .map((a) => {
        if (!a || typeof a !== "object") return null;
        const row = {};
        for (const [k, v] of Object.entries(a)) {
          if (shouldHideMetaKey(k)) continue;
          row[k] = v;
        }
        return row;
      })
      .filter(Boolean);
  }
  return out;
}

export default function CredentialCenter() {
  const {
    account,
    parseProviderError,
    listInstitutions,
    getOffersFor,
    getOffer,
    acceptOffer,
    rejectOffer,
    blockIssuer,
    getMyBlockedIssuers,
    submitClaim,
    getMyClaims,
    getMyTokens,
    setDisplayedMany,
    burnMany,
    encryptAndUploadWithMasterSeed,
    uploadJsonToIpfs,
    fileToBase64,
    decryptFromCid,
    decryptFromCidSession,
    unlockMasterSeedSession,
    getMyFiles,
    archiveFileToCategory,
    getUserCategories,
    clearSessionSeed,
    claimIssuerBatch,
    setBatchDisplayedMany,
    burnBatchMany,
    getMyBatchTokens,
    getAllBatchCIDs,
    getBatchByRoot,
    hasClaimedBatchIndex
  } = useTrustProtocol();

  const [error, setError] = useState("");
  const [institutions, setInstitutions] = useState([]);

  const [mode, setMode] = useState("claim");
  const [manageMode, setManageMode] = useState(false);
  const [working, setWorking] = useState(false);

  const [tokens, setTokens] = useState([]);
  const [tokenSearch, setTokenSearch] = useState("");
  const [tokenCategory, setTokenCategory] = useState("all");
  const [tokenPage, setTokenPage] = useState(1);
  const [selectedTokenIds, setSelectedTokenIds] = useState(() => new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [batchUiTick, setBatchUiTick] = useState(0);

  const [claims, setClaims] = useState([]);
  const [myClaimPage, setMyClaimPage] = useState(1);

  const [claimInstitution, setClaimInstitution] = useState("");
  const [claimTitle, setClaimTitle] = useState("");
  const [claimCategory, setClaimCategory] = useState(0);
  const [claimFile, setClaimFile] = useState(null);
  const [claimFileError, setClaimFileError] = useState("");
  const [isClaimSubmitting, setIsClaimSubmitting] = useState(false);

  const [offers, setOffers] = useState([]);
  const [offerPage, setOfferPage] = useState(1);

  const [batchClaimCid, setBatchClaimCid] = useState("");
  const [batchClaimWorking, setBatchClaimWorking] = useState(false);
  const [batchClaimError, setBatchClaimError] = useState("");
  const [batchClaimInfo, setBatchClaimInfo] = useState(null);

  const [batchTokens, setBatchTokens] = useState([]);
  const [batchTokensError, setBatchTokensError] = useState("");

  const [discoveredBatchClaims, setDiscoveredBatchClaims] = useState([]);
  const [discoveryWorking, setDiscoveryWorking] = useState(false);
  const [batchTokenMetas, setBatchTokenMetas] = useState(() => ({}));
  const [blockedIssuers, setBlockedIssuers] = useState(() => []);

  const [metaOpen, setMetaOpen] = useState(false);
  const [metaError, setMetaError] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaJson, setMetaJson] = useState(null);


  const [tokenViewOpen, setTokenViewOpen] = useState(false);
  const [tokenViewError, setTokenViewError] = useState("");
  const [tokenViewToken, setTokenViewToken] = useState(null);
  const [tokenViewPassword, setTokenViewPassword] = useState("");
  const [tokenViewLoading, setTokenViewLoading] = useState(false);
  const [tokenViewPayload, setTokenViewPayload] = useState(null);
  const [shareLink, setShareLink] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [secureShareOpen, setSecureShareOpen] = useState(false);
  const [secureShareWorking, setSecureShareWorking] = useState(false);
  const [secureShareError, setSecureShareError] = useState("");
  const [secureShareNotice, setSecureShareNotice] = useState("");
  const [secureShareLink, setSecureShareLink] = useState("");
  const [secureShareMeta, setSecureShareMeta] = useState(null);
  const [secureShareOptions, setSecureShareOptions] = useState(() => []);
  const [secureShareSelected, setSecureShareSelected] = useState(() => new Set());
  const [tokenAutoArchive, setTokenAutoArchive] = useState(false);

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

  const [archiveStoreOpen, setArchiveStoreOpen] = useState(false);
  const [archiveStoreCategoryName, setArchiveStoreCategoryName] = useState("Original Documents");
  const [archiveStoreWorking, setArchiveStoreWorking] = useState(false);
  const [archiveStoreError, setArchiveStoreError] = useState("");
  const [archiveStoreNotice, setArchiveStoreNotice] = useState("");

  const [archiveQuickOpen, setArchiveQuickOpen] = useState(false);
  const [archiveQuickTarget, setArchiveQuickTarget] = useState(null);
  const [archiveQuickCategoryName, setArchiveQuickCategoryName] = useState("Original Documents");
  const [archiveQuickWorking, setArchiveQuickWorking] = useState(false);
  const [archiveQuickError, setArchiveQuickError] = useState("");
  const [archiveQuickProgress, setArchiveQuickProgress] = useState("");
  const [archiveToast, setArchiveToast] = useState("");

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
      setArchiveStoreCategoryName((prev) => {
        const current = normalizeArchiveCategoryName(prev);
        if (next.includes(current)) return current;
        return next[0] || current || "Original Documents";
      });
      setArchiveQuickCategoryName((prev) => {
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

  async function refreshAll() {
    setError("");
    setWorking(true);
    try {
      const inst = await listInstitutions();
      setInstitutions(inst.filter((x) => x.isActive));
      if (!account) {
        setTokens([]);
        setClaims([]);
        setOffers([]);
        setBatchTokens([]);
        setBatchTokenMetas({});
        setBlockedIssuers([]);
        return;
      }
      const [t, c, o, bt] = await Promise.all([getMyTokens(), getMyClaims(), getOffersFor(account), getMyBatchTokens()]);
      setTokens(t);
      setClaims(c);
      setOffers(o);
      setBatchTokens(bt);
      try {
        const list = await getMyBlockedIssuers();
        setBlockedIssuers(Array.isArray(list) ? list : []);
      } catch {
        setBlockedIssuers([]);
      }
      try {
        const cache = loadTokenMetaCache();
        const now = Date.now();
        const TTL_MS = 24 * 60 * 60 * 1000;
        const metas = {};
        await Promise.all(
          (bt || []).map(async (x) => {
            const uri = String(x?.tokenURI || "").trim();
            if (!uri) return;
            const cached = cache[uri];
            if (cached && typeof cached === "object" && cached.data && Number(cached.ts || 0) + TTL_MS > now) {
              metas[String(x.tokenId)] = cached.data;
              return;
            }
            const data = await fetchJsonByUri(uri);
            cache[uri] = { ts: now, data };
            metas[String(x.tokenId)] = data;
          })
        );
        saveTokenMetaCache(cache);
        setBatchTokenMetas(metas);
      } catch {
        setBatchTokenMetas({});
      }
    } catch (e) {
      setError(parseProviderError(e));
    } finally {
      setWorking(false);
    }
  }

  async function discoverBatchClaims() {
    setError("");
    setDiscoveryWorking(true);
    try {
      if (!account) {
        setDiscoveredBatchClaims([]);
        return;
      }
      let blockedSet = new Set();
      try {
        const list = await getMyBlockedIssuers();
        blockedSet = new Set((list || []).map((x) => String(x || "").toLowerCase()).filter(Boolean));
        setBlockedIssuers(Array.from(blockedSet));
      } catch {
        blockedSet = new Set((blockedIssuers || []).map((x) => String(x || "").toLowerCase()).filter(Boolean));
      }
      const cids = await getAllBatchCIDs();
      if (!cids.length) {
        setDiscoveredBatchClaims([]);
        return;
      }
      const dismissed = loadBatchDismissed(account);

      const cache = loadBatchCache();
      const now = Date.now();
      const TTL_MS = 24 * 60 * 60 * 1000;

      const results = await Promise.all(
        cids.map(async (cid, idx) => {
          const c = String(cid || "").trim();
          if (!c) return null;
          const dismissKey = `${idx}:${c}`;
          if (dismissed.has(dismissKey)) return null;
          let dist = null;
          const cached = cache[c];
          if (cached && typeof cached === "object" && cached.data && Number(cached.ts || 0) + TTL_MS > now) {
            dist = cached.data;
          } else {
            dist = await fetchJsonByCid(c);
            cache[c] = { ts: now, data: dist };
          }
          const entries = Array.isArray(dist?.entries) ? dist.entries : [];
          const normalized = entries.map(normalizeBatchEntry);
          const me =
            normalized.find((x) => String(x.address || "").toLowerCase() === String(account || "").toLowerCase()) || null;
          if (!me) return null;
          const claimed = await hasClaimedBatchIndex({ userAddress: account, batchIndex: idx });
          if (claimed) return null;
          const root = String(dist?.merkleRoot || "").trim();
          if (!root) return null;
          let batch = null;
          try {
            batch = await getBatchByRoot({ merkleRoot: root });
          } catch {
            batch = null;
          }
          const issuerAddress = String(batch?.issuer || "").trim();
          if (issuerAddress && blockedSet.has(issuerAddress.toLowerCase())) return null;
          const issuerName = institutions.find((x) => String(x.address || "").toLowerCase() === issuerAddress.toLowerCase())?.name || "";
          return {
            kind: "batch",
            batchIndex: idx,
            distributionCID: c,
            templateId: String(dist?.templateId || ""),
            templateCategory: String(dist?.templateCategory || ""),
            coverImageUrl: String(dist?.coverImageUrl || ""),
            merkleRoot: root,
            issuerAddress,
            issuerName,
            tokenURI: String(me.tokenURI || ""),
            attachmentCID: String(me.attachmentCID || ""),
            proof: me.proof || []
          };
        })
      );

      saveBatchCache(cache);
      const out = results.filter(Boolean).filter((x) => x.merkleRoot && x.tokenURI && Array.isArray(x.proof) && x.proof.length);
      setDiscoveredBatchClaims(out);
    } catch (e) {
      setError(parseProviderError(e));
      setDiscoveredBatchClaims([]);
    } finally {
      setDiscoveryWorking(false);
    }
  }

  async function loadBatchClaimInfo() {
    setBatchClaimError("");
    setBatchClaimInfo(null);
    const cid = String(batchClaimCid || "").trim();
    if (!cid) {
      setBatchClaimError("请输入分发 CID（distributionCID）");
      return;
    }
    if (!account) {
      setBatchClaimError("请先连接钱包");
      return;
    }
    setBatchClaimWorking(true);
    try {
      const dist = await fetchJsonByCid(cid);
      const root = String(dist?.merkleRoot || "").trim();
      const entries = Array.isArray(dist?.entries) ? dist.entries : [];
      if (!root || !entries.length) throw new Error("分发列表格式不正确（缺少 merkleRoot/entries）");
      const me = entries.find((e) => String(e?.address || "").toLowerCase() === String(account || "").toLowerCase()) || null;
      if (!me) throw new Error("该分发列表中未找到当前地址");
      const tokenURI = String(me?.tokenURI || "").trim();
      const attachmentCID = String(me?.attachmentCID || "").trim();
      const proof = Array.isArray(me?.proof) ? me.proof : [];
      if (!tokenURI || !proof.length) throw new Error("该地址的领取信息不完整（缺少 tokenURI/proof）");
      let issuerAddress = "";
      let issuerName = "";
      try {
        const b = await getBatchByRoot({ merkleRoot: root });
        issuerAddress = String(b?.issuer || "");
        issuerName =
          institutions.find((x) => String(x.address || "").toLowerCase() === issuerAddress.toLowerCase())?.name || "";
      } catch {
      }
      setBatchClaimInfo({
        distributionCID: cid,
        templateId: String(dist?.templateId || ""),
        merkleRoot: root,
        issuerAddress,
        issuerName,
        tokenURI,
        attachmentCID,
        proof
      });
    } catch (e) {
      setBatchClaimError(parseProviderError(e));
    } finally {
      setBatchClaimWorking(false);
    }
  }

  async function handleRejectDiscoveredBatch(item, shouldBlock) {
    setError("");
    try {
      if (shouldBlock) {
        const issuerAddress = String(item?.issuerAddress || "").trim();
        if (!issuerAddress) throw new Error("Missing institution address");
        await blockIssuer({ issuerAddress });
        showToast("Institution blocked");
      }
      dismissDiscoveredBatch(item);
    } catch (e) {
      setError(parseProviderError(e));
    }
  }

  async function doBatchClaim() {
    setBatchClaimError("");
    if (!batchClaimInfo) {
      setBatchClaimError("请先查询分发列表");
      return;
    }
    setBatchClaimWorking(true);
    try {
      const claimedTokenUri = String(batchClaimInfo.tokenURI || "").trim();
      const claimedAttachmentCid = String(batchClaimInfo.attachmentCID || "").trim();
      const res = await claimIssuerBatch({
        merkleRoot: batchClaimInfo.merkleRoot,
        tokenURI: claimedTokenUri,
        attachmentCID: claimedAttachmentCid,
        proof: batchClaimInfo.proof
      });
      setBatchClaimInfo(null);
      showToast("凭证已存入勋章墙，请进入批量编辑手动设置展示");
      if (account && hasSessionSeed(account) && claimedTokenUri && claimedAttachmentCid) {
        try {
          const latest = await getMyBatchTokens();
          const matched =
            (Number.isFinite(res?.tokenId) ? (latest || []).find((x) => Number(x?.tokenId) === Number(res.tokenId)) : null) ||
            (latest || []).find((x) => String(x?.tokenURI || "").trim() === claimedTokenUri) ||
            null;
          if (matched?.tokenId) {
            const tokenIdKey = String(matched.tokenId);
            const map = loadBatchPrivateCidMap(account);
            if (!map[tokenIdKey]) {
              const url = gatewayUrlForCid(claimedAttachmentCid);
              const res = await fetch(url, { method: "GET" });
              if (res.ok) {
                const blob = await res.blob();
                const dataUrl = await blobToDataUrl(blob);
                const name = String(batchTokenMetas?.[tokenIdKey]?.name || matched.templateId || "attachment");
                const archived = await archiveFileToCategory({
                  categoryName: "Original Documents",
                  name,
                  type: blob.type || "application/octet-stream",
                  size: blob.size || 0,
                  dataUrl
                });
                map[tokenIdKey] = { cid: String(archived?.cid || ""), sourceCid: claimedAttachmentCid, ts: Date.now() };
                saveBatchPrivateCidMap(account, map);
                setBatchUiTick((x) => x + 1);
              }
            }
          }
        } catch {
        }
      }
      await refreshAll();
    } catch (e) {
      setBatchClaimError(parseProviderError(e));
    } finally {
      setBatchClaimWorking(false);
    }
  }

  useEffect(() => {
    refreshAll();
    discoverBatchClaims();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  useEffect(() => {
    setTokenPage(1);
  }, [tokenCategory, tokenSearch]);

  useEffect(() => {
    if (tokenViewOpen || tokenViewPayload || shareLink) closeTokenView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenPage]);

  useEffect(() => {
    setMyClaimPage(1);
  }, [claims.length]);

  useEffect(() => {
    setOfferPage(1);
  }, [offers.length]);

  const medalItems = useMemo(() => {
    const out = [];
    const batchPrivateCidMap = account ? loadBatchPrivateCidMap(account) : {};

    for (const t of tokens || []) {
      const fallbackBadge = svgToDataUrl(makeDefaultBadgeSvg({ title: t.title, issuerName: t.issuerName }));
      const badgeSrc = t.publicImageCid ? gatewayUrlForCid(t.publicImageCid) : fallbackBadge;
      out.push({
        kind: "legacy",
        id: `legacy-${t.tokenId}`,
        tokenId: t.tokenId,
        title: t.title,
        subtitle: t.issuerName || formatAddress(t.issuer),
        category: categoryLabel(t.category),
        imageUrl: badgeSrc,
        displayed: Boolean(t.displayed),
        raw: t
      });
    }

    for (const t of batchTokens || []) {
      const meta = batchTokenMetas?.[String(t.tokenId)] || null;
      const metaName = typeof meta?.name === "string" && meta.name.trim() ? meta.name : t.templateId || "Batch SBT";
      const metaCategory = "Verifiable Credential";
      const metaIssuerName = typeof meta?.issuerName === "string" && meta.issuerName.trim() ? meta.issuerName : t.issuerName || "";
      const metaIssuerAddress =
        typeof meta?.issuerAddress === "string" && meta.issuerAddress.trim() ? meta.issuerAddress : t.issuer || "";
      const metaImage = typeof meta?.image === "string" ? meta.image : "";
      const img = metaImage ? gatewayUrlForTokenUri(metaImage) : svgToDataUrl(makeDefaultBadgeSvg({ title: metaName, issuerName: metaIssuerName }));
      const attachmentCID =
        typeof meta?.attachmentCID === "string" && meta.attachmentCID.trim() ? meta.attachmentCID : t.attachmentCID || "";
      const tokenIdKey = String(t.tokenId);
      const displayed = Boolean(t.displayed);
      const privateCid = typeof batchPrivateCidMap?.[tokenIdKey]?.cid === "string" ? String(batchPrivateCidMap[tokenIdKey].cid || "") : "";
      out.push({
        kind: "batchToken",
        id: `batchToken-${t.tokenId}`,
        tokenId: t.tokenId,
        title: metaName,
        subtitle: metaIssuerName || formatAddress(metaIssuerAddress),
        category: metaCategory,
        imageUrl: img,
        displayed,
        tokenURI: t.tokenURI,
        issuerName: metaIssuerName,
        issuerAddress: metaIssuerAddress,
        attachmentCID,
        privateCid
      });
    }

    for (const b of discoveredBatchClaims || []) {
      const img = b.coverImageUrl ? gatewayUrlForTokenUri(b.coverImageUrl) : "";
      out.push({
        kind: "batchPending",
        id: `batchPending-${b.batchIndex}-${b.distributionCID}`,
        title: b.templateId || "批量签发凭证",
        subtitle: b.templateCategory || "待领取",
        category: b.templateCategory || "待领取",
        imageUrl: img,
        batch: b
      });
    }

    return out;
  }, [account, batchTokenMetas, batchTokens, batchUiTick, discoveredBatchClaims, tokens]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    for (const it of medalItems) {
      const c = String(it.category || "").trim();
      if (c) set.add(c);
    }
    return ["all", ...Array.from(set).slice(0, 6)];
  }, [medalItems]);

  const filteredMedals = useMemo(() => {
    const q = tokenSearch.trim().toLowerCase();
    return medalItems
      .filter((t) => t.kind !== "batchPending")
      .filter((t) => {
        if (tokenCategory === "all") return true;
        return String(t.category) === String(tokenCategory);
      })
      .filter((t) => {
        if (!q) return true;
        const hay = `${t.title || ""} ${t.subtitle || ""} ${t.tokenURI || ""}`.toLowerCase();
        return hay.includes(q);
      });
  }, [medalItems, tokenCategory, tokenSearch]);

  const tokenTotalPages = Math.max(1, Math.ceil(filteredMedals.length / MEDAL_PAGE_SIZE));
  const tokenSafePage = Math.min(Math.max(tokenPage, 1), tokenTotalPages);
  const tokenPageRows = useMemo(() => {
    const start = (tokenSafePage - 1) * MEDAL_PAGE_SIZE;
    return filteredMedals.slice(start, start + MEDAL_PAGE_SIZE);
  }, [filteredMedals, tokenSafePage]);

  const myClaimTotalPages = Math.max(1, Math.ceil((claims || []).length / PAGE_SIZE));
  const myClaimSafePage = Math.min(Math.max(myClaimPage, 1), myClaimTotalPages);
  const myClaimRows = useMemo(() => {
    const start = (myClaimSafePage - 1) * PAGE_SIZE;
    return (claims || []).slice(start, start + PAGE_SIZE);
  }, [claims, myClaimSafePage]);

  const pendingOffers = useMemo(() => (offers || []).filter((o) => Number(o.status) === 0), [offers]);
  const offerTotalPages = Math.max(1, Math.ceil(pendingOffers.length / PAGE_SIZE));
  const offerSafePage = Math.min(Math.max(offerPage, 1), offerTotalPages);
  const offerRows = useMemo(() => {
    const start = (offerSafePage - 1) * PAGE_SIZE;
    return pendingOffers.slice(start, start + PAGE_SIZE);
  }, [offerSafePage, pendingOffers]);

  function toggleTokenSelect(tokenId) {
    setSelectedTokenIds((prev) => {
      const next = new Set(prev);
      const key = String(tokenId || "");
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearSelection() {
    setSelectedTokenIds(new Set());
  }

  async function applyBulkDisplayed(displayed) {
    setError("");
    if (import.meta.env.DEV) {
      console.log("[BulkDisplayed]", {
        displayed,
        selected: Array.from(selectedTokenIds)
      });
    }
    setBulkAction(displayed ? "show" : "hide");
    try {
      const all = Array.from(selectedTokenIds);
      const legacyIds = all
        .filter((x) => String(x).startsWith("legacy-"))
        .map((x) => Number(String(x).slice("legacy-".length)))
        .filter((n) => Number.isFinite(n));
      const batchIds = all
        .filter((x) => String(x).startsWith("batchToken-"))
        .map((x) => String(x).slice("batchToken-".length))
        .filter(Boolean);
      if (import.meta.env.DEV) {
        console.log("[BulkDisplayedParsed]", { legacyIds, batchIds });
      }
      if (legacyIds.length) {
        await setDisplayedMany({ tokenIds: legacyIds, displayed });
      }
      if (batchIds.length) {
        await setBatchDisplayedMany({ tokenIds: batchIds, displayed });
      }
      clearSelection();
      await refreshAll();
    } catch (e) {
      setError(parseProviderError(e));
    } finally {
      setBulkAction("");
    }
  }

  async function applyBulkBurn() {
    setError("");
    const all = Array.from(selectedTokenIds);
    const legacyIds = all
      .filter((x) => String(x).startsWith("legacy-"))
      .map((x) => Number(String(x).slice("legacy-".length)))
      .filter((n) => Number.isFinite(n));
    const batchIds = all
      .filter((x) => String(x).startsWith("batchToken-"))
      .map((x) => Number(String(x).slice("batchToken-".length)))
      .filter((n) => Number.isFinite(n));
    const total = legacyIds.length + batchIds.length;
    if (total === 0) return;
    const ok = window.confirm(`确认永久销毁（Burn）所选 ${total} 个 SBT？该操作不可撤销。`);
    if (!ok) return;
    setBulkAction("burn");
    try {
      if (legacyIds.length) await burnMany({ tokenIds: legacyIds });
      if (batchIds.length) await burnBatchMany({ tokenIds: batchIds });
      clearSelection();
      await refreshAll();
    } catch (e) {
      setError(parseProviderError(e));
    } finally {
      setBulkAction("");
    }
  }

  async function handleClaimSubmit() {
    setError("");
    setClaimFileError("");
    setIsClaimSubmitting(true);
    try {
      if (!account) throw new Error("Please connect wallet first");
      const instAddr = claimInstitution.trim();
      if (!instAddr) throw new Error("Select an institution");
      const title = claimTitle.trim();
      if (!title) throw new Error("Please enter credential title");
      if (!claimFile) throw new Error("Please upload file for review (PDF/Image)");

      const isArchiveObj = typeof claimFile === "object" && claimFile && typeof claimFile.dataUrl === "string";
      const dataUrl = isArchiveObj ? claimFile.dataUrl : await fileToBase64(claimFile);
      const name = isArchiveObj ? String(claimFile.name || "attachment") : claimFile.name;
      const size = Number(isArchiveObj ? claimFile.size : claimFile.size);
      if (size > MAX_FILE_SIZE_BYTES) throw new Error(`File too large (${formatBytes(size)})`);
      const type =
        (isArchiveObj ? String(claimFile.type || "") : claimFile.type) || (isPdfLike({ name }) ? "application/pdf" : "");
      const payload = {
        name,
        type,
        size,
        dataUrl,
        student: account,
        title,
        category: Number(claimCategory) || 0,
        createdAt: new Date().toISOString()
      };

      const privateCid = await encryptAndUploadWithMasterSeed({
        kind: "credential-claim-private",
        ...payload
      });

      const reviewKey = deriveReviewKeyWordArray(instAddr);
      const iv = CryptoJS.lib.WordArray.random(16);
      const cipher = CryptoJS.AES.encrypt(JSON.stringify(payload, null, 0), reviewKey, {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      const reviewCid = await uploadJsonToIpfs({
        scheme: "claim-review-v1",
        ivHex: iv.toString(CryptoJS.enc.Hex),
        ciphertext: cipher.toString()
      });

      await submitClaim({
        institutionAddress: instAddr,
        title,
        category: Number(claimCategory) || 0,
        reviewCid,
        privateCid
      });

      setClaimTitle("");
      setClaimCategory(0);
      setClaimFile(null);
      await refreshAll();
    } catch (e) {
      const msg = parseProviderError(e);
      if (msg.includes("文件") || msg.includes("上传")) setClaimFileError(msg);
      else setError(msg);
    } finally {
      setIsClaimSubmitting(false);
    }
  }

  const selectedCount = selectedTokenIds.size;
  function openArchivePick() {
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
      setArchivePickError("Please connect wallet first");
      return;
    }
    const pwd = String(archivePickPassword || "");
    if (!pwd) {
      setArchivePickError("Personal password cannot be empty");
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
          categoryName: String(categoryName || ""),
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
    const cat = String(archivePickCategoryName || "");
    return (archivePickFiles || []).filter((f) => f.categoryName === cat);
  }, [archivePickCategoryName, archivePickFiles]);

  async function confirmArchivePick() {
    setArchivePickError("");
    if (!account) {
      setArchivePickError("Please connect wallet first");
      return;
    }
    const seedHex = String(archivePickSeedHex || "");
    if (!seedHex) {
      setArchivePickError("Please unlock and load archive list first");
      return;
    }
    const selected = archivePickVisibleFiles.find((x) => x.id === archivePickSelectedId) || null;
    if (!selected) {
      setArchivePickError("Please select an archive file");
      return;
    }
    setArchivePickWorking(true);
    try {
      const payload = await decryptArchivePayloadByCid({ seedHex, cid: selected.cid });
      const item = {
        name: String(payload.name || selected.name || "archive"),
        type: String(payload.type || selected.mime || ""),
        size: Number(payload.size || selected.size || 0),
        dataUrl: String(payload.dataUrl)
      };
      setClaimFile(item);
      setArchivePickOpen(false);
      setArchivePickPassword("");
      setArchivePickSeedHex("");
      setArchivePickSelectedId("");
      setArchivePickFiles([]);
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

  function openArchiveStore() {
    setArchiveStoreCategoryName("Original Documents");
    setArchiveStoreError("");
    setArchiveStoreNotice("");
    setArchiveStoreWorking(false);
    setArchiveStoreOpen(true);
    refreshArchiveCategories();
  }

  async function confirmArchiveStore() {
    setArchiveStoreError("");
    setArchiveStoreNotice("");
    if (!account) {
      setArchiveStoreError("Please connect wallet first");
      return;
    }
    if (!tokenViewPayload?.dataUrl) {
      setArchiveStoreError("Please decrypt and load attachment first");
      return;
    }
    const catName = String(archiveStoreCategoryName || "").trim();
    if (!catName) {
      setArchiveStoreError("Select a category");
      return;
    }
    setArchiveStoreWorking(true);
    try {
      await archiveFileToCategory({
        categoryName: catName,
        name: String(tokenViewPayload.name || "attachment"),
        type: String(tokenViewPayload.type || ""),
        size: Number(tokenViewPayload.size || 0),
        dataUrl: String(tokenViewPayload.dataUrl)
      });
      setArchiveStoreNotice(`File successfully archived to: ${catName}`);
    } catch (e) {
      setArchiveStoreError(parseProviderError(e));
    } finally {
      try {
        clearSessionSeed(account);
      } catch {
      }
      setArchiveStoreWorking(false);
    }
  }

  function showToast(msg) {
    const text = String(msg || "");
    if (!text) return;
    setArchiveToast(text);
    window.setTimeout(() => setArchiveToast(""), 2200);
  }

  function openArchiveQuick(target) {
    setArchiveQuickError("");
    setArchiveQuickProgress("");
    setArchiveQuickWorking(false);
    setArchiveQuickTarget(target || null);
    setArchiveQuickCategoryName("Original Documents");
    setArchiveQuickOpen(true);
    refreshArchiveCategories();
  }

  function closeArchiveQuick() {
    setArchiveQuickOpen(false);
    setArchiveQuickTarget(null);
    setArchiveQuickError("");
    setArchiveQuickProgress("");
    setArchiveQuickWorking(false);
    setArchiveQuickCategoryName("Original Documents");
  }

  async function confirmArchiveQuick() {
    setArchiveQuickError("");
    if (!account) {
      setArchiveQuickError("Please connect wallet first");
      return;
    }
    const catName = String(archiveQuickCategoryName || "").trim();
    if (!catName) {
      setArchiveQuickError("Select a category");
      return;
    }
    if (!hasSessionSeed(account)) {
      setArchiveQuickError("Master Seed locked: Please complete a decryption/unlock in this session first");
      return;
    }
    if (!archiveQuickTarget) {
      setArchiveQuickError("Missing archive target");
      return;
    }
    setArchiveQuickWorking(true);
    setArchiveQuickProgress(`Archiving to ${catName}...`);
    try {
      if (archiveQuickTarget.kind === "legacy") {
        const cid = String(archiveQuickTarget.privateCid || "").trim();
        if (!cid) throw new Error("Missing private CID");
        const res = await decryptFromCidSession({ cid });
        const raw = res?.parsed?.raw ?? res?.parsed ?? null;
        if (!raw || typeof raw !== "object" || !raw.dataUrl) throw new Error("Invalid decryption result format");
        await archiveFileToCategory({
          categoryName: catName,
          name: String(raw.name || "attachment"),
          type: String(raw.type || ""),
          size: Number(raw.size || 0),
          dataUrl: String(raw.dataUrl)
        });
      } else if (archiveQuickTarget.kind === "batchToken") {
        const cid = String(archiveQuickTarget.attachmentCID || "").trim();
        if (!cid) throw new Error("Missing attachment CID");
        const url = gatewayUrlForCid(cid);
        const resp = await fetch(url, { method: "GET" });
        if (!resp.ok) throw new Error(`Failed to fetch attachment (${resp.status})`);
        const blob = await resp.blob();
        const dataUrl = await blobToDataUrl(blob);
        await archiveFileToCategory({
          categoryName: catName,
          name: String(archiveQuickTarget.name || "attachment"),
          type: blob.type || "application/octet-stream",
          size: blob.size || 0,
          dataUrl
        });
      } else {
        throw new Error("Unsupported archive target");
      }
      closeArchiveQuick();
      showToast(`Archived to ${catName}`);
    } catch (e) {
      setArchiveQuickError(parseProviderError(e));
    } finally {
      setArchiveQuickWorking(false);
      setArchiveQuickProgress("");
    }
  }

  async function handleAcceptOffer(offer) {
    setError("");
    try {
      if (!offer?.id && offer?.id !== 0) throw new Error("Missing offerId");
      const cid = offer?.attachmentCid;
      if (!cid) throw new Error("Missing institution attachment CID");
      const { raw } = await fetchEncryptedFromPinataGateway(cid);
      if (!raw || typeof raw !== "object") throw new Error("Invalid institution attachment format");

      // Detect encrypted-offer-v1 envelope vs legacy plaintext
      let attachmentData;
      if (raw.scheme === "encrypted-offer-v1") {
        // Decrypt using deterministic shared key (issuer + recipient addresses)
        attachmentData = await decryptForSingleRecipient({
          envelope: raw,
          issuerAddress: offer.issuer || raw.issuer || "",
          recipientAddress: account
        });
      } else {
        // Legacy plaintext format
        if (!raw.dataUrl) throw new Error("Invalid institution attachment format");
        attachmentData = raw;
      }

      const payload = {
        kind: "credential-offer-private",
        name: attachmentData.name || "attachment",
        type: attachmentData.type || "",
        size: attachmentData.size || 0,
        dataUrl: attachmentData.dataUrl,
        student: account,
        title: offer.title,
        category: Number(offer.category) || 0,
        issuer: offer.issuer,
        createdAt: new Date().toISOString()
      };
      const privateCid = await encryptAndUploadWithMasterSeed(payload);
      await acceptOffer({ offerId: offer.id, privateCid, displayed: false });
      try {
        await archiveFileToCategory({
          categoryName: "Original Documents",
          name: String(payload.name || "attachment"),
          type: String(payload.type || ""),
          size: Number(payload.size || 0),
          dataUrl: String(payload.dataUrl)
        });
      } catch {
      }
      await refreshAll();
    } catch (e) {
      setError(parseProviderError(e));
    }
  }

  async function handleRejectOffer(offer, shouldBlock) {
    setError("");
    try {
      await rejectOffer({ offerId: offer.id, shouldBlock: Boolean(shouldBlock) });
      await refreshAll();
    } catch (e) {
      setError(parseProviderError(e));
    }
  }

  async function handleClaimDiscoveredBatch(item) {
    setError("");
    try {
      const claimedTokenUri = String(item.tokenURI || "").trim();
      const claimedAttachmentCid = String(item.attachmentCID || "").trim();
      const res = await claimIssuerBatch({
        merkleRoot: item.merkleRoot,
        tokenURI: claimedTokenUri,
        attachmentCID: claimedAttachmentCid,
        proof: item.proof
      });
      showToast("Credential saved to Medal Wall. Please set visibility in Batch Manage.");
      if (account && hasSessionSeed(account) && claimedTokenUri && claimedAttachmentCid) {
        try {
          const latest = await getMyBatchTokens();
          const matched =
            (Number.isFinite(res?.tokenId) ? (latest || []).find((x) => Number(x?.tokenId) === Number(res.tokenId)) : null) ||
            (latest || []).find((x) => String(x?.tokenURI || "").trim() === claimedTokenUri) ||
            null;
          if (matched?.tokenId) {
            const tokenIdKey = String(matched.tokenId);
            const map = loadBatchPrivateCidMap(account);
            if (!map[tokenIdKey]) {
              const url = gatewayUrlForCid(claimedAttachmentCid);
              const res = await fetch(url, { method: "GET" });
              if (res.ok) {
                const blob = await res.blob();
                const dataUrl = await blobToDataUrl(blob);
                const name = String(batchTokenMetas?.[tokenIdKey]?.name || matched.templateId || "attachment");
                const archived = await archiveFileToCategory({
                  categoryName: "Original Documents",
                  name,
                  type: blob.type || "application/octet-stream",
                  size: blob.size || 0,
                  dataUrl
                });
                map[tokenIdKey] = { cid: String(archived?.cid || ""), sourceCid: claimedAttachmentCid, ts: Date.now() };
                saveBatchPrivateCidMap(account, map);
                setBatchUiTick((x) => x + 1);
              }
            }
          }
        } catch {
        }
      }
      await refreshAll();
      await discoverBatchClaims();
    } catch (e) {
      setError(parseProviderError(e));
    }
  }

  function openMeta({ title, json }) {
    setMetaError("");
    setMetaTitle(String(title || "SBT Metadata"));
    setMetaJson(filterBusinessMetadata(json || null));
    setMetaOpen(true);
  }

  function closeMeta() {
    setMetaOpen(false);
    setMetaError("");
    setMetaTitle("");
    setMetaJson(null);
  }

  async function openMetaForMedal(item) {
    setMetaError("");
    try {
      if (item.kind === "batchToken") {
        const meta = batchTokenMetas?.[String(item.tokenId)] || null;
        if (meta) {
          openMeta({ title: item.title, json: meta });
          return;
        }
        const fetched = await fetchJsonByUri(item.tokenURI);
        openMeta({ title: item.title, json: fetched });
        return;
      }

      if (item.kind === "batchPending") {
        const fetched = await fetchJsonByUri(item.batch?.tokenURI);
        openMeta({ title: item.title, json: fetched });
        return;
      }

      if (item.kind === "legacy") {
        const t = item.raw;
        openMeta({
          title: item.title,
          json: {
            name: t.title,
            category: categoryLabel(t.category),
            issuerName: t.issuerName,
            issuerAddress: t.issuer,
            image: t.publicImageCid ? `ipfs://${t.publicImageCid}` : "",
            attributes: []
          }
        });
      }
    } catch (e) {
      setMetaError(parseProviderError(e));
      setMetaOpen(true);
    }
  }

  async function handleBatchOpenAttachment({ attachmentCID }) {
    const cid = String(attachmentCID || "").trim();
    if (!cid) return;
    window.open(gatewayUrlForCid(cid), "_blank", "noreferrer");
  }

  async function handleBatchArchiveAttachment({ attachmentCID, name, tokenId }) {
    setError("");
    try {
      const cid = String(attachmentCID || "").trim();
      if (!cid) throw new Error("Missing attachmentCID");
      const url = gatewayUrlForCid(cid);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch attachment (${res.status})`);
      const blob = await res.blob();
      const dataUrl = await blobToDataUrl(blob);
      const archived = await archiveFileToCategory({
        categoryName: "Original Documents",
        name: String(name || "attachment"),
        type: blob.type || "application/octet-stream",
        size: blob.size || 0,
        dataUrl
      });
      if (account && tokenId) {
        const map = loadBatchPrivateCidMap(account);
        map[String(tokenId)] = { cid: String(archived?.cid || ""), sourceCid: cid, ts: Date.now() };
        saveBatchPrivateCidMap(account, map);
        setBatchUiTick((x) => x + 1);
      }
    } catch (e) {
      setError(parseProviderError(e));
    }
  }

  function dismissDiscoveredBatch(item) {
    if (!account) return;
    const key = `${Number(item.batchIndex)}:${String(item.distributionCID || "").trim()}`;
    const set = loadBatchDismissed(account);
    set.add(key);
    saveBatchDismissed(account, set);
    setDiscoveredBatchClaims((prev) =>
      (prev || []).filter((x) => !(Number(x.batchIndex) === Number(item.batchIndex) && String(x.distributionCID) === String(item.distributionCID)))
    );
  }

  function openTokenView(token) {
    setTokenViewError("");
    setTokenViewToken(token || null);
    setTokenViewPassword("");
    setTokenViewPayload(null);
    setTokenViewLoading(false);
    setTokenAutoArchive(false);
    setTokenViewOpen(true);
  }

  function closeTokenView() {
    setTokenViewOpen(false);
    setTokenViewError("");
    setTokenViewToken(null);
    setTokenViewPassword("");
    setTokenViewPayload(null);
    setTokenViewLoading(false);
    setShareLink("");
    setShareNotice("");
    setSecureShareOpen(false);
    setSecureShareWorking(false);
    setSecureShareError("");
    setSecureShareNotice("");
    setSecureShareLink("");
    setSecureShareMeta(null);
    setSecureShareOptions([]);
    setSecureShareSelected(new Set());
    setTokenAutoArchive(false);
  }

  async function handleTokenDecrypt() {
    setTokenViewError("");
    setTokenViewLoading(true);
    try {
      let cid = tokenViewToken?.privateCid;
      if (!cid && tokenViewToken?.kind === "batchToken" && account) {
        const map = loadBatchPrivateCidMap(account);
        const key = String(tokenViewToken?.tokenId || "");
        const stored = typeof map?.[key]?.cid === "string" ? String(map[key].cid || "") : "";
        if (stored) cid = stored;
      }
      if (!cid && tokenViewToken?.kind === "batchToken") {
        const attachmentCID = String(tokenViewToken?.attachmentCID || "").trim();
        if (!attachmentCID) throw new Error("Missing attachment CID");
        await unlockMasterSeedSession({ personalPassword: tokenViewPassword });
        const url = gatewayUrlForCid(attachmentCID);
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) throw new Error(`Failed to fetch attachment (${res.status})`);
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        const name = String(tokenViewToken?.title || "attachment");
        const archived = await archiveFileToCategory({
          categoryName: "Original Documents",
          name,
          type: blob.type || "application/octet-stream",
          size: blob.size || 0,
          dataUrl
        });
        const archivedCid = String(archived?.cid || "");
        if (archivedCid && account) {
          const map = loadBatchPrivateCidMap(account);
          const key = String(tokenViewToken?.tokenId || "");
          map[key] = { cid: archivedCid, sourceCid: attachmentCID, ts: Date.now() };
          saveBatchPrivateCidMap(account, map);
          setBatchUiTick((x) => x + 1);
          cid = archivedCid;
        }
      }
      if (!cid) throw new Error("Missing private CID");
      const res = await decryptFromCid({ cid, personalPassword: tokenViewPassword });
      const raw = res?.parsed?.raw ?? res?.parsed ?? null;
      if (!raw || typeof raw !== "object") throw new Error("Invalid decryption result format");
      if (!raw.dataUrl) throw new Error("Decrypted content missing dataUrl");
      setTokenViewPayload(raw);
      if (tokenAutoArchive) openArchiveStore();
    } catch (e) {
      setTokenViewError(parseProviderError(e));
    } finally {
      setTokenViewLoading(false);
    }
  }

  async function handleGenerateShareLink() {
    setShareNotice("");
    try {
      if (!tokenViewPayload?.dataUrl) throw new Error("Please decrypt and load attachment first");
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const tempKey = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
      const ttlSec = 5 * 60;

      const plain = JSON.stringify(
        {
          title: tokenViewToken?.title || "",
          name: tokenViewPayload?.name || "",
          type: tokenViewPayload?.type || "",
          size: tokenViewPayload?.size || 0,
          dataUrl: tokenViewPayload.dataUrl
        },
        null,
        0
      );
      const key = CryptoJS.SHA256(`TA_SHARE_V1|${tempKey}`);
      const iv = CryptoJS.lib.WordArray.random(16);
      const cipher = CryptoJS.AES.encrypt(plain, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
      const shareCid = await uploadJsonToIpfs({
        scheme: "share-v1",
        ttlSec,
        ivHex: iv.toString(CryptoJS.enc.Hex),
        ciphertext: cipher.toString()
      });

      const url = `${window.location.origin}/share/v1/${shareCid}?key=${encodeURIComponent(tempKey)}`;
      setShareLink(url);
      try {
        await navigator.clipboard.writeText(url);
        setShareNotice("Link generated (valid for 5 mins after first open). Copied to clipboard.");
      } catch {
        setShareNotice("Link generated (valid for 5 mins after first open).");
      }
    } catch (e) {
      setShareNotice(String(e?.message || "Generation failed"));
    }
  }

  function parseTimeToMs(v) {
    if (v == null) return 0;
    if (typeof v === "number" && Number.isFinite(v)) {
      if (v > 10_000_000_000) return Math.floor(v);
      return Math.floor(v * 1000);
    }
    const s = String(v || "").trim();
    if (!s) return 0;
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      if (!Number.isFinite(n)) return 0;
      if (n > 10_000_000_000) return Math.floor(n);
      return Math.floor(n * 1000);
    }
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : 0;
  }

  function extractLevelFromAttributes(attrs) {
    if (!Array.isArray(attrs)) return "";
    for (const a of attrs) {
      const trait = String(a?.trait_type || a?.trait || a?.name || "").toLowerCase();
      if (!trait) continue;
      if (trait.includes("level") || trait.includes("等级")) {
        const v = a?.value ?? a?.val ?? "";
        return String(v ?? "");
      }
    }
    return "";
  }

  function safeValueToString(v) {
    if (v == null) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    return "";
  }

  function prettyLabelForMetaKey(key) {
    const k = String(key || "");
    if (k === "name" || k === "title") return "Credential Title";
    if (k === "category") return "Category";
    if (k === "description") return "Description";
    if (k === "issuedAt" || k === "createdAt") return "Issuance Time";
    if (k === "templateId") return "Template ID";
    return k;
  }

  function buildDynamicFieldOptions(publicMeta) {
    const meta = publicMeta && typeof publicMeta === "object" ? publicMeta : {};
    const out = [];
    const forbiddenKeys = new Set([
      "tokenid",
      "token_id",
      "token",
      "owner",
      "holder",
      "student",
      "address",
      "wallet",
      "privatecid",
      "attachmentcid",
      "cid",
      "uri",
      "proof",
      "root"
    ]);

    for (const [kRaw, v] of Object.entries(meta)) {
      const k = String(kRaw || "");
      const lk = k.toLowerCase();
      if (!k) continue;
      if (lk === "image" || lk === "issuername" || lk === "issueraddress" || lk === "expiresat" || lk === "scheme") continue;
      if (forbiddenKeys.has(lk)) continue;
      if (shouldHideMetaKey(k)) continue;
      if (lk.includes("tokenid") || lk.includes("private") || lk.includes("cipher") || lk.includes("attachment")) continue;
      if (lk.includes("owner") || lk.includes("holder") || lk.includes("student") || lk.includes("wallet")) continue;
      const s = safeValueToString(v);
      if (!s) continue;
      out.push({ id: `meta:${k}`, label: prettyLabelForMetaKey(k), value: s });
    }

    if (Array.isArray(meta.attributes)) {
      meta.attributes.forEach((a, idx) => {
        const trait = safeValueToString(a?.trait_type || a?.trait || a?.name || "");
        const v = safeValueToString(a?.value ?? a?.val ?? "");
        if (!trait || !v) return;
        const lk = trait.toLowerCase();
        if (lk.includes("tokenid") || lk.includes("cid") || lk.includes("uri") || lk.includes("proof") || lk.includes("root")) return;
        out.push({ id: `attr:${idx}`, label: trait, value: v });
      });
    }

    const seen = new Set();
    return out.filter((x) => {
      const key = `${x.label}::${x.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function openSecureShare() {
    setSecureShareError("");
    setSecureShareNotice("");
    setSecureShareLink("");
    setSecureShareWorking(true);
    try {
      if (!tokenViewToken) throw new Error("Missing credential info");
      let issuerName = "";
      let issuerAddress = "";
      let issuedAtMs = 0;
      let image = "";
      let publicMeta = null;

      if (tokenViewToken?.kind === "batchToken") {
        issuerName = String(tokenViewToken?.issuerName || "");
        issuerAddress = String(tokenViewToken?.issuerAddress || "");
        const tokenIdKey = String(tokenViewToken?.tokenId || "");
        const cached = tokenIdKey ? batchTokenMetas?.[tokenIdKey] || null : null;
        const fetched = cached ? cached : await fetchJsonByUri(tokenViewToken?.tokenURI);
        const meta = filterBusinessMetadata(fetched || null) || {};
        image = typeof meta.image === "string" ? meta.image : "";
        if (!image && typeof tokenViewToken?.imageUrl === "string") image = tokenViewToken.imageUrl;
        issuedAtMs = parseTimeToMs(meta.issuedAt) || parseTimeToMs(meta.createdAt) || Date.now();
        publicMeta = meta;
      } else {
        issuerName = String(tokenViewToken?.issuerName || "");
        issuerAddress = String(tokenViewToken?.issuer || "");
        image = tokenViewToken?.publicImageCid ? `ipfs://${String(tokenViewToken.publicImageCid)}` : "";
        try {
          if (tokenViewToken?.offerId != null) {
            const offer = await getOffer({ offerId: tokenViewToken.offerId });
            if (offer?.createdAt) issuedAtMs = Number(offer.createdAt) * 1000;
          }
        } catch {
        }
        if (!issuedAtMs) issuedAtMs = Date.now();
        publicMeta = {
          name: tokenViewToken?.title || "",
          category: categoryLabel(tokenViewToken?.category),
          issuerName,
          issuerAddress,
          image,
          attributes: []
        };
      }

      if (!issuerAddress) throw new Error("Missing institution address");
      const meta = {
        issuerName,
        issuerAddress,
        issuedAtMs,
        image
      };
      setSecureShareMeta(meta);
      const options = buildDynamicFieldOptions(publicMeta);
      setSecureShareOptions(options);
      setSecureShareSelected(new Set());
      setSecureShareOpen(true);
    } catch (e) {
      setSecureShareError(parseProviderError(e));
      setSecureShareOpen(true);
    } finally {
      setSecureShareWorking(false);
    }
  }

  async function confirmSecureShare() {
    setSecureShareError("");
    setSecureShareNotice("");
    setSecureShareWorking(true);
    try {
      const meta = secureShareMeta;
      if (!meta) throw new Error("Missing credential meta info");
      const expiresAt = Date.now() + 5 * 60 * 1000;
      const payload = {
        scheme: "secure-verify-v1",
        expiresAt,
        issuerName: String(meta.issuerName || ""),
        issuerAddress: String(meta.issuerAddress || ""),
        issuedAt: Number(meta.issuedAtMs || 0),
        image: String(meta.image || ""),
        holder: "anonymous",
        fields: []
      };
      const chosen = secureShareSelected instanceof Set ? secureShareSelected : new Set();
      const fields = [];
      for (const opt of secureShareOptions || []) {
        if (!opt || typeof opt !== "object") continue;
        if (!chosen.has(opt.id)) continue;
        const label = safeValueToString(opt.label);
        const value = safeValueToString(opt.value);
        if (!label || !value) continue;
        fields.push({ label, value });
      }
      payload.fields = fields.slice(0, 32);

      const cid = await uploadJsonToIpfs(payload);
      try {
        await logSafeLinkCreated({ userAddress: account, cid, expiresAt });
      } catch {
      }
      const url = `${window.location.origin}/verify/v1/${cid}`;
      setSecureShareLink(url);
      try {
        await navigator.clipboard.writeText(url);
        setSecureShareNotice("Secure verify link generated (valid for 5 mins). Copied to clipboard, please send to verifier.");
      } catch {
        setSecureShareNotice("Secure verify link generated (valid for 5 mins). Please send to verifier.");
      }
      window.setTimeout(() => {
        unpinFromPinata(cid).catch(() => { });
      }, Math.max(0, expiresAt - Date.now()) + 2000);
    } catch (e) {
      setSecureShareError(String(e?.message || "Generation failed"));
    } finally {
      setSecureShareWorking(false);
    }
  }

  function closeSecureShare() {
    setSecureShareOpen(false);
    setSecureShareError("");
    setSecureShareNotice("");
    setSecureShareMeta(null);
    setSecureShareOptions([]);
    setSecureShareSelected(new Set());
  }

  return (
    <div className="min-h-screen space-y-8 pb-20 pt-4 px-6 lg:px-12 animate-in fade-in duration-700">
      <motion.div
        className="flex flex-col md:flex-row items-start justify-between gap-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-300/80">
            <ShieldCheck className="h-3.5 w-3.5" />
            Credential Center
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-transparent bg-gradient-to-r from-purple-400 via-cyan-300 to-emerald-300 bg-clip-text drop-shadow-[0_0_14px_rgba(56,189,248,0.35)]">
            Credential Center
          </h1>
          <p className="text-slate-400 max-w-2xl text-sm leading-relaxed">
            User-initiated Claim → Institution Verification & Issuance → SBT Management & Showcase.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center rounded-full border border-white/5 bg-black/20 p-1 backdrop-blur-md">
            <TabButton active={mode === "claim"} onClick={() => { setMode("claim"); setManageMode(false); }}>
              <ShieldCheck className="w-4 h-4 inline-block mr-1.5 mb-0.5" /> Claim
            </TabButton>
            <TabButton active={mode === "manage"} onClick={() => setMode("manage")}>
              <Award className="w-4 h-4 inline-block mr-1.5 mb-0.5" /> Manage
            </TabButton>
          </div>

          <NeonButton variant="ghost" onClick={() => { refreshAll(); discoverBatchClaims(); }} className="h-10 w-10 px-0 rounded-full">
            <RefreshCw className={cn("w-5 h-5", working && "animate-spin")} />
          </NeonButton>
        </div>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2"
          >
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {mode === "claim" ? (
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.1, delayChildren: 0.2 }
            }
          }}
        >
          {/* 左侧工作区 (7/12) - 发起申领 */}
          <motion.div
            className="lg:col-span-7 space-y-6"
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
            }}
          >
            <CredentialClaimForm
              institutions={institutions}
              claimInstitution={claimInstitution}
              setClaimInstitution={setClaimInstitution}
              claimCategory={claimCategory}
              setClaimCategory={setClaimCategory}
              claimTitle={claimTitle}
              setClaimTitle={setClaimTitle}
              claimFile={claimFile}
              setClaimFile={setClaimFile}
              claimFileError={claimFileError}
              setClaimFileError={setClaimFileError}
              handleClaimSubmit={handleClaimSubmit}
              isClaimSubmitting={isClaimSubmitting}
              openArchivePick={openArchivePick}
              account={account}
            />
          </motion.div>

          {/* 右侧收件箱 (5/12) - Merkle + 待领取列表 */}
          <motion.div
            className="lg:col-span-5 space-y-6"
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
            }}
          >
            {/* Merkle 极简版 */}
            <MerkleClaimQuery
              batchClaimCid={batchClaimCid}
              setBatchClaimCid={setBatchClaimCid}
              batchClaimWorking={batchClaimWorking}
              loadBatchClaimInfo={loadBatchClaimInfo}
              batchClaimError={batchClaimError}
              batchClaimInfo={batchClaimInfo}
              setBatchClaimInfo={setBatchClaimInfo}
              doBatchClaim={doBatchClaim}
              account={account}
            />

            {/* 待领取凭证列表 (Compact UI) */}
            <PendingCredentialList
              offerRows={offerRows}
              discoveredBatchClaims={discoveredBatchClaims}
              discoveryWorking={discoveryWorking}
              discoverBatchClaims={discoverBatchClaims}
              account={account}
              handleClaimDiscoveredBatch={handleClaimDiscoveredBatch}
              handleRejectDiscoveredBatch={handleRejectDiscoveredBatch}
              handleAcceptOffer={handleAcceptOffer}
              handleRejectOffer={handleRejectOffer}
              offerSafePage={offerSafePage}
              offerTotalPages={offerTotalPages}
              setOfferPage={setOfferPage}
            />
          </motion.div>

          {/* 底部数据台 (12/12) - 我的申请记录 */}
          <motion.div
            className="lg:col-span-12 mt-6"
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
            }}
          >
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
                <History className="w-5 h-5 text-purple-400" />
                My Application History
              </h2>
              <div className="grid gap-4">
                {myClaimRows.length === 0 ? (
                  <div className="text-sm text-slate-400 py-8 text-center bg-slate-950/20 rounded-xl border border-dashed border-slate-800">
                    {account ? "No application history" : "Connect wallet to view history"}
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {myClaimRows.map((c) => {
                      const s = claimStatusLabel(c.status);
                      const statusVariant = c.status === 1 ? "success" : c.status === 2 ? "error" : "pending";

                      return (
                        <motion.div
                          key={c.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40 p-4 transition-all hover:border-slate-700 hover:bg-slate-950/60"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="truncate text-base font-bold text-slate-50">{c.title}</div>
                                <StatusBadge status={statusVariant}>
                                  {s.label}
                                </StatusBadge>
                              </div>

                              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
                                <div className="flex items-center gap-1">
                                  <Tag className="w-3.5 h-3.5" />
                                  <span>Category: <span className="text-slate-200">{categoryLabel(c.category)}</span></span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Building2 className="w-3.5 h-3.5" />
                                  <span>Institution: <span className="text-slate-200">{c.institutionName || "Unknown Institution"}</span></span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Scan className="w-3.5 h-3.5" />
                                  <span>Address: <span className="font-mono text-slate-200">{formatAddress(c.institution)}</span></span>
                                </div>
                                {c.rejectReason ? (
                                  <div className="w-full flex items-start gap-1 text-rose-300 bg-rose-950/20 p-2 rounded-lg mt-1">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span>Rejection Reason: {c.rejectReason}</span>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-800/50 pt-4">
                <div className="text-xs text-slate-500 font-mono">
                  Page {myClaimSafePage} / {myClaimTotalPages} • Total {claims.length}
                </div>
                <div className="flex items-center gap-2">
                  <NeonButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setMyClaimPage((p) => Math.max(1, p - 1))}
                    disabled={myClaimSafePage <= 1}
                    icon={ChevronLeft}
                  >
                    Prev
                  </NeonButton>
                  <NeonButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setMyClaimPage((p) => Math.min(myClaimTotalPages, p + 1))}
                    disabled={myClaimSafePage >= myClaimTotalPages}
                    icon={ChevronRight}
                    iconPosition="right"
                  >
                    Next
                  </NeonButton>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          className="grid gap-6"
          initial="hidden"
          animate="show"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.1, delayChildren: 0.1 }
            }
          }}
        >
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
            }}
          >
            <GlassCard className="p-6 relative overflow-hidden min-h-[600px]">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Award className="w-64 h-64 text-purple-500" />
              </div>

              <div className="flex flex-col h-full relative z-10">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 shrink-0">
                  <h2 className="text-xl font-bold text-white flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                      <Award className="w-6 h-6" />
                    </div>
                    My SBT Medal Wall
                    <span className="text-sm font-normal text-slate-400 bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-700/50">
                      {filteredMedals.length} items
                    </span>
                  </h2>

                  <div className="flex flex-wrap items-center gap-3">
                    <NeonButton
                      variant={manageMode ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => {
                        setManageMode((v) => !v);
                        clearSelection();
                      }}
                      disabled={!account}
                      icon={manageMode ? CheckCircle2 : Settings}
                    >
                      {manageMode ? "Exit Batch Manage" : "Batch Manage"}
                    </NeonButton>
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-6 min-h-0">
                  {/* Search & Filter Bar */}
                  <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center bg-slate-900/30 p-1.5 rounded-xl border border-slate-800/50">
                    <div className="relative flex-1 group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors">
                        <Search className="w-4 h-4" />
                      </div>
                      <input
                        className="w-full bg-transparent border-none py-2.5 pl-10 pr-10 text-sm text-slate-100 placeholder:text-slate-600 focus:ring-0"
                        value={tokenSearch}
                        onChange={(e) => setTokenSearch(e.target.value)}
                        placeholder="Search by title, institution, or ID..."
                        disabled={!account}
                      />
                      {tokenSearch && (
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                          onClick={() => setTokenSearch("")}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="h-8 w-px bg-slate-800/50 hidden md:block" />

                    <div className="flex items-center gap-1 overflow-x-auto pb-2 md:pb-0 no-scrollbar px-1">
                      {categoryOptions.map((key) => (
                        <button
                          key={key}
                          onClick={() => setTokenCategory(key)}
                          disabled={!account}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                            tokenCategory === key
                              ? "bg-slate-700 text-white shadow-sm"
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                          )}
                        >
                          {key === "all" ? "All" : key}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bulk Actions Toolbar */}
                  <AnimatePresence>
                    {manageMode && selectedCount > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-cyan-500/30 bg-cyan-950/10 p-3 shadow-lg shadow-cyan-900/10">
                          <div className="flex items-center gap-2 text-sm text-cyan-200 font-medium px-2">
                            <CheckCircle2 className="w-4 h-4" />
                            Selected {selectedCount} items
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <NeonButton
                              variant="secondary"
                              size="sm"
                              onClick={() => applyBulkDisplayed(true)}
                              disabled={!!bulkAction}
                              icon={Eye}
                            >
                              Set Visible
                            </NeonButton>
                            <NeonButton
                              variant="ghost"
                              size="sm"
                              onClick={() => applyBulkDisplayed(false)}
                              disabled={!!bulkAction}
                              icon={EyeOff}
                            >
                              Set Hidden
                            </NeonButton>
                            <div className="w-px h-6 bg-slate-700/50 mx-1" />
                            <NeonButton
                              variant="danger"
                              size="sm"
                              onClick={applyBulkBurn}
                              disabled={!!bulkAction}
                              icon={Trash2}
                            >
                              Burn
                            </NeonButton>
                            <NeonButton
                              variant="ghost"
                              size="sm"
                              onClick={clearSelection}
                              disabled={!!bulkAction}
                            >
                              Cancel
                            </NeonButton>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* SBT Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[200px]">
                    {tokenPageRows.length === 0 ? (
                      <div className="md:col-span-2 flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
                        <div className="p-4 rounded-full bg-slate-900 mb-4">
                          <ShieldCheck className="w-10 h-10 text-slate-700" />
                        </div>
                        <div className="text-slate-400 font-medium">
                          {account ? "No credentials found" : "Connect wallet to view your digital assets"}
                        </div>
                        {account && (
                          <div className="mt-2 text-xs text-slate-600">
                            Try changing search criteria or initiate a new claim
                          </div>
                        )}
                      </div>
                    ) : (
                      <AnimatePresence mode="popLayout">
                        {tokenPageRows.map((it, idx) => {
                          if (it.kind === "legacy") {
                            const t = it.raw;
                            const checked = selectedTokenIds.has(it.id);
                            return (
                              <motion.div
                                key={it.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                              >
                                <SBTCard
                                  title={it.title}
                                  subtitle={it.subtitle}
                                  imageUrl={it.imageUrl}
                                  onTitleClick={() => openMetaForMedal(it)}
                                  leading={
                                    manageMode ? (
                                      <div className="flex items-center justify-center h-full pr-2">
                                        <input
                                          type="checkbox"
                                          className="h-5 w-5 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-0 transition-all cursor-pointer"
                                          checked={checked}
                                          onChange={() => toggleTokenSelect(it.id)}
                                          disabled={!account || !!bulkAction}
                                        />
                                      </div>
                                    ) : null
                                  }
                                  tags={[
                                    { label: it.category, tone: "info" },
                                    { label: it.displayed ? "Visible" : "Hidden", tone: it.displayed ? "success" : "neutral" }
                                  ]}
                                  metaLines={[`Issuer: ${t.issuerName || "Unknown Institution"}`, `Contract: ${formatAddress(t.issuer)}`]}
                                  primaryAction={
                                    t.privateCid
                                      ? {
                                        label: "View Original",
                                        onClick: () => openTokenView(t),
                                        disabled: !account,
                                        tone: "primary"
                                      }
                                      : null
                                  }
                                  secondaryAction={
                                    t.privateCid
                                      ? {
                                        label: "Archive",
                                        onClick: () => openArchiveQuick({ kind: "legacy", privateCid: t.privateCid }),
                                        disabled: !account
                                      }
                                      : null
                                  }
                                />
                              </motion.div>
                            );
                          }

                          if (it.kind === "batchPending") {
                            const b = it.batch;
                            return (
                              <motion.div
                                key={it.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                              >
                                <SBTCard
                                  title={it.title}
                                  subtitle={it.subtitle}
                                  imageUrl={it.imageUrl}
                                  onTitleClick={() => openMetaForMedal(it)}
                                  tags={[
                                    { label: "Pending", tone: "warning" },
                                    it.category ? { label: it.category, tone: "neutral" } : null
                                  ]}
                                  metaLines={[`Dist CID: ${b.distributionCID.slice(0, 10)}...`, `Root: ${b.merkleRoot.slice(0, 10)}...`]}
                                  primaryAction={{
                                    label: "Quick Claim",
                                    onClick: () => handleClaimDiscoveredBatch(b),
                                    disabled: !account,
                                    tone: "success"
                                  }}
                                  secondaryAction={{
                                    label: "Reject",
                                    onClick: () => handleRejectDiscoveredBatch(b, true),
                                    disabled: !account
                                  }}
                                />
                              </motion.div>
                            );
                          }

                          if (it.kind === "batchToken") {
                            const hasAttachment = Boolean(String(it.attachmentCID || "").trim());
                            const hasPrivate = Boolean(String(it.privateCid || "").trim());
                            const checked = selectedTokenIds.has(it.id);
                            return (
                              <motion.div
                                key={it.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                              >
                                <SBTCard
                                  title={it.title}
                                  subtitle={it.subtitle}
                                  imageUrl={it.imageUrl}
                                  onTitleClick={() => openMetaForMedal(it)}
                                  leading={
                                    manageMode ? (
                                      <div className="flex items-center justify-center h-full pr-2">
                                        <input
                                          type="checkbox"
                                          className="h-5 w-5 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-0 transition-all cursor-pointer"
                                          checked={checked}
                                          onChange={() => toggleTokenSelect(it.id)}
                                          disabled={!account || !!bulkAction}
                                        />
                                      </div>
                                    ) : null
                                  }
                                  tags={[
                                    { label: it.category || "Batch Issue", tone: "info" },
                                    { label: it.displayed ? "Visible" : "Hidden", tone: it.displayed ? "success" : "neutral" }
                                  ]}
                                  metaLines={[`Issuer: ${it.issuerName || "-"}`, `Contract: ${formatAddress(it.issuerAddress || "")}`]}
                                  primaryAction={
                                    hasAttachment || hasPrivate
                                      ? {
                                        label: "View Original",
                                        onClick: () =>
                                          openTokenView({
                                            kind: "batchToken",
                                            tokenId: it.tokenId,
                                            title: it.title,
                                            issuerName: it.issuerName,
                                            issuerAddress: it.issuerAddress,
                                            tokenURI: it.tokenURI,
                                            imageUrl: it.imageUrl,
                                            attachmentCID: it.attachmentCID,
                                            privateCid: it.privateCid || ""
                                          }),
                                        disabled: !account,
                                        tone: "primary"
                                      }
                                      : null
                                  }
                                  secondaryAction={{
                                    label: hasAttachment ? "Archive" : "No Attachment",
                                    onClick: hasAttachment
                                      ? () =>
                                        openArchiveQuick({ kind: "batchToken", attachmentCID: it.attachmentCID, name: it.title })
                                      : undefined,
                                    disabled: !account || !hasAttachment
                                  }}
                                />
                              </motion.div>
                            );
                          }

                          return null;
                        })}
                      </AnimatePresence>
                    )}
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-800/50 mt-auto shrink-0">
                    <div className="text-xs text-slate-500 font-mono pl-2">
                      Page {tokenSafePage} of {tokenTotalPages} • Total {filteredMedals.length} Items
                    </div>
                    <div className="flex items-center gap-2">
                      <NeonButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setTokenPage((p) => Math.max(1, p - 1))}
                        disabled={tokenSafePage <= 1}
                        icon={ChevronLeft}
                      >
                        Prev
                      </NeonButton>
                      <NeonButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setTokenPage((p) => Math.min(tokenTotalPages, p + 1))}
                        disabled={tokenSafePage >= tokenTotalPages}
                        icon={ChevronRight}
                        iconPosition="right"
                      >
                        Next
                      </NeonButton>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}

      <AnimatePresence>
        {metaOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-2xl max-h-[85vh] flex flex-col"
            >
              <GlassCard className="flex flex-col h-full overflow-hidden border-slate-700/50 shadow-2xl shadow-purple-900/20">
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-5 bg-white/5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-cyan-400" />
                        <div className="truncate text-lg font-bold text-white">{metaTitle || "SBT Metadata"}</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-400 font-mono">Public Metadata Viewer</div>
                    </div>
                    <NeonButton
                      variant="ghost"
                      size="sm"
                      onClick={closeMeta}
                      icon={XCircle}
                      className="hover:bg-white/10"
                    />
                  </div>

                  <div className="min-h-0 flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar">
                    {metaError && (
                      <div className="flex items-start gap-3 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200">
                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="text-sm">{metaError}</div>
                      </div>
                    )}

                    {metaJson ? (
                      <div className="relative group">
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <NeonButton
                            variant="ghost"
                            size="sm"
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(metaJson, null, 2))}
                            icon={FileText}
                          >
                            Copy
                          </NeonButton>
                        </div>
                        <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-[#0B0E14] p-4 text-xs text-cyan-100 font-mono leading-relaxed shadow-inner">
                          {JSON.stringify(metaJson, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                        <File className="w-12 h-12 opacity-20 mb-3" />
                        <div className="text-sm">No metadata available</div>
                      </div>
                    )}
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tokenViewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeTokenView}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#151921] shadow-2xl"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-5 bg-white/5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Lock className="w-5 h-5 text-cyan-400" />
                    <div className="truncate text-lg font-bold text-white">
                      {tokenViewToken?.title || "SBT Private Credential Viewer"}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-400 font-mono">
                    Secure Private Content Viewer
                  </div>
                </div>
                <NeonButton
                  variant="ghost"
                  size="sm"
                  onClick={closeTokenView}
                  disabled={tokenViewLoading}
                  icon={XCircle}
                  className="hover:bg-white/10"
                />
              </div>

              <div className="max-h-[70vh] overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {tokenViewError && (
                  <div className="mb-6 flex items-start gap-3 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 animate-pulse">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-sm font-medium">{tokenViewError}</div>
                  </div>
                )}

                {shareNotice && (
                  <div className="mb-6 p-4 rounded-xl border border-green-500/30 bg-green-500/10 text-green-200 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {shareNotice}
                  </div>
                )}

                {secureShareNotice && (
                  <div className="mb-6 p-4 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-200 text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    {secureShareNotice}
                  </div>
                )}

                {secureShareLink && (
                  <div className="mb-6 p-5 rounded-xl border border-purple-500/30 bg-purple-900/20">
                    <div className="text-xs font-bold text-purple-300 mb-2 uppercase tracking-wider">Secure Verification Link (5m TTL)</div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex-1 bg-slate-950/50 rounded-lg border border-purple-500/20 px-3 py-2 text-xs font-mono text-purple-100 truncate">
                        {secureShareLink}
                      </div>
                      <NeonButton
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(secureShareLink);
                            setSecureShareNotice("Secure verify link copied (valid for 5 mins). Please send to verifier.");
                          } catch {
                            setSecureShareNotice("Copy failed, please copy manually");
                          }
                        }}
                        icon={Share2}
                      >
                        Copy Link
                      </NeonButton>
                    </div>
                  </div>
                )}

                {!tokenViewPayload ? (
                  <div className="max-w-md mx-auto py-2">
                    <div className="text-center mb-2">
                      <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4 border border-slate-700 shadow-inner">
                        <Lock className="w-8 h-8 text-cyan-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Decryption Required</h3>
                      <p className="text-slate-400 text-sm">Enter your personal password to unlock the seed envelope and derive the viewing key</p>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300 ml-1">Personal Password</label>
                        <input
                          className="w-full rounded-xl border border-slate-700 bg-slate-900/50 p-4 text-base text-white placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all text-center tracking-widest"
                          value={tokenViewPassword}
                          onChange={(e) => setTokenViewPassword(e.target.value)}
                          placeholder="••••••••"
                          type="password"
                          disabled={tokenViewLoading}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleTokenDecrypt();
                          }}
                          autoFocus
                        />
                      </div>

                      <NeonButton
                        variant="primary"
                        size="lg"
                        className="w-full justify-center shadow-lg shadow-cyan-900/20"
                        onClick={handleTokenDecrypt}
                        disabled={tokenViewLoading || !tokenViewPassword}
                        loading={tokenViewLoading}
                        icon={Lock}
                      >
                        {tokenViewLoading ? "Decrypting secure envelope..." : "Decrypt & View Now"}
                      </NeonButton>

                      <div className="relative py-4">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-slate-800"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="bg-[#151921] px-2 text-slate-500">OR</span>
                        </div>
                      </div>

                      <NeonButton
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center text-slate-400 hover:text-cyan-400"
                        onClick={openSecureShare}
                        disabled={!account || secureShareWorking}
                        icon={ShieldCheck}
                      >
                        {secureShareWorking ? "Generating Link..." : "Generate Secure Verify Link Only (No View)"}
                      </NeonButton>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-cyan-950/20 p-4 rounded-xl border border-cyan-500/20">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-cyan-100">Decryption Successful</div>
                          <div className="text-xs text-cyan-300/70 mt-0.5">
                            {tokenViewPayload.name || "Untitled File"}
                            {tokenViewPayload.type && <span className="opacity-60 ml-2">({tokenViewPayload.type})</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <NeonButton
                          variant="secondary"
                          size="sm"
                          onClick={openArchiveStore}
                          icon={Download}
                        >
                          Archive
                        </NeonButton>
                        <NeonButton
                          variant="secondary"
                          size="sm"
                          onClick={handleGenerateShareLink}
                          icon={Share2}
                        >
                          Share Link
                        </NeonButton>
                        <NeonButton
                          variant="secondary"
                          size="sm"
                          onClick={openSecureShare}
                          disabled={!account || secureShareWorking}
                          icon={ShieldCheck}
                        >
                          Verify Link
                        </NeonButton>
                      </div>
                    </div>

                    {shareLink && (
                      <div className="p-5 rounded-xl border border-cyan-500/30 bg-cyan-900/10">
                        <div className="text-xs font-bold text-cyan-300 mb-2 uppercase tracking-wider">Temporary Share Link (5m TTL)</div>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex-1 bg-slate-950/50 rounded-lg border border-cyan-500/20 px-3 py-2 text-xs font-mono text-cyan-100 truncate">
                            {shareLink}
                          </div>
                          <NeonButton
                            variant="primary"
                            size="sm"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(shareLink);
                                setShareNotice("Link copied (valid for 5 mins). Please send to verifier.");
                              } catch {
                                setShareNotice("Copy failed, please copy manually");
                              }
                            }}
                            icon={Share2}
                          >
                            Copy
                          </NeonButton>
                        </div>
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-700 bg-slate-950 shadow-inner overflow-hidden relative group">
                      {tokenViewPayload.dataUrl ? (
                        isPdfLike({ name: tokenViewPayload.name, type: tokenViewPayload.type }) ? (
                          <iframe
                            title={tokenViewPayload.name || "pdf"}
                            className="w-full h-[500px] bg-white"
                            src={tokenViewPayload.dataUrl}
                          />
                        ) : isImageLike({ name: tokenViewPayload.name, type: tokenViewPayload.type }) ? (
                          <div className="flex justify-center bg-black/50 p-4">
                            <img
                              className="max-h-[500px] object-contain"
                              alt={tokenViewPayload.name || "preview"}
                              src={tokenViewPayload.dataUrl}
                            />
                          </div>
                        ) : (
                          <div className="text-center p-12">
                            <File className="w-20 h-20 text-slate-700 mx-auto mb-4" />
                            <p className="text-slate-400 mb-6">File type not supported for preview</p>
                            <NeonButton
                              variant="primary"
                              onClick={() => window.open(tokenViewPayload.dataUrl, '_blank')}
                              icon={ExternalLink}
                            >
                              Download / Open in New Window
                            </NeonButton>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-center text-slate-500">
                          <Loader2 className="w-10 h-10 animate-spin mb-3 opacity-50" />
                          <div className="text-sm">Loading preview...</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {secureShareOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl flex flex-col max-h-[90vh] h-[90vh]"
            >
              <GlassCard className="flex flex-col h-full overflow-hidden border-purple-500/30 shadow-2xl shadow-purple-900/20">
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-5 bg-white/5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-purple-400" />
                        <div className="truncate text-lg font-bold text-white">Secure Verification Share</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-400 font-mono">Generate desensitized JSON & upload to IPFS (Expires in 5 mins)</div>
                    </div>
                    <NeonButton
                      variant="ghost"
                      size="sm"
                      onClick={closeSecureShare}
                      disabled={secureShareWorking}
                      icon={XCircle}
                      className="hover:bg-white/10"
                    />
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
                    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 text-xs text-purple-200 flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0 text-purple-400" />
                      Sensitive info like TokenID, holder address, encrypted attachment CID will NOT be included.
                    </div>

                    {secureShareError && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {secureShareError}
                      </div>
                    )}

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Mandatory Public (Non-cancellable)</div>
                      <div className="grid gap-3">
                        {[
                          "Public Certificate Image",
                          "Issuer Name",
                          "Issuer Address",
                          "Issuance Time"
                        ].map((label) => (
                          <label key={label} className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/50 border border-white/5 opacity-70">
                            <div className="w-4 h-4 rounded border border-purple-500 bg-purple-500 flex items-center justify-center">
                              <CheckCircle2 className="w-3 h-3 text-white" />
                            </div>
                            <span className="text-sm text-slate-300">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Optional Public Fields</div>
                      <div className="grid gap-2">
                        {(secureShareOptions || []).length === 0 ? (
                          <div className="text-sm text-slate-500 italic py-2">No public fields resolved</div>
                        ) : (
                          (secureShareOptions || []).map((f) => {
                            const checked = secureShareSelected instanceof Set ? secureShareSelected.has(f.id) : false;
                            const preview = String(f.value || "").slice(0, 80);
                            return (
                              <label key={f.id} className={cn(
                                "flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer group",
                                checked
                                  ? "border-purple-500/50 bg-purple-500/10"
                                  : "border-white/5 bg-slate-900/30 hover:bg-slate-900/50 hover:border-white/10"
                              )}>
                                <div className="relative flex items-center mt-0.5">
                                  <input
                                    type="checkbox"
                                    className="peer sr-only"
                                    checked={checked}
                                    onChange={() =>
                                      setSecureShareSelected((prev) => {
                                        const next = prev instanceof Set ? new Set(prev) : new Set();
                                        if (next.has(f.id)) next.delete(f.id);
                                        else next.add(f.id);
                                        return next;
                                      })
                                    }
                                    disabled={secureShareWorking}
                                  />
                                  <div className="w-5 h-5 rounded border border-slate-600 peer-checked:bg-purple-500 peer-checked:border-purple-500 transition-all flex items-center justify-center">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100" />
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className={cn("text-sm font-medium transition-colors", checked ? "text-purple-200" : "text-slate-200")}>
                                    {f.label}
                                  </div>
                                  <div className="truncate text-xs text-slate-500 group-hover:text-slate-400 mt-0.5">{preview}</div>
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-white/5">
                    <NeonButton
                      variant="ghost"
                      onClick={closeSecureShare}
                      disabled={secureShareWorking}
                    >
                      Cancel
                    </NeonButton>
                    <NeonButton
                      variant="primary"
                      onClick={confirmSecureShare}
                      disabled={secureShareWorking}
                      loading={secureShareWorking}
                      icon={ShieldCheck}
                    >
                      {secureShareWorking ? "Generating..." : "Confirm Generate"}
                    </NeonButton>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {archivePickOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl flex flex-col max-h-[90vh]"
            >
              <GlassCard className="flex flex-col overflow-hidden border-cyan-500/30 shadow-2xl shadow-cyan-900/20">
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-5 bg-white/5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-cyan-400" />
                        <div className="truncate text-lg font-bold text-white">Select from Archive</div>
                      </div>
                      <div className="mt-1 text-xs text-slate-400 font-mono">Verify password to browse and select archived files</div>
                    </div>
                    <NeonButton
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setArchivePickOpen(false);
                        setArchivePickPassword("");
                        setArchivePickError("");
                        setArchivePickWorking(false);
                        setArchivePickSeedHex("");
                        setArchivePickCategoryName("Original Documents");
                        setArchivePickFiles([]);
                        setArchivePickSelectedId("");
                      }}
                      disabled={archivePickWorking}
                      icon={XCircle}
                      className="hover:bg-white/10"
                    />
                  </div>

                  <div className="min-h-0 flex-grow overflow-y-auto p-6 custom-scrollbar space-y-4">
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-300">Select Category</label>
                        <div className="relative">
                          <select
                            className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all appearance-none hover:bg-white/10"
                            value={archivePickCategoryName}
                            onChange={(e) => setArchivePickCategoryName(e.target.value)}
                            disabled={archivePickWorking}
                          >
                            {archiveCategories.map((n) => (
                              <option key={n} value={n} className="bg-slate-900 text-slate-300">
                                {n}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                        </div>
                        {archiveCategorySyncing && <div className="text-xs text-cyan-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Syncing...</div>}
                      </div>

                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-300">Personal Password</label>
                        <div className="flex gap-3">
                          <input
                            className="flex-1 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all placeholder:text-slate-500 hover:bg-white/10"
                            value={archivePickPassword}
                            onChange={(e) => setArchivePickPassword(e.target.value)}
                            placeholder="To unlock Master Seed & decrypt archive list"
                            type="password"
                            disabled={archivePickWorking}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") loadArchivePickFiles();
                            }}
                          />
                          <NeonButton
                            variant="secondary"
                            onClick={loadArchivePickFiles}
                            disabled={archivePickWorking || !archivePickPassword}
                            loading={archivePickWorking}
                            icon={Unlock}
                          >
                            {archivePickWorking ? "Loading..." : "Unlock & Load"}
                          </NeonButton>
                        </div>
                      </div>

                      {archivePickError && (
                        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          {archivePickError}
                        </div>
                      )}

                      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                        <div className="p-3 border-b border-white/5 bg-white/5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          File List
                        </div>
                        <div className="p-2 grid gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                          {archivePickVisibleFiles.length === 0 ? (
                            <div className="text-sm text-slate-500 italic text-center py-8">No files available in this category</div>
                          ) : (
                            archivePickVisibleFiles.map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                className={clsx(
                                  "rounded-lg border p-3 text-left transition-all group relative overflow-hidden",
                                  archivePickSelectedId === f.id
                                    ? "border-cyan-500/50 bg-cyan-500/10"
                                    : "border-transparent bg-slate-900/30 hover:bg-slate-900/50 hover:border-white/10"
                                )}
                                onClick={() => setArchivePickSelectedId(f.id)}
                              >
                                <div className="flex items-start justify-between gap-3 relative z-10">
                                  <div className="min-w-0 flex items-center gap-3">
                                    <div className={clsx(
                                      "w-8 h-8 rounded-lg flex items-center justify-center border",
                                      archivePickSelectedId === f.id ? "border-cyan-500/30 bg-cyan-500/20 text-cyan-400" : "border-slate-700 bg-slate-800 text-slate-500"
                                    )}>
                                      <FileText className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className={clsx("truncate text-sm font-semibold transition-colors", archivePickSelectedId === f.id ? "text-cyan-100" : "text-slate-200")}>
                                        {f.name}
                                      </div>
                                      <div className="mt-0.5 text-xs text-slate-500 font-mono">{f.mime || "unknown"}</div>
                                    </div>
                                  </div>
                                  <div className="text-xs text-slate-500 font-mono bg-slate-950/30 px-2 py-1 rounded">{formatBytes(f.size)}</div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-white/5">
                    <NeonButton
                      variant="ghost"
                      onClick={() => setArchivePickOpen(false)}
                      disabled={archivePickWorking}
                    >
                      Cancel
                    </NeonButton>
                    <NeonButton
                      variant="primary"
                      onClick={confirmArchivePick}
                      disabled={archivePickWorking || !archivePickSelectedId}
                      loading={archivePickWorking}
                      icon={CheckCircle2}
                    >
                      {archivePickWorking ? "Processing..." : "Confirm Selection"}
                    </NeonButton>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {archiveStoreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg"
            >
              <GlassCard className="flex flex-col overflow-hidden border-cyan-500/30 shadow-2xl shadow-cyan-900/20">
                <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-5 bg-white/5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Archive className="w-5 h-5 text-cyan-400" />
                      <div className="truncate text-lg font-bold text-white">Save to Archive</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-400 font-mono">Select target folder to re-encrypt attachment and save on-chain</div>
                  </div>
                  <NeonButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setArchiveStoreOpen(false);
                      setArchiveStoreError("");
                      setArchiveStoreNotice("");
                      setArchiveStoreWorking(false);
                    }}
                    disabled={archiveStoreWorking}
                    icon={XCircle}
                    className="hover:bg-white/10"
                  />
                </div>

                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Select Category</label>
                    <div className="relative">
                      <select
                        className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all appearance-none hover:bg-white/10"
                        value={archiveStoreCategoryName}
                        onChange={(e) => setArchiveStoreCategoryName(e.target.value)}
                        disabled={archiveStoreWorking}
                      >
                        {archiveCategories.map((n) => (
                          <option key={n} value={n} className="bg-slate-900 text-slate-300">
                            {n}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>
                    {archiveCategorySyncing && <div className="text-xs text-cyan-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Syncing...</div>}
                  </div>

                  {archiveStoreError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {archiveStoreError}
                    </div>
                  )}
                  {archiveStoreNotice && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      {archiveStoreNotice}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-white/5">
                  <NeonButton
                    variant="ghost"
                    onClick={() => setArchiveStoreOpen(false)}
                    disabled={archiveStoreWorking}
                  >
                    Cancel
                  </NeonButton>
                  <NeonButton
                    variant="primary"
                    onClick={confirmArchiveStore}
                    disabled={archiveStoreWorking || !tokenViewPayload?.dataUrl}
                    loading={archiveStoreWorking}
                    icon={Archive}
                  >
                    {archiveStoreWorking ? "Archiving..." : "Confirm Archive"}
                  </NeonButton>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {archiveQuickOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg"
            >
              <GlassCard className="flex flex-col overflow-hidden border-cyan-500/30 shadow-2xl shadow-cyan-900/20">
                <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-5 bg-white/5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-cyan-400" />
                      <div className="truncate text-lg font-bold text-white">Quick Archive</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-400 font-mono">Select category to silently encrypt & archive attachment on-chain</div>
                  </div>
                  <NeonButton
                    variant="ghost"
                    size="sm"
                    onClick={closeArchiveQuick}
                    disabled={archiveQuickWorking}
                    icon={XCircle}
                    className="hover:bg-white/10"
                  />
                </div>

                <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Select Category</label>
                    <div className="relative">
                      <select
                        className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/50 transition-all appearance-none hover:bg-white/10"
                        value={archiveQuickCategoryName}
                        onChange={(e) => setArchiveQuickCategoryName(e.target.value)}
                        disabled={archiveQuickWorking}
                      >
                        {archiveCategories.map((n) => (
                          <option key={n} value={n} className="bg-slate-900 text-slate-300">
                            {n}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>
                    {archiveCategorySyncing && <div className="text-xs text-cyan-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Syncing...</div>}
                  </div>

                  {archiveQuickProgress && (
                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-200 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      {archiveQuickProgress}
                    </div>
                  )}
                  {archiveQuickError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {archiveQuickError}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-white/5">
                  <NeonButton
                    variant="ghost"
                    onClick={closeArchiveQuick}
                    disabled={archiveQuickWorking}
                  >
                    Cancel
                  </NeonButton>
                  <NeonButton
                    variant="primary"
                    onClick={confirmArchiveQuick}
                    disabled={archiveQuickWorking}
                    loading={archiveQuickWorking}
                    icon={Archive}
                  >
                    {archiveQuickWorking ? "Archiving..." : "Confirm Archive"}
                  </NeonButton>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {archiveToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className="fixed bottom-8 left-1/2 z-[60] flex items-center gap-3 rounded-full border border-slate-700 bg-slate-950/90 px-6 py-3 text-sm font-medium text-slate-100 shadow-xl backdrop-blur-md"
          >
            <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            {archiveToast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
