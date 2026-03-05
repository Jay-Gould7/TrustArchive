/**
 * cryptoEnvelope.js
 * -----------------
 * Hybrid Encryption (Digital Envelope) + Salted Merkle Tree utilities
 * for privacy-preserving batch SBT issuance.
 *
 * Dependencies: ethers (v6) + eth-crypto only.
 * NO CommonJS packages (keccak256, merkletreejs, buffer) — all replaced
 * with pure ethers.js to avoid Vite ESM/CJS compatibility issues.
 */

import EthCrypto from "eth-crypto";
import { ethers } from "ethers";

// ============================================================
//  Helpers — hex / base64 conversions (no Buffer needed)
// ============================================================

/** Convert ArrayBuffer or Uint8Array to hex string (no 0x prefix) */
function toHex(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Convert ArrayBuffer or Uint8Array to base64 string */
function toBase64(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

/** Convert base64 string to Uint8Array */
function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/** Convert hex string (with or without 0x) to Uint8Array */
function fromHex(hex) {
    const h = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.substr(i * 2, 2), 16);
    return bytes;
}

// ============================================================
//  Phase 1 — Symmetric Encryption (AES-256-GCM via Web Crypto)
// ============================================================

/**
 * Generate a random AES-256-GCM key and a 12-byte IV.
 * @returns {Promise<{ rawKey: ArrayBuffer, iv: Uint8Array }>}
 */
export async function generateAES256GCMKey() {
    const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const rawKey = await crypto.subtle.exportKey("raw", key);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return { rawKey, iv };
}

/**
 * Encrypt a file with AES-256-GCM. Returns Base64-encoded ciphertext.
 * @param {{ data: ArrayBuffer | Uint8Array | string, rawKey: ArrayBuffer, iv: Uint8Array }} opts
 * @returns {Promise<string>}
 */
export async function encryptFileAESGCM({ data, rawKey, iv }) {
    let bytes;
    if (typeof data === "string") {
        bytes = fromBase64(data);
    } else if (data instanceof Uint8Array) {
        bytes = data;
    } else {
        bytes = new Uint8Array(data);
    }

    const importedKey = await crypto.subtle.importKey(
        "raw", rawKey, { name: "AES-GCM" }, false, ["encrypt"]
    );

    const ciphertextBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, importedKey, bytes
    );

    return toBase64(ciphertextBuf);
}

// ============================================================
//  Phase 1 — Asymmetric Key Wrapping (ECIES via eth-crypto)
// ============================================================

/**
 * Encrypt the AES key for a single recipient using ECIES.
 * @param {{ recipientPublicKey: string, rawKey: ArrayBuffer }} opts
 * @returns {Promise<string>}  Stringified ECIES ciphertext
 */
export async function encryptAESKeyWithECIES({ recipientPublicKey, rawKey }) {
    const keyHex = toHex(rawKey);
    // eth-crypto expects public key WITHOUT the 0x04 prefix
    let pubKey = String(recipientPublicKey || "");
    if (pubKey.startsWith("0x04")) {
        pubKey = pubKey.slice(4);
    } else if (pubKey.startsWith("0x")) {
        pubKey = pubKey.slice(2);
    }

    const encrypted = await EthCrypto.encryptWithPublicKey(pubKey, keyHex);
    return EthCrypto.cipher.stringify(encrypted);
}

// ============================================================
//  Phase 2 — Salted Merkle Tree (pure ethers.js, no CJS deps)
// ============================================================

/**
 * Generate a cryptographically secure random 32-byte salt.
 * @returns {string} Hex-encoded salt (no 0x prefix)
 */
export function generateSalt() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return toHex(bytes);
}

/**
 * Build a single Merkle leaf matching the smart contract's claim() verification:
 *   leaf = keccak256(abi.encodePacked(address, tokenURI, attachmentCID))
 *
 * MUST match Solidity: bytes32 leaf = keccak256(abi.encodePacked(msg.sender, tokenURI_, attachmentCID));
 *
 * @param {{ recipientAddress: string, tokenURI: string, attachmentCID: string }} opts
 * @returns {string} bytes32 hex leaf
 */
export function buildMerkleLeaf({ recipientAddress, tokenURI, attachmentCID }) {
    const packed = ethers.solidityPacked(
        ["address", "string", "string"],
        [recipientAddress, tokenURI, attachmentCID || ""]
    );
    return ethers.keccak256(packed);
}

/**
 * Build a sorted Merkle tree from hex leaf strings using ethers.keccak256.
 * @param {string[]} leaves  Array of bytes32 hex strings
 * @returns {{ root: string, proofs: string[][] }}
 */
export function buildSortedMerkleTree(leaves) {
    if (!leaves.length) {
        return { root: ethers.ZeroHash, proofs: [] };
    }

    // Internal helper: hash two sibling nodes (sorted for deterministic tree)
    function hashPair(a, b) {
        const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
        return ethers.keccak256(ethers.concat([lo, hi]));
    }

    // Build tree layers bottom-up
    const layers = [leaves.map((l) => l.toLowerCase())];

    while (layers[layers.length - 1].length > 1) {
        const current = layers[layers.length - 1];
        const next = [];
        for (let i = 0; i < current.length; i += 2) {
            if (i + 1 < current.length) {
                next.push(hashPair(current[i], current[i + 1]));
            } else {
                next.push(current[i]); // odd node promoted
            }
        }
        layers.push(next);
    }

    const root = layers[layers.length - 1][0];

    // Generate proofs for each leaf
    const proofs = leaves.map((_, leafIdx) => {
        const proof = [];
        let idx = leafIdx;
        for (let level = 0; level < layers.length - 1; level++) {
            const layer = layers[level];
            const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
            if (siblingIdx < layer.length) {
                proof.push(layer[siblingIdx]);
            }
            idx = Math.floor(idx / 2);
        }
        return proof;
    });

    return { root, proofs };
}

