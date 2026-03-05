import { createContext, createElement, useContext, useMemo, useState } from "react";
import { ethers } from "ethers";
import {
  createFileId,
  createSeedEnvelope,
  decryptData,
  decryptWithDerivedKey,
  deriveFileKey,
  encryptWithDerivedKey,
  fetchEncryptedFromPinataGateway,
  generateMasterSeedHex,
  openSeedEnvelope,
  uploadToPinata,
  uploadFileToPinata
} from "../services/securityService";
import { NOTARY_ABI } from "../contracts/NotaryAbi";
import { CREDENTIAL_CENTER_ABI } from "../contracts/CredentialCenterAbi";
import { USER_SCORE_REGISTRY_ABI } from "../contracts/UserScoreRegistryAbi";
import { ISSUER_BATCH_ABI } from "../contracts/IssuerBatchAbi";
import { ARCHIVES_REGISTRY_ABI } from "../contracts/ArchivesRegistryAbi";

const EXPECTED_CHAIN_ID = 1337n;
const EXPECTED_CHAIN_ID_HEX = "0x539";
const DEFAULT_NOTARY_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

const TrustProtocolContext = createContext(null);

function normalizeAddressKey(addr) {
  return String(addr || "").trim().toLowerCase();
}

function masterSeedStorageKey(addr) {
  return `TA_MASTER_SEED_${normalizeAddressKey(addr)}`;
}

function seedEnvelopeStorageKey(addr) {
  return `TA_SEED_ENVELOPE_${normalizeAddressKey(addr)}`;
}

function sessionSeedStorageKey(addr) {
  return `TA_SESSION_MASTER_SEED_${normalizeAddressKey(addr)}`;
}

function parseProviderError(e) {
  const message =
    e?.shortMessage ||
    e?.reason ||
    e?.info?.error?.message ||
    e?.error?.message ||
    e?.message ||
    String(e);

  if (message.includes("Internal JSON-RPC error")) {
    return (
      "钱包返回 Internal JSON-RPC error（常见原因：\n" +
      "1) MetaMask 没连到本地链 127.0.0.1:8545（链ID=1337）\n" +
      "2) 当前网络找不到合约（合约地址/网络不匹配）\n" +
      "3) 当前账户在该网络没余额，无法支付 gas\n" +
      "解决：先切换到本地链，确认合约地址正确，并确保账户有本地 ETH。"
    );
  }

  if (message.includes("EXPIRED")) {
    return "该存证已过公示期（已过期），无法签署或继续操作。";
  }

  if (message.includes("EMERGENCY_MUST_PERMANENT")) {
    return "紧急取证模式必须设置为永久（expiryTime=0）。";
  }

  if (message.includes("EXPIRY_INVALID")) {
    return "公示期（到期时间）无效：必须设置为未来时间或选择“永久”。";
  }

  if (message.includes("TITLE_REQUIRED")) {
    return "公证协议需输入标题以供识别";
  }

  if (message.includes("ONLY_OWNER")) {
    return "仅合约管理员可执行该操作（ONLY_OWNER）。";
  }

  if (message.includes("ONLY_INSTITUTION")) {
    return "当前地址不是已授权机构，无法签发凭证（ONLY_INSTITUTION）。";
  }

  if (message.includes("BLOCKED")) {
    return "该学生已屏蔽当前签发者，无法继续发送凭证。";
  }

  return message;
}

async function getCurrentLocation() {
  if (!navigator.geolocation) {
    throw new Error("当前浏览器不支持定位");
  }

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0
    });
  });

  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

  return { lat, lng, mapsUrl };
}

async function fileToBase64(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

export function TrustProtocolProvider({ children }) {
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
  const credentialContractAddress = import.meta.env.VITE_CREDENTIAL_CONTRACT_ADDRESS;
  const issuerBatchAddress = import.meta.env.VITE_ISSUER_BATCH_ADDRESS;
  const archivesRegistryAddress = import.meta.env.VITE_ARCHIVES_REGISTRY_ADDRESS;
  const scoreRegistryAddress = import.meta.env.VITE_SCORE_REGISTRY_ADDRESS;

  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const [masterSeedHex, setMasterSeedHex] = useState("");
  const [hasSeedEnvelope, setHasSeedEnvelope] = useState(false);
  const [securityModal, setSecurityModal] = useState({
    open: false,
    mode: "init",
    title: "",
    message: ""
  });

  function loadLocalSeed(addr) {
    try {
      const v = localStorage.getItem(masterSeedStorageKey(addr)) || "";
      return typeof v === "string" ? v : "";
    } catch {
      return "";
    }
  }

  function loadLocalEnvelope(addr) {
    try {
      const raw = localStorage.getItem(seedEnvelopeStorageKey(addr)) || "";
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function loadSessionSeed(addr) {
    try {
      const v = sessionStorage.getItem(sessionSeedStorageKey(addr)) || "";
      return typeof v === "string" ? v : "";
    } catch {
      return "";
    }
  }

  function storeLocalSeed(addr, seedHex) {
    localStorage.setItem(masterSeedStorageKey(addr), seedHex);
  }

  function storeLocalEnvelope(addr, envelope) {
    localStorage.setItem(seedEnvelopeStorageKey(addr), JSON.stringify(envelope));
  }

  function storeSessionSeed(addr, seedHex) {
    sessionStorage.setItem(sessionSeedStorageKey(addr), seedHex);
  }

  function clearSessionSeed(addr) {
    try {
      sessionStorage.removeItem(sessionSeedStorageKey(addr));
    } catch {
    }
  }

  function closeSecurityModal() {
    setSecurityModal((s) => ({ ...s, open: false }));
  }

  function openInitSecurityModal(message) {
    setSecurityModal({
      open: true,
      mode: "init",
      title: "初始化安全中心",
      message: message || "首次使用需要设置个人密码，用于包装你的 Master Seed。"
    });
  }

  function openRecoverSecurityModal(message) {
    setSecurityModal({
      open: true,
      mode: "recover",
      title: "恢复 Master Seed",
      message:
        message ||
        "检测到本地 Master Seed 丢失。请输入个人密码解开“种子信封”，恢复后即可继续静默加密上传。"
    });
  }

  async function initSecurityCenter({ personalPassword }) {
    const addr = account;
    if (!addr) throw new Error("请先连接钱包");
    const pwd = typeof personalPassword === "string" ? personalPassword : "";
    if (!pwd) throw new Error("个人密码不能为空");

    const existingSeed = loadLocalSeed(addr);
    const seedHex = existingSeed || generateMasterSeedHex();
    const envelope = createSeedEnvelope({ personalPassword: pwd, masterSeedHex: seedHex });
    storeLocalSeed(addr, seedHex);
    storeLocalEnvelope(addr, envelope);
    try {
      await ensureLocalhostChain();
      const contract = await getContractWithSigner();
      await (await contract.setSeedEnvelope(JSON.stringify(envelope))).wait();
    } catch {
    }
    setMasterSeedHex(seedHex);
    setHasSeedEnvelope(true);
    closeSecurityModal();
    return true;
  }

  async function recoverMasterSeed({ personalPassword }) {
    const addr = account;
    if (!addr) throw new Error("请先连接钱包");
    const pwd = typeof personalPassword === "string" ? personalPassword : "";
    if (!pwd) throw new Error("个人密码不能为空");
    let envelope = loadLocalEnvelope(addr);
    if (!envelope) {
      await ensureLocalhostChain();
      const contract = await getContractWithSigner();
      const raw = await contract.getSeedEnvelope(addr);
      const text = typeof raw === "string" ? raw : "";
      if (!text) throw new Error("未找到种子信封，无法恢复");
      envelope = JSON.parse(text);
      storeLocalEnvelope(addr, envelope);
      setHasSeedEnvelope(true);
    }

    const seedHex = openSeedEnvelope({ personalPassword: pwd, envelope });
    storeLocalSeed(addr, seedHex);
    setMasterSeedHex(seedHex);
    setHasSeedEnvelope(true);
    closeSecurityModal();
    return true;
  }

  async function unlockMasterSeed({ personalPassword }) {
    const addr = account;
    if (!addr) throw new Error("请先连接钱包");
    const pwd = typeof personalPassword === "string" ? personalPassword : "";
    if (!pwd) throw new Error("个人密码不能为空");

    let envelope = loadLocalEnvelope(addr);
    if (!envelope) {
      await ensureLocalhostChain();
      const contract = await getContractWithSigner();
      const raw = await contract.getSeedEnvelope(addr);
      const text = typeof raw === "string" ? raw : "";
      if (!text) throw new Error("未找到种子信封，无法解锁");
      envelope = JSON.parse(text);
      storeLocalEnvelope(addr, envelope);
      setHasSeedEnvelope(true);
    }

    const seedHex = openSeedEnvelope({ personalPassword: pwd, envelope });
    storeLocalSeed(addr, seedHex);
    setMasterSeedHex(seedHex);
    setHasSeedEnvelope(true);
    return seedHex;
  }

  async function unlockMasterSeedSession({ personalPassword }) {
    const addr = account;
    if (!addr) throw new Error("请先连接钱包");
    const pwd = typeof personalPassword === "string" ? personalPassword : "";
    if (!pwd) throw new Error("个人密码不能为空");

    let envelope = loadLocalEnvelope(addr);
    if (!envelope) {
      await ensureLocalhostChain();
      const contract = await getContractWithSigner();
      const raw = await contract.getSeedEnvelope(addr);
      const text = typeof raw === "string" ? raw : "";
      if (!text) throw new Error("未找到种子信封，无法解锁");
      envelope = JSON.parse(text);
      storeLocalEnvelope(addr, envelope);
      setHasSeedEnvelope(true);
    }

    const seedHex = openSeedEnvelope({ personalPassword: pwd, envelope });
    storeSessionSeed(addr, seedHex);
    setMasterSeedHex(seedHex);
    setHasSeedEnvelope(true);
    return seedHex;
  }

  async function rewrapSeedEnvelope({ oldPassword, newPassword }) {
    const addr = account;
    if (!addr) throw new Error("请先连接钱包");
    const oldPwd = typeof oldPassword === "string" ? oldPassword : "";
    const newPwd = typeof newPassword === "string" ? newPassword : "";
    if (!oldPwd) throw new Error("旧密码不能为空");
    if (!newPwd) throw new Error("新密码不能为空");
    if (oldPwd === newPwd) throw new Error("新旧密码不能相同");

    let envelope = loadLocalEnvelope(addr);
    if (!envelope) {
      await ensureLocalhostChain();
      const contract = await getContractWithSigner();
      const raw = await contract.getSeedEnvelope(addr);
      const text = typeof raw === "string" ? raw : "";
      if (!text) throw new Error("未找到种子信封，无法重刷");
      envelope = JSON.parse(text);
      storeLocalEnvelope(addr, envelope);
      setHasSeedEnvelope(true);
    }

    const seedHex = openSeedEnvelope({ personalPassword: oldPwd, envelope });
    const nextEnvelope = createSeedEnvelope({ personalPassword: newPwd, masterSeedHex: seedHex });
    storeLocalEnvelope(addr, nextEnvelope);
    storeSessionSeed(addr, seedHex);
    setMasterSeedHex(seedHex);
    setHasSeedEnvelope(true);

    await ensureLocalhostChain();
    const contract = await getContractWithSigner();
    const tx = await contract.setSeedEnvelope(JSON.stringify(nextEnvelope));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function setSeedEnvelopeText({ envelopeText }) {
    const addr = account;
    if (!addr) throw new Error("请先连接钱包");
    const text = String(envelopeText || "").trim();
    if (!text) throw new Error("缺少种子信封内容");
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    await ensureLocalhostChain();
    const contract = await getContractWithSigner();
    const tx = await contract.setSeedEnvelope(text);
    const receipt = await tx.wait();
    if (parsed) {
      storeLocalEnvelope(addr, parsed);
      setHasSeedEnvelope(true);
    }
    return { txHash: receipt?.hash || tx.hash };
  }

  async function bootstrapSecurityForAccount(addr) {
    const sessionSeed = loadSessionSeed(addr);
    if (sessionSeed) {
      setMasterSeedHex(sessionSeed);
      setHasSeedEnvelope(true);
      return;
    }
    const seedHex = loadLocalSeed(addr);
    const envelope = loadLocalEnvelope(addr);
    setMasterSeedHex(seedHex);
    setHasSeedEnvelope(!!envelope);

    if (seedHex) return;
    if (envelope) {
      openRecoverSecurityModal("检测到种子信封：请输入个人密码恢复 Master Seed。");
      return;
    }

    try {
      await ensureLocalhostChain();
      const contract = await getContractWithSigner();
      const raw = await contract.getSeedEnvelope(addr);
      const text = typeof raw === "string" ? raw : "";
      if (text) {
        const chainEnvelope = JSON.parse(text);
        storeLocalEnvelope(addr, chainEnvelope);
        setHasSeedEnvelope(true);
        openRecoverSecurityModal("已从链上找到种子信封：请输入个人密码恢复 Master Seed。");
        return;
      }
    } catch {
    }

    openInitSecurityModal("检测到你是新用户：请先初始化安全中心以启用静默加密上传。");
  }

  async function ensureLocalhostChain() {
    if (!window.ethereum) throw new Error("未检测到钱包（请安装/启用 MetaMask）");

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    setChainId(network.chainId.toString());

    if (network.chainId === EXPECTED_CHAIN_ID) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: EXPECTED_CHAIN_ID_HEX }]
      });
    } catch (switchErr) {
      if (switchErr?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: EXPECTED_CHAIN_ID_HEX,
              chainName: "Hardhat Localhost",
              rpcUrls: ["http://127.0.0.1:8545"],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }
            }
          ]
        });
      } else {
        throw new Error("请在钱包里手动切换到本地链（127.0.0.1:8545，链ID=1337）");
      }
    }

    const networkAfter = await provider.getNetwork();
    setChainId(networkAfter.chainId.toString());
    if (networkAfter.chainId !== EXPECTED_CHAIN_ID) {
      throw new Error("仍未切换到本地链（127.0.0.1:8545，链ID=1337）");
    }
  }

  async function getContractWithSigner() {
    if (!window.ethereum) throw new Error("未检测到钱包（请安装/启用 MetaMask）");
    if (!contractAddress) throw new Error("缺少 VITE_CONTRACT_ADDRESS（请在 frontend/.env 配置）");

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    setChainId(network.chainId.toString());
    if (network.chainId !== EXPECTED_CHAIN_ID) {
      throw new Error("当前钱包网络不是本地链（127.0.0.1:8545，链ID=1337）");
    }

    const code = await provider.getCode(contractAddress);
    if (!code || code === "0x") {
      throw new Error("当前网络找不到合约代码：请确认合约已部署到本地链，并更新 VITE_CONTRACT_ADDRESS。");
    }

    const signer = await provider.getSigner();
    const contract = new ethers.Contract(contractAddress, NOTARY_ABI, signer);
    try {
      await contract.recordCount();
    } catch (e) {
      const raw = e?.shortMessage || e?.reason || e?.message || String(e);
      if (raw.includes("execution reverted") || raw.includes("no data present")) {
        throw new Error(
          "合约地址看起来不是 Notary（ABI/地址不匹配）。请重新部署 Notary 并把前端 .env 的 VITE_CONTRACT_ADDRESS 更新为新地址，然后重启前端。"
        );
      }
      throw e;
    }
    return contract;
  }

  async function getCredentialContractWithSigner() {
    if (!window.ethereum) throw new Error("未检测到钱包（请安装/启用 MetaMask）");
    if (!credentialContractAddress) {
      throw new Error("缺少 VITE_CREDENTIAL_CONTRACT_ADDRESS（请在 frontend/.env 配置）");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    setChainId(network.chainId.toString());
    if (network.chainId !== EXPECTED_CHAIN_ID) {
      throw new Error("当前钱包网络不是本地链（127.0.0.1:8545，链ID=1337）");
    }

    const code = await provider.getCode(credentialContractAddress);
    if (!code || code === "0x") {
      throw new Error("当前网络找不到凭证合约代码：请确认合约已部署到本地链，并更新 VITE_CREDENTIAL_CONTRACT_ADDRESS。");
    }

    const signer = await provider.getSigner();
    const contract = new ethers.Contract(credentialContractAddress, CREDENTIAL_CENTER_ABI, signer);
    try {
      await contract.owner();
    } catch (e) {
      const raw = e?.shortMessage || e?.reason || e?.message || String(e);
      if (raw.includes("execution reverted") || raw.includes("no data present")) {
        throw new Error(
          "凭证合约地址看起来不正确（ABI/地址不匹配）。请重新部署 CredentialCenter 并更新 VITE_CREDENTIAL_CONTRACT_ADDRESS。"
        );
      }
      throw e;
    }
    return contract;
  }

  async function getScoreRegistryWithSigner() {
    if (!window.ethereum) throw new Error("未检测到钱包（请安装/启用 MetaMask）");
    if (!scoreRegistryAddress) {
      throw new Error("缺少 VITE_SCORE_REGISTRY_ADDRESS（请在 frontend/.env 配置）");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    setChainId(network.chainId.toString());
    if (network.chainId !== EXPECTED_CHAIN_ID) {
      throw new Error("当前钱包网络不是本地链（127.0.0.1:8545，链ID=1337）");
    }

    const code = await provider.getCode(scoreRegistryAddress);
    if (!code || code === "0x") {
      throw new Error("当前网络找不到信用分合约代码：请确认已部署并更新 VITE_SCORE_REGISTRY_ADDRESS。");
    }

    const signer = await provider.getSigner();
    return new ethers.Contract(scoreRegistryAddress, USER_SCORE_REGISTRY_ABI, signer);
  }

  async function getIssuerBatchWithSigner() {
    if (!window.ethereum) throw new Error("未检测到钱包（请安装/启用 MetaMask）");
    if (!issuerBatchAddress) {
      throw new Error("缺少 VITE_ISSUER_BATCH_ADDRESS（请在 frontend/.env 配置）");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    setChainId(network.chainId.toString());
    if (network.chainId !== EXPECTED_CHAIN_ID) {
      throw new Error("当前钱包网络不是本地链（127.0.0.1:8545，链ID=1337）");
    }

    const code = await provider.getCode(issuerBatchAddress);
    if (!code || code === "0x") {
      throw new Error("当前网络找不到批量签发合约代码：请确认已部署并更新 VITE_ISSUER_BATCH_ADDRESS。");
    }

    const signer = await provider.getSigner();
    return new ethers.Contract(issuerBatchAddress, ISSUER_BATCH_ABI, signer);
  }

  async function getArchivesRegistryWithSigner() {
    if (!window.ethereum) throw new Error("未检测到钱包（请安装/启用 MetaMask）");
    if (!archivesRegistryAddress) {
      throw new Error("缺少 VITE_ARCHIVES_REGISTRY_ADDRESS（请在 frontend/.env 配置）");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    setChainId(network.chainId.toString());
    if (network.chainId !== EXPECTED_CHAIN_ID) {
      throw new Error("当前钱包网络不是本地链（127.0.0.1:8545，链ID=1337）");
    }

    const code = await provider.getCode(archivesRegistryAddress);
    if (!code || code === "0x") {
      throw new Error("当前网络找不到档案归档注册表合约代码：请确认已部署并更新 VITE_ARCHIVES_REGISTRY_ADDRESS。");
    }

    const signer = await provider.getSigner();
    return new ethers.Contract(archivesRegistryAddress, ARCHIVES_REGISTRY_ABI, signer);
  }

  async function connectWallet() {
    setIsConnecting(true);
    try {
      if (!window.ethereum) throw new Error("未检测到钱包（请安装/启用 MetaMask）");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const selected = accounts?.[0];
      if (!selected) throw new Error("未获取到钱包地址");
      setAccount(selected);
      const network = await provider.getNetwork();
      setChainId(network.chainId.toString());
      await bootstrapSecurityForAccount(selected);

      // --- Public Key Extraction via Signature Recovery (SIGN-ONCE) ---
      // Only prompt if this user has NOT already registered their public key.
      // Check order: localStorage cache → backend API → prompt signature.
      const pubKeyCacheKey = `TA_PUBKEY_REGISTERED_${selected.toLowerCase()}`;
      const alreadyCached = (() => { try { return localStorage.getItem(pubKeyCacheKey) === "1"; } catch { return false; } })();

      if (!alreadyCached) {
        // Check backend to see if the key was registered in a previous session
        let alreadyOnBackend = false;
        try {
          const checkRes = await fetch("/api/users/public-keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: [selected] })
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const existing = checkData?.keys?.[selected] || checkData?.keys?.[selected.toLowerCase()] || "";
            if (existing) {
              alreadyOnBackend = true;
              try { localStorage.setItem(pubKeyCacheKey, "1"); } catch { }
            }
          }
        } catch { }

        if (!alreadyOnBackend) {
          // First time — prompt user to sign a welcome message
          try {
            const signer = await provider.getSigner();
            const nonce = `${Date.now()}-${crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")}`;
            const message =
              "Welcome to TrustArchive!\n" +
              "Please sign this message to verify your identity.\n" +
              "This will NOT cost any gas.\n\n" +
              `Nonce: ${nonce}`;

            const signature = await signer.signMessage(message);
            const digest = ethers.hashMessage(message);
            const uncompressedPubKey = ethers.SigningKey.recoverPublicKey(digest, signature);

            // Verify the recovered key belongs to this address
            const derived = ethers.computeAddress(uncompressedPubKey);
            if (derived.toLowerCase() === selected.toLowerCase()) {
              // Report to backend (fire-and-forget, do not block login)
              fetch("/api/connect/register-key", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ walletAddress: selected, publicKey: uncompressedPubKey })
              }).then(() => {
                try { localStorage.setItem(pubKeyCacheKey, "1"); } catch { }
              }).catch(() => { });
            }
          } catch {
            // User rejected signature — non-blocking, they can still use the DApp
          }
        }
      }

      return selected;
    } finally {
      setIsConnecting(false);
    }
  }

  async function getHistory(userAddress) {
    if (!userAddress) return [];
    const contract = await getContractWithSigner();
    const result = await contract.getHistory(userAddress);
    const ids = result?.[0] || [];
    const rows = result?.[1] || [];

    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      out.push({
        id: Number(ids?.[i] ?? i),
        title: typeof r.title === "string" ? r.title : "",
        ipfsHash: r.ipfsHash,
        blockHeight: Number(r.blockHeight),
        initiator: r.initiator,
        participant: r.participant,
        isFinalized: Boolean(r.isFinalized),
        expiryTime: Number(r.expiryTime)
      });
    }
    return out.sort((a, b) => b.id - a.id);
  }

  function ensureMasterSeedForUpload() {
    if (!account) throw new Error("请先连接钱包");
    if (masterSeedHex) return masterSeedHex;
    const localSeed = loadLocalSeed(account);
    if (localSeed) {
      setMasterSeedHex(localSeed);
      return localSeed;
    }
    if (hasSeedEnvelope) {
      openRecoverSecurityModal();
      throw new Error("缺少本地 Master Seed：请先输入个人密码恢复，然后重新点击上传/提交");
    }
    openInitSecurityModal();
    throw new Error("未初始化安全中心：请先设置个人密码并生成 Master Seed");
  }

  async function encryptAndUploadWithMasterSeed(payloadObj) {
    const seedHex = ensureMasterSeedForUpload();
    const plainText = JSON.stringify(payloadObj ?? {}, null, 0);
    const fileId = createFileId();
    const key = deriveFileKey({ masterSeedHex: seedHex, fileId });
    const enc = encryptWithDerivedKey({ plainText, key });
    const cid = await uploadToPinata({
      scheme: "master-seed-v1",
      fileId,
      ivHex: enc.ivHex,
      ciphertext: enc.ciphertext
    });
    return cid;
  }

  async function submitEvidence({ title, report, location, files, file, participantAddress, expiryTime }) {
    await ensureLocalhostChain();

    const trimmedTitle = typeof title === "string" ? title.trim() : "";

    const trimmedParticipant = typeof participantAddress === "string" ? participantAddress.trim() : "";
    let participant = ethers.ZeroAddress;
    if (trimmedParticipant) {
      try {
        participant = ethers.getAddress(trimmedParticipant);
      } catch {
        throw new Error("参与方钱包地址无效");
      }
    }

    if (participant !== ethers.ZeroAddress && !trimmedTitle) {
      throw new Error("公证协议需输入标题以供识别");
    }

    const seedHex = ensureMasterSeedForUpload();

    const provider = new ethers.BrowserProvider(window.ethereum);
    const blockHeight = await provider.getBlockNumber();
    const nowSec = Math.floor(Date.now() / 1000);
    let finalExpiryTime =
      typeof expiryTime === "number" && Number.isFinite(expiryTime) && expiryTime >= 0
        ? Math.floor(expiryTime)
        : participant === ethers.ZeroAddress
          ? 0
          : nowSec + DEFAULT_NOTARY_EXPIRY_SECONDS;

    if (participant === ethers.ZeroAddress) finalExpiryTime = 0;

    const normalizedFiles = Array.isArray(files) ? files : file ? [file] : [];

    const payload = {
      report: typeof report === "string" ? report.trim() : "",
      location: location
        ? {
          mapsUrl: location?.mapsUrl || "",
          lat: typeof location?.lat === "number" ? location.lat : null,
          lng: typeof location?.lng === "number" ? location.lng : null
        }
        : null,
      files: normalizedFiles,
      blockHeight,
      expiryTime: finalExpiryTime,
      initiator: account || "",
      participant: participant === ethers.ZeroAddress ? "" : participant,
      createdAt: new Date().toISOString()
    };

    const plainPayload = JSON.stringify(payload, null, 0);
    const fileId = createFileId();
    const key = deriveFileKey({ masterSeedHex: seedHex, fileId });
    const enc = encryptWithDerivedKey({ plainText: plainPayload, key });
    const cid = await uploadToPinata({
      scheme: "master-seed-v1",
      fileId,
      ivHex: enc.ivHex,
      ciphertext: enc.ciphertext
    });

    const contract = await getContractWithSigner();
    const finalTitle = participant === ethers.ZeroAddress ? trimmedTitle || "无标题应急存证" : trimmedTitle;
    const tx = await contract.createRecord(finalTitle, cid, participant, finalExpiryTime);
    const receipt = await tx.wait();

    return { cid, txHash: receipt?.hash || tx.hash };
  }

  async function signRecord(id) {
    await ensureLocalhostChain();
    const contract = await getContractWithSigner();
    const tx = await contract.signRecord(id);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getBlockTimestamp(blockHeight) {
    if (!window.ethereum) throw new Error("未检测到钱包（请安装/启用 MetaMask）");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const block = await provider.getBlock(blockHeight);
    return Number(block?.timestamp ?? 0);
  }

  async function decryptFromCid({ cid, personalPassword }) {
    const pwd = typeof personalPassword === "string" ? personalPassword : "";
    if (!pwd) throw new Error("个人密码不能为空");

    if (!account) throw new Error("请先连接钱包");
    let envelope = loadLocalEnvelope(account);
    if (!envelope) {
      try {
        await ensureLocalhostChain();
        const contract = await getContractWithSigner();
        const text = await contract.getSeedEnvelope(account);
        if (text) {
          const parsed = JSON.parse(text);
          storeLocalEnvelope(account, parsed);
          envelope = parsed;
          setHasSeedEnvelope(true);
        }
      } catch {
      }
    }

    if (!envelope) {
      openInitSecurityModal("未检测到“种子信封”。请先设置个人密码用于解密。");
      throw new Error("未初始化安全中心：请先设置个人密码");
    }

    const seedHex = openSeedEnvelope({ personalPassword: pwd, envelope });
    storeLocalSeed(account, seedHex);
    storeSessionSeed(account, seedHex);
    setMasterSeedHex(seedHex);
    setHasSeedEnvelope(true);

    const { raw, cipherText, url } = await fetchEncryptedFromPinataGateway(cid);
    let plain = "";
    if (raw && typeof raw === "object" && typeof raw.fileId === "string" && typeof raw.ivHex === "string") {
      const key = deriveFileKey({ masterSeedHex: seedHex, fileId: raw.fileId });
      plain = decryptWithDerivedKey({ ciphertext: String(raw.ciphertext || ""), ivHex: raw.ivHex, key });
    } else {
      plain = decryptData(cipherText, pwd);
    }

    let parsed = null;
    try {
      parsed = JSON.parse(plain);
    } catch {
      parsed = null;
    }

    const normalized = parsed
      ? {
        report: typeof parsed?.report === "string" ? parsed.report : "",
        createdAt: typeof parsed?.createdAt === "string" ? parsed.createdAt : "",
        blockHeight:
          typeof parsed?.blockHeight === "number"
            ? parsed.blockHeight
            : parsed?.blockHeight != null
              ? Number(parsed.blockHeight)
              : null,
        expiryTime:
          typeof parsed?.expiryTime === "number"
            ? parsed.expiryTime
            : parsed?.expiryTime != null
              ? Number(parsed.expiryTime)
              : null,
        location: parsed?.location || null,
        files: Array.isArray(parsed?.files) ? parsed.files : parsed?.file ? [parsed.file] : [],
        raw: parsed
      }
      : { report: plain, createdAt: "", location: null, files: [], raw: plain };

    return { plain, parsed: normalized, gatewayUrl: url };
  }

  async function decryptFromCidSession({ cid }) {
    if (!account) throw new Error("请先连接钱包");
    const seedHex = masterSeedHex || loadSessionSeed(account);
    if (!seedHex) throw new Error("未解锁 Master Seed：请先在本次会话中解锁");

    const { raw, cipherText, url } = await fetchEncryptedFromPinataGateway(cid);
    if (!raw || typeof raw !== "object" || typeof raw.fileId !== "string" || typeof raw.ivHex !== "string") {
      if (cipherText) throw new Error("该附件需要个人密码解密（未启用 master-seed-v1）");
      throw new Error("密文格式不正确");
    }

    const key = deriveFileKey({ masterSeedHex: seedHex, fileId: raw.fileId });
    const plain = decryptWithDerivedKey({ ciphertext: String(raw.ciphertext || ""), ivHex: raw.ivHex, key });

    let parsed = null;
    try {
      parsed = JSON.parse(plain);
    } catch {
      parsed = null;
    }

    const normalized = parsed
      ? {
        report: typeof parsed?.report === "string" ? parsed.report : "",
        createdAt: typeof parsed?.createdAt === "string" ? parsed.createdAt : "",
        blockHeight:
          typeof parsed?.blockHeight === "number"
            ? parsed.blockHeight
            : parsed?.blockHeight != null
              ? Number(parsed.blockHeight)
              : null,
        expiryTime:
          typeof parsed?.expiryTime === "number"
            ? parsed.expiryTime
            : parsed?.expiryTime != null
              ? Number(parsed.expiryTime)
              : null,
        location: parsed?.location || null,
        files: Array.isArray(parsed?.files) ? parsed.files : parsed?.file ? [parsed.file] : [],
        raw: parsed
      }
      : { report: plain, createdAt: "", location: null, files: [], raw: plain };

    return { plain, parsed: normalized, gatewayUrl: url };
  }

  async function uploadJsonToIpfs(payload) {
    return await uploadToPinata(payload);
  }

  async function uploadFileToIpfs(file) {
    return await uploadFileToPinata(file);
  }

  async function listInstitutions() {
    const contract = await getCredentialContractWithSigner();
    const [addrs, names, actives] = await contract.listInstitutions();
    const out = [];
    for (let i = 0; i < addrs.length; i++) {
      out.push({ address: addrs[i], name: names?.[i] || "", isActive: Boolean(actives?.[i]) });
    }
    return out;
  }

  async function applyForIssuer({ metadataCID }) {
    const cid = typeof metadataCID === "string" ? metadataCID.trim() : "";
    if (!cid) throw new Error("缺少 metadataCID");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.applyForIssuer(cid);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getMyIssuerApplication() {
    const contract = await getCredentialContractWithSigner();
    const res = await contract.getMyIssuerApplication();
    const id = Number(res?.[0] || 0);
    const app = res?.[1] || {};
    return {
      id,
      applicant: app.applicant,
      metadataCID: app.metadataCID,
      createdAt: Number(app.createdAt || 0),
      status: Number(app.status || 0)
    };
  }

  async function getIssuerApplications() {
    const contract = await getCredentialContractWithSigner();
    const res = await contract.getIssuerApplications();
    const ids = res?.[0] || [];
    const rows = res?.[1] || [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      out.push({
        id: Number(ids?.[i] ?? i),
        applicant: r.applicant,
        metadataCID: r.metadataCID,
        createdAt: Number(r.createdAt || 0),
        status: Number(r.status || 0)
      });
    }
    return out.sort((a, b) => b.id - a.id);
  }

  async function approveIssuer({ applicant }) {
    const addr = typeof applicant === "string" ? applicant.trim() : "";
    if (!addr) throw new Error("缺少 applicant");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.approveIssuer(ethers.getAddress(addr));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function rejectIssuer({ applicant, reason }) {
    const addr = typeof applicant === "string" ? applicant.trim() : "";
    if (!addr) throw new Error("缺少 applicant");
    const r = typeof reason === "string" ? reason : "";
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.rejectIssuer(ethers.getAddress(addr), r);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getIssuerMintedCount(issuer) {
    const addr = typeof issuer === "string" ? issuer.trim() : "";
    if (!addr) return 0;
    const contract = await getCredentialContractWithSigner();
    const n = await contract.getIssuerMintedCount(ethers.getAddress(addr));
    return Number(n || 0);
  }

  async function getIssuerBatchStats(issuer) {
    const addr = typeof issuer === "string" ? issuer.trim() : "";
    if (!addr) return { templateCount: 0, issuedCount: 0, unclaimed: 0 };
    const contract = await getIssuerBatchWithSigner();
    const res = await contract.getIssuerStats(ethers.getAddress(addr));
    return { templateCount: Number(res?.[0] || 0), issuedCount: Number(res?.[1] || 0), unclaimed: Number(res?.[2] || 0) };
  }

  async function createIssuerTemplate({ templateId, hasPrivateAttachment, schemaCID }) {
    const id = typeof templateId === "string" ? templateId.trim() : "";
    const cid = typeof schemaCID === "string" ? schemaCID.trim() : "";
    if (!id) throw new Error("缺少 templateId");
    const contract = await getIssuerBatchWithSigner();
    const tx = await contract.createTemplate(id, Boolean(hasPrivateAttachment), cid);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getMyIssuerTemplates() {
    const contract = await getIssuerBatchWithSigner();
    const res = await contract.getMyTemplates();
    const ids = res?.[0] || [];
    const rows = res?.[1] || [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const t = rows[i];
      out.push({
        idHash: String(ids?.[i] || ""),
        issuer: t.issuer,
        templateId: t.templateId,
        hasPrivateAttachment: Boolean(t.hasPrivateAttachment),
        schemaCID: t.schemaCID,
        createdAt: Number(t.createdAt || 0),
        isActive: Boolean(t.isActive)
      });
    }
    return out;
  }

  async function deactivateIssuerTemplate({ templateId }) {
    const tid = typeof templateId === "string" ? templateId.trim() : "";
    if (!tid) throw new Error("缺少 templateId");
    const contract = await getIssuerBatchWithSigner();
    const tx = await contract.deactivateTemplate(tid);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function createBatchIssuance({ merkleRoot, templateId, distributionCID, total }) {
    const root = String(merkleRoot || "").trim();
    const tid = typeof templateId === "string" ? templateId.trim() : "";
    const dist = typeof distributionCID === "string" ? distributionCID.trim() : "";
    const n = Number(total || 0);
    if (!root) throw new Error("缺少 merkleRoot");
    if (!tid) throw new Error("缺少 templateId");
    if (!dist) throw new Error("缺少 distributionCID");
    if (!n) throw new Error("缺少 total");
    const contract = await getIssuerBatchWithSigner();
    const tx = await contract.createBatchIssuance(root, tid, dist, n, { gasLimit: 2_500_000 });
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getMyIssuerBatches() {
    const contract = await getIssuerBatchWithSigner();
    const res = await contract.getMyBatches();
    const roots = res?.[0] || [];
    const rows = res?.[1] || [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const b = rows[i];
      out.push({
        merkleRoot: String(roots?.[i] || b.merkleRoot || ""),
        templateId: b.templateId,
        issuer: b.issuer,
        distributionCID: b.distributionCID,
        total: Number(b.total || 0),
        claimed: Number(b.claimed || 0),
        createdAt: Number(b.createdAt || 0),
        isActive: Boolean(b.isActive)
      });
    }
    return out;
  }

  async function getMyBatchTokens() {
    const contract = await getIssuerBatchWithSigner();
    const res = await contract.getMyTokens();
    const ids = res?.[0] || [];
    const rows = res?.[1] || [];
    const uris = res?.[2] || [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      out.push({
        tokenId: Number(ids?.[i] ?? i),
        issuer: r.issuer,
        issuerName: r.issuerName,
        templateId: r.templateId,
        attachmentCID: r.attachmentCID || r.attachmentCid || r.privateCid || r[3] || "",
        displayed: Boolean(r.displayed),
        tokenURI: uris?.[i] || ""
      });
    }
    return out.sort((a, b) => b.tokenId - a.tokenId);
  }

  async function getAllBatchCIDs() {
    const contract = await getIssuerBatchWithSigner();
    const res = await contract.getBatchCIDs();
    return Array.isArray(res) ? res.map((x) => String(x || "")).filter(Boolean) : [];
  }

  async function hasClaimedBatchIndex({ userAddress, batchIndex }) {
    const idx = Number(batchIndex);
    if (!Number.isFinite(idx) || idx < 0) throw new Error("batchIndex 无效");
    const addr = typeof userAddress === "string" ? userAddress.trim() : "";
    if (!addr) throw new Error("缺少 userAddress");
    const contract = await getIssuerBatchWithSigner();
    return await contract.hasClaimed(ethers.getAddress(addr), idx);
  }

  async function claimIssuerBatch({ merkleRoot, tokenURI, attachmentCID, proof }) {
    const root = String(merkleRoot || "").trim();
    const uri = typeof tokenURI === "string" ? tokenURI.trim() : "";
    const cid = typeof attachmentCID === "string" ? attachmentCID.trim() : "";
    const p = Array.isArray(proof) ? proof : [];
    if (!root) throw new Error("缺少 merkleRoot");
    if (!uri) throw new Error("缺少 tokenURI");
    const contract = await getIssuerBatchWithSigner();
    const tx = await contract.claim(root, uri, cid, p, { gasLimit: 1_800_000 });
    const receipt = await tx.wait();
    let claimedTokenId = null;
    try {
      for (const log of receipt?.logs || []) {
        let parsed = null;
        try {
          parsed = contract.interface.parseLog(log);
        } catch {
          parsed = null;
        }
        if (!parsed) continue;
        if (parsed.name === "Transfer") {
          const from = String(parsed.args?.from || "").toLowerCase();
          if (from === ethers.ZeroAddress.toLowerCase()) {
            const tokenId = parsed.args?.tokenId;
            claimedTokenId = typeof tokenId === "bigint" ? Number(tokenId) : Number(tokenId);
            break;
          }
        }
        if (parsed.name === "BatchClaimed") {
          const tokenId = parsed.args?.tokenId;
          claimedTokenId = typeof tokenId === "bigint" ? Number(tokenId) : Number(tokenId);
        }
      }
    } catch {
    }
    return { txHash: receipt?.hash || tx.hash, tokenId: Number.isFinite(claimedTokenId) ? claimedTokenId : null };
  }

  async function setBatchDisplayed({ tokenId, displayed }) {
    const id = Number(tokenId);
    if (!Number.isFinite(id)) throw new Error("tokenId 无效");
    const contract = await getIssuerBatchWithSigner();
    const tx = await contract.setDisplayed(id, Boolean(displayed));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function setBatchDisplayedMany({ tokenIds, displayed }) {
    const ids = Array.isArray(tokenIds) ? tokenIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
    if (ids.length === 0) throw new Error("未选择任何 SBT");
    const contract = await getIssuerBatchWithSigner();
    const tx = await contract.setDisplayedMany(ids, Boolean(displayed));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getBatchByRoot({ merkleRoot }) {
    const root = String(merkleRoot || "").trim();
    if (!root) throw new Error("缺少 merkleRoot");
    const contract = await getIssuerBatchWithSigner();
    const b = await contract.getBatch(root);
    return {
      merkleRoot: String(b?.merkleRoot || root),
      templateId: String(b?.templateId || ""),
      issuer: String(b?.issuer || ""),
      distributionCID: String(b?.distributionCID || ""),
      total: Number(b?.total || 0),
      claimed: Number(b?.claimed || 0),
      createdAt: Number(b?.createdAt || 0),
      isActive: Boolean(b?.isActive)
    };
  }

  async function burnBatchMany({ tokenIds }) {
    const ids = Array.isArray(tokenIds) ? tokenIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
    if (ids.length === 0) throw new Error("未选择任何 SBT");
    const contract = await getIssuerBatchWithSigner();
    const tx = await contract.burnMany(ids);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getMyArchiveRefs() {
    const contract = await getArchivesRegistryWithSigner();
    const res = await contract.getMyArchiveRefs();
    const rows = res?.[1] || [];
    return rows.map((r, idx) => ({
      id: Number(res?.[0]?.[idx] ?? idx),
      user: r.user,
      cid: r.cid,
      category: r.category,
      createdAt: Number(r.createdAt || 0),
      tokenId: Number(r.tokenId || 0),
      templateId: r.templateId,
      issuer: r.issuer
    }));
  }

  async function getMyCreditScore() {
    if (!account) throw new Error("请先连接钱包");
    const contract = await getScoreRegistryWithSigner();
    const res = await contract.getScore(account);
    return { score: Number(res?.[0] || 0), updatedAt: Number(res?.[1] || 0) };
  }

  async function authorizeInstitution({ institutionAddress, institutionName }) {
    const addr = typeof institutionAddress === "string" ? institutionAddress.trim() : "";
    const name = typeof institutionName === "string" ? institutionName.trim() : "";
    if (!addr) throw new Error("机构钱包地址不能为空");
    if (!name) throw new Error("机构名称不能为空");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.authorizeInstitution(ethers.getAddress(addr), name);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function revokeInstitution({ institutionAddress }) {
    const addr = typeof institutionAddress === "string" ? institutionAddress.trim() : "";
    if (!addr) throw new Error("机构钱包地址不能为空");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.revokeInstitution(ethers.getAddress(addr));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function blockIssuer({ issuerAddress }) {
    const addr = typeof issuerAddress === "string" ? issuerAddress.trim() : "";
    if (!addr) throw new Error("缺少 issuerAddress");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.blockIssuer(ethers.getAddress(addr));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function unblockIssuer({ issuerAddress }) {
    const addr = typeof issuerAddress === "string" ? issuerAddress.trim() : "";
    if (!addr) throw new Error("缺少 issuerAddress");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.unblockIssuer(ethers.getAddress(addr));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getMyBlockedIssuers() {
    const contract = await getCredentialContractWithSigner();
    const res = await contract.getMyBlockedIssuers();
    return Array.isArray(res) ? res.map((x) => String(x || "")).filter(Boolean) : [];
  }

  async function isBlocked({ studentAddress, issuerAddress }) {
    const student = typeof studentAddress === "string" ? studentAddress.trim() : "";
    const issuer = typeof issuerAddress === "string" ? issuerAddress.trim() : "";
    if (!student) throw new Error("缺少 studentAddress");
    if (!issuer) throw new Error("缺少 issuerAddress");
    const contract = await getCredentialContractWithSigner();
    return await contract.isBlocked(ethers.getAddress(student), ethers.getAddress(issuer));
  }

  async function isInstitution(address) {
    const contract = await getCredentialContractWithSigner();
    return await contract.isInstitution(address);
  }

  function encryptArchiveField({ seedHex, plainText }) {
    const fileId = createFileId();
    const key = deriveFileKey({ masterSeedHex: String(seedHex || ""), fileId });
    const enc = encryptWithDerivedKey({ plainText: String(plainText || ""), key });
    return JSON.stringify({ scheme: "archive-field-v1", fileId, ivHex: enc.ivHex, ciphertext: enc.ciphertext });
  }

  async function addFileRecord({ cid, nameEnc, categoryEnc, mime, size, createdAt, folderId }) {
    const contract = await getContractWithSigner();
    const c = typeof cid === "string" ? cid.trim() : "";
    if (!c) throw new Error("缺少 CID");
    let tx;
    if (folderId != null) {
      tx = await contract.addFileRecordV2(
        c,
        String(nameEnc || ""),
        String(categoryEnc || ""),
        String(mime || ""),
        Number(size || 0),
        Number(createdAt || 0),
        Number(folderId || 0)
      );
    } else {
      tx = await contract.addFileRecord(
        c,
        String(nameEnc || ""),
        String(categoryEnc || ""),
        String(mime || ""),
        Number(size || 0),
        Number(createdAt || 0)
      );
    }
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function addCategory({ name }) {
    const n = typeof name === "string" ? name.trim() : "";
    if (!n) throw new Error("分类名不能为空");
    const contract = await getContractWithSigner();
    const tx = await contract.addCategory(n);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getUserCategories() {
    const contract = await getContractWithSigner();
    const list = await contract.getUserCategories();
    const out = Array.isArray(list) ? list.map((x) => String(x || "").trim()).filter(Boolean) : [];
    return out;
  }

  async function getMyFolders() {
    const contract = await getContractWithSigner();
    try {
      const res = await contract.getMyFolders();
      const folderIds = res?.[0] || [];
      const names = res?.[1] || [];
      const out = [];
      const len = Math.min(folderIds.length, names.length);
      for (let i = 0; i < len; i++) {
        out.push({ folderId: Number(folderIds[i]), name: String(names[i] || "").trim() });
      }
      return out.filter((x) => x.folderId > 0 && x.name);
    } catch {
      const names = await getUserCategories();
      return (names || []).map((n, i) => ({ folderId: i + 1, name: n })).filter((x) => x.name);
    }
  }

  async function deleteFolder({ folderId }) {
    const id = Number(folderId || 0);
    if (!id) throw new Error("缺少 folderId");
    const contract = await getContractWithSigner();
    const tx = await contract.deleteFolder(id);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function archiveFileToCategory({ categoryName, name, type, size, dataUrl, folderId }) {
    if (!account) throw new Error("请先连接钱包");
    const catName = typeof categoryName === "string" ? categoryName.trim() : "";
    if (!catName) throw new Error("缺少分类");
    const fileName = typeof name === "string" && name.trim() ? name.trim() : "archive";
    const mime = typeof type === "string" ? type : "";
    const fileSize = Number(size || 0);
    const url = typeof dataUrl === "string" ? dataUrl : "";
    if (!url) throw new Error("缺少 dataUrl");

    const seedHex = masterSeedHex || loadSessionSeed(account);
    if (!seedHex) throw new Error("未解锁 Master Seed：请先输入个人密码");

    const payload = {
      kind: "archive-file-v1",
      name: fileName,
      type: mime,
      size: fileSize,
      dataUrl: url,
      createdAt: new Date().toISOString(),
      category: catName
    };

    const cid = await encryptAndUploadWithMasterSeed(payload);
    const nameEnc = encryptArchiveField({ seedHex, plainText: fileName });
    const categoryEnc = encryptArchiveField({ seedHex, plainText: catName });
    const createdAt = Math.floor(Date.now() / 1000);
    const tx = await addFileRecord({ cid, nameEnc, categoryEnc, mime, size: fileSize, createdAt, folderId });
    return { cid, txHash: tx?.txHash || "" };
  }

  async function getMyFiles() {
    const contract = await getContractWithSigner();
    let ids = [];
    let rows = [];
    let folderIds = [];
    try {
      const result = await contract.getMyFilesV2();
      ids = result?.[0] || [];
      rows = result?.[1] || [];
      folderIds = result?.[2] || [];
    } catch {
      const result = await contract.getMyFiles();
      ids = result?.[0] || [];
      rows = result?.[1] || [];
      folderIds = [];
    }
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      out.push({
        id: Number(ids?.[i] ?? i),
        cid: r.cid,
        nameEnc: r.nameEnc,
        categoryEnc: r.categoryEnc,
        mime: r.mime,
        size: Number(r.size),
        createdAt: Number(r.createdAt),
        folderId: folderIds?.[i] != null ? Number(folderIds[i]) : 0
      });
    }
    return out.sort((a, b) => b.id - a.id);
  }

  async function moveFiles({ fileIds, targetFolderId }) {
    const ids = Array.isArray(fileIds) ? fileIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
    if (ids.length === 0) throw new Error("未选择任何文件");
    const folderId = Number(targetFolderId || 0);
    const contract = await getContractWithSigner();
    const tx = await contract.moveFiles(ids, folderId);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function deleteFiles({ fileIds }) {
    const ids = Array.isArray(fileIds) ? fileIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
    if (ids.length === 0) throw new Error("未选择任何文件");
    const contract = await getContractWithSigner();
    const tx = await contract.deleteFiles(ids);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function issueOffer({ studentAddress, title, category, publicImageCid, attachmentCid }) {
    const student = typeof studentAddress === "string" ? studentAddress.trim() : "";
    const t = typeof title === "string" ? title.trim() : "";
    if (!student) throw new Error("学生地址不能为空");
    if (!t) throw new Error("凭证标题不能为空");
    if (!publicImageCid) throw new Error("缺少勋章图片 CID");
    if (!attachmentCid) throw new Error("缺少附件 CID");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.issueOffer(ethers.getAddress(student), t, Number(category) || 0, publicImageCid, attachmentCid);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getOffersFor(address) {
    const contract = await getCredentialContractWithSigner();
    const result = await contract.getOffersFor(address);
    const ids = result?.[0] || [];
    const rows = result?.[1] || [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      out.push({
        id: Number(ids?.[i] ?? i),
        issuer: r.issuer,
        student: r.student,
        issuerName: r.issuerName,
        title: r.title,
        category: Number(r.category),
        publicImageCid: r.publicImageCid,
        attachmentCid: r.attachmentCid,
        createdAt: Number(r.createdAt),
        status: Number(r.status)
      });
    }
    return out.sort((a, b) => b.id - a.id);
  }

  async function getOffer({ offerId }) {
    const id = Number(offerId);
    if (!Number.isFinite(id) || id < 0) throw new Error("offerId 无效");
    const contract = await getCredentialContractWithSigner();
    const r = await contract.getOffer(id);
    return {
      id,
      issuer: r.issuer,
      student: r.student,
      issuerName: r.issuerName,
      title: r.title,
      category: Number(r.category),
      publicImageCid: r.publicImageCid,
      attachmentCid: r.attachmentCid,
      createdAt: Number(r.createdAt),
      status: Number(r.status)
    };
  }

  async function acceptOffer({ offerId, privateCid, displayed }) {
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.acceptOffer(Number(offerId), privateCid, Boolean(displayed));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function rejectOffer({ offerId, shouldBlock }) {
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.rejectOffer(Number(offerId), Boolean(shouldBlock));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function submitClaim({ institutionAddress, title, category, reviewCid, privateCid }) {
    const inst = typeof institutionAddress === "string" ? institutionAddress.trim() : "";
    const t = typeof title === "string" ? title.trim() : "";
    if (!inst) throw new Error("机构地址不能为空");
    if (!t) throw new Error("凭证标题不能为空");
    if (!reviewCid) throw new Error("缺少审核 CID");
    if (!privateCid) throw new Error("缺少私密 CID");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.submitClaim(ethers.getAddress(inst), t, Number(category) || 0, reviewCid, privateCid);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getMyClaims() {
    const contract = await getCredentialContractWithSigner();
    const result = await contract.getMyClaims();
    const ids = result?.[0] || [];
    const rows = result?.[1] || [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      out.push({
        id: Number(ids?.[i] ?? i),
        institution: r.institution,
        student: r.student,
        institutionName: r.institutionName,
        title: r.title,
        category: Number(r.category),
        reviewCid: r.reviewCid,
        privateCid: r.privateCid,
        createdAt: Number(r.createdAt),
        decidedAt: Number(r.decidedAt),
        tokenId: Number(r.tokenId),
        status: Number(r.status),
        rejectReason: r.rejectReason
      });
    }
    return out.sort((a, b) => b.id - a.id);
  }

  async function getPendingClaims() {
    const contract = await getCredentialContractWithSigner();
    const result = await contract.getPendingClaims();
    const ids = result?.[0] || [];
    const rows = result?.[1] || [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      out.push({
        id: Number(ids?.[i] ?? i),
        institution: r.institution,
        student: r.student,
        institutionName: r.institutionName,
        title: r.title,
        category: Number(r.category),
        reviewCid: r.reviewCid,
        privateCid: r.privateCid,
        createdAt: Number(r.createdAt),
        decidedAt: Number(r.decidedAt),
        tokenId: Number(r.tokenId),
        status: Number(r.status),
        rejectReason: r.rejectReason
      });
    }
    return out.sort((a, b) => b.id - a.id);
  }

  async function rejectClaim({ claimId, reason }) {
    const r = typeof reason === "string" ? reason.trim() : "";
    if (!r) throw new Error("驳回理由不能为空");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.rejectClaim(Number(claimId), r);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function approveClaimAndMint({ claimId, publicImageCid, displayed }) {
    if (!publicImageCid) throw new Error("缺少勋章图片 CID");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.approveClaimAndMint(Number(claimId), publicImageCid, Boolean(displayed));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function setDisplayed({ tokenId, displayed }) {
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.setDisplayed(Number(tokenId), Boolean(displayed));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function setDisplayedMany({ tokenIds, displayed }) {
    const ids = Array.isArray(tokenIds) ? tokenIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
    if (ids.length === 0) throw new Error("未选择任何 SBT");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.setDisplayedMany(ids, Boolean(displayed));
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function burnMany({ tokenIds }) {
    const ids = Array.isArray(tokenIds) ? tokenIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
    if (ids.length === 0) throw new Error("未选择任何 SBT");
    const contract = await getCredentialContractWithSigner();
    const tx = await contract.burnMany(ids);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }

  async function getMyTokens() {
    const contract = await getCredentialContractWithSigner();
    const result = await contract.getMyTokens();
    const ids = result?.[0] || [];
    const rows = result?.[1] || [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      out.push({
        tokenId: Number(ids?.[i] ?? i),
        offerId: Number(r.offerId),
        issuer: r.issuer,
        issuerName: r.issuerName,
        title: r.title,
        category: Number(r.category),
        publicImageCid: r.publicImageCid,
        privateCid: r.privateCid,
        displayed: Boolean(r.displayed)
      });
    }
    return out.sort((a, b) => b.tokenId - a.tokenId);
  }

  async function getTokensOf(address) {
    const contract = await getCredentialContractWithSigner();
    const result = await contract.getTokensOf(address);
    const ids = result?.[0] || [];
    const rows = result?.[1] || [];
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      out.push({
        tokenId: Number(ids?.[i] ?? i),
        offerId: Number(r.offerId),
        issuer: r.issuer,
        issuerName: r.issuerName,
        title: r.title,
        category: Number(r.category),
        publicImageCid: r.publicImageCid,
        privateCid: r.privateCid,
        displayed: Boolean(r.displayed)
      });
    }
    return out.sort((a, b) => b.tokenId - a.tokenId);
  }

  const value = useMemo(
    () => ({
      account,
      chainId,
      contractAddress,
      credentialContractAddress,
      issuerBatchAddress,
      archivesRegistryAddress,
      scoreRegistryAddress,
      isConnecting,
      masterSeedHex: !!masterSeedHex,
      hasSeedEnvelope,
      securityModal,
      closeSecurityModal,
      initSecurityCenter,
      recoverMasterSeed,
      unlockMasterSeed,
      unlockMasterSeedSession,
      rewrapSeedEnvelope,
      setSeedEnvelopeText,
      connectWallet,
      ensureLocalhostChain,
      getHistory,
      submitEvidence,
      signRecord,
      getBlockTimestamp,
      decryptFromCid,
      decryptFromCidSession,
      encryptAndUploadWithMasterSeed,
      uploadJsonToIpfs,
      uploadFileToIpfs,
      listInstitutions,
      authorizeInstitution,
      revokeInstitution,
      isInstitution,
      blockIssuer,
      unblockIssuer,
      getMyBlockedIssuers,
      isBlocked,
      applyForIssuer,
      getMyIssuerApplication,
      getIssuerApplications,
      approveIssuer,
      rejectIssuer,
      getIssuerMintedCount,
      getIssuerBatchStats,
      createIssuerTemplate,
      getMyIssuerTemplates,
      deactivateIssuerTemplate,
      createBatchIssuance,
      getMyIssuerBatches,
      getMyBatchTokens,
      getAllBatchCIDs,
      hasClaimedBatchIndex,
      claimIssuerBatch,
      setBatchDisplayed,
      setBatchDisplayedMany,
      getBatchByRoot,
      burnBatchMany,
      getMyArchiveRefs,
      issueOffer,
      getOffersFor,
      getOffer,
      acceptOffer,
      rejectOffer,
      submitClaim,
      getMyClaims,
      getPendingClaims,
      rejectClaim,
      approveClaimAndMint,
      getMyTokens,
      getTokensOf,
      setDisplayed,
      setDisplayedMany,
      burnMany,
      getCurrentLocation,
      fileToBase64,
      addFileRecord,
      archiveFileToCategory,
      addCategory,
      getUserCategories,
      getMyFiles,
      moveFiles,
      deleteFiles,
      getMyFolders,
      deleteFolder,
      clearSessionSeed,
      getMyCreditScore,
      parseProviderError
    }),
    [
      account,
      chainId,
      contractAddress,
      credentialContractAddress,
      issuerBatchAddress,
      archivesRegistryAddress,
      scoreRegistryAddress,
      hasSeedEnvelope,
      isConnecting,
      masterSeedHex,
      securityModal
    ]
  );

  return createElement(TrustProtocolContext.Provider, { value }, children);
}

export function useTrustProtocol() {
  const ctx = useContext(TrustProtocolContext);
  if (!ctx) {
    throw new Error("useTrustProtocol 必须在 <TrustProtocolProvider> 内使用");
  }
  return ctx;
}