// ============================================================
//  Phase 3 — Orchestrator: batchIssueEncryptedSBTs
// ============================================================

/**
 * Main orchestrator for privacy-preserving batch SBT issuance.
 */
export async function batchIssueEncryptedSBTs({
    fileBuffer,
    recipients,
    templateId,
    templateSchema,
    issuerName,
    issuerAddress,
    coverImageUrl,
    templateCategory,
    csvRows,
    schemaFields,
    uploadJsonToIpfs,
    createBatchIssuance,
    onProgress
}) {
    const progress = typeof onProgress === "function" ? onProgress : () => { };

    if (!recipients || !recipients.length) {
        throw new Error("Recipients array is empty");
    }

    // ---- Phase 1a: Generate AES-256-GCM key & IV ----
    progress("Generating AES-256-GCM symmetric key...");
    const { rawKey, iv } = await generateAES256GCMKey();

    // ---- Phase 1b: Encrypt the attachment file ----
    let encryptedFileCiphertext = "";
    const ivBase64 = toBase64(iv);

    if (fileBuffer) {
        progress("Encrypting attachment file with AES-256-GCM...");
        encryptedFileCiphertext = await encryptFileAESGCM({ data: fileBuffer, rawKey, iv });
    }

    // ---- Phase 1c: Per-recipient ECIES key wrapping ----
    progress("Encrypting AES key for each recipient (ECIES)...");
    const recipientEntries = [];

    for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        const userAddress = ethers.getAddress(r.address);
        progress(`Encrypting key for recipient ${i + 1}/${recipients.length}...`);

        try {
            const encryptedAESKey = await encryptAESKeyWithECIES({
                recipientPublicKey: r.publicKey,
                rawKey
            });

            const salt = generateSalt();

            // Build metadata attributes from CSV row
            const row = csvRows[i] || {};
            const fields = {};
            for (const f of schemaFields) {
                const key = String(f?.key || "").trim();
                if (!key) continue;
                const val = String(row[key] ?? "").trim();
                if (f?.required && !val) {
                    throw new Error(`Row ${i + 1} is missing required field: ${key}`);
                }
                fields[key] = val;
            }
            const attributes = Object.entries(fields).map(([k, v]) => ({
                trait_type: k,
                value: v
            }));

            const meta = {
                "@context": "https://schema.org",
                "@type": "TrustArchiveCredential",
                name: String(templateSchema?.name || templateId || "Credential"),
                category: String(templateSchema?.category || templateCategory || ""),
                issuerName: issuerName || "Approved Issuer",
                issuerAddress,
                image: String(templateSchema?.image || coverImageUrl || ""),
                attributes
            };

            progress(`Uploading metadata for recipient ${i + 1}/${recipients.length}...`);
            const tokenMetaCID = await uploadJsonToIpfs(meta);
            const tokenURI = tokenMetaCID.startsWith("ipfs://")
                ? tokenMetaCID
                : `ipfs://${tokenMetaCID}`;

            recipientEntries.push({
                address: userAddress,
                encryptedAESKey,
                salt,
                tokenURI,
                attributes
            });
        } catch (err) {
            throw new Error(
                `Failed to process recipient ${i + 1} (${r.address}): ${err.message}`
            );
        }
    }

    // ---- Phase 2b: Build Merkle Tree (leaves MUST match contract's claim verification) ----
    progress("Building Merkle Tree...");
    const leaves = recipientEntries.map((e) =>
        buildMerkleLeaf({
            recipientAddress: e.address,
            tokenURI: e.tokenURI,
            attachmentCID: ""
        })
    );

    const { root: merkleRoot, proofs } = buildSortedMerkleTree(leaves);

    const entriesWithProof = recipientEntries.map((e, i) => ({
        ...e,
        proof: proofs[i]
    }));

    // ---- Phase 3a: Construct IPFS payload ----
    // IMPORTANT: The `entries` array is required by CredentialCenter.discoverBatchClaims()
    // to let recipients discover their pending SBTs and claim them on-chain.
    // Each entry must contain: address, tokenURI, attachmentCID, proof (matching the contract).
    progress("Constructing IPFS payload...");
    const ipfsPayload = {
        kind: "encrypted-batch-distribution-v2",
        version: 2,
        issuer: issuerAddress,
        templateId,
        templateCategory,
        coverImageUrl,
        merkleRoot,
        total: entriesWithProof.length,
        createdAt: new Date().toISOString(),
        encryption: {
            algorithm: "AES-256-GCM",
            ivBase64,
            keyWrapping: "ECIES-secp256k1"
        },
        encryptedFile: encryptedFileCiphertext || null,
        // entries: required for claim discovery + on-chain claim verification
        entries: entriesWithProof.map((e) => ({
            address: e.address,
            tokenURI: e.tokenURI,
            attachmentCID: "",
            proof: e.proof,
            encryptedAESKey: e.encryptedAESKey,
            salt: e.salt
        }))
    };

    // ---- Phase 3b: Upload to IPFS ----
    progress("Uploading encrypted payload to IPFS...");
    const distributionCID = await uploadJsonToIpfs(ipfsPayload);

    // ---- Phase 3c: On-chain anchor ----
    progress("Waiting for wallet confirmation...");
    await createBatchIssuance({
        merkleRoot,
        templateId,
        distributionCID,
        total: entriesWithProof.length
    });

    progress("Transaction confirmed.");

    return {
        merkleRoot,
        distributionCID,
        total: entriesWithProof.length,
        entries: entriesWithProof
    };
}
