/**
 * useAuthWithPublicKey.js
 * ========================
 * React 自定义 Hook：利用 Ethers.js v6 的 **签名恢复法（Signature Recovery）** 提取
 * 用户的未压缩以太坊公钥（Uncompressed Public Key）。
 *
 * 完整流程：
 *   1. 连接 MetaMask → 获取 signer + address
 *   2. 构造一段友好的纯文本防重放登录消息（含 Nonce / 时间戳）
 *   3. 调用 signer.signMessage() → 获取 EIP-191 签名
 *   4. ethers.hashMessage(原文) → 获取 EIP-191 哈希摘要
 *   5. ethers.SigningKey.recoverPublicKey(digest, signature) → 未压缩公钥
 *   6. 将 [walletAddress, publicKey] 上报后端 API
 *
 * 公钥格式说明（Debug 参考）：
 *   - 未压缩公钥以 0x04 开头
 *   - 总长度 = 132 个十六进制字符（含 0x 前缀）：0x04 + 64字节X + 64字节Y
 *   - 示例：0x04bfcab1c1a...（共 132 位）
 *
 * ⚠️ 注意事项：
 *   - 本 Hook 严格使用 Ethers.js **v6** 顶级导出 API（无 ethers.utils 命名空间）
 *   - 绝对不使用 eth_getEncryptionPublicKey（兼容性差、MetaMask 已计划弃用）
 */

import { useState, useCallback } from "react";
import { ethers } from "ethers";

// -------------------------------------------------------------------
//  后端 API 端点（根据你的实际后端地址修改）
// -------------------------------------------------------------------
const REGISTER_KEY_ENDPOINT = "/api/connect/register-key";

// -------------------------------------------------------------------
//  生成一个安全的随机 Nonce（防重放攻击）
// -------------------------------------------------------------------
function generateNonce() {
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    const hex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${Date.now()}-${hex}`;
}

// -------------------------------------------------------------------
//  构造对用户友好的签名消息（EIP-191 纯文本，含 Nonce）
// -------------------------------------------------------------------
function buildSignMessage(nonce) {
    return (
        "Welcome to TrustArchive!\n" +
        "Please sign this message to verify your identity.\n" +
        "This will NOT cost any gas.\n\n" +
        `Nonce: ${nonce}`
    );
}

// -------------------------------------------------------------------
//  核心魔法：从签名中恢复未压缩公钥
//  使用 Ethers.js v6 原生 API：
//    - ethers.hashMessage(message) → EIP-191 摘要
//    - ethers.SigningKey.recoverPublicKey(digest, signature) → 未压缩公钥
// -------------------------------------------------------------------

/**
 * 通过签名恢复提取未压缩公钥。
 *
 * @param {string} message  - 签名前的原始纯文本消息
 * @param {string} signature - signer.signMessage 返回的 EIP-191 签名（hex）
 * @returns {string} 以 0x04 开头的 132 字符未压缩公钥
 */
function recoverUncompressedPublicKey(message, signature) {
    // Step 1: 对消息执行以太坊标准哈希处理（\x19Ethereum Signed Message:\n + length + message）
    const digest = ethers.hashMessage(message);

    // Step 2: 使用 Ethers.js v6 的 SigningKey.recoverPublicKey 恢复未压缩公钥
    // 注意：v6 中此方法是静态方法，直接在 SigningKey 类上调用
    const uncompressedPubKey = ethers.SigningKey.recoverPublicKey(digest, signature);

    // 校验：未压缩公钥应以 0x04 开头，总长 132 位
    if (
        !uncompressedPubKey ||
        !uncompressedPubKey.startsWith("0x04") ||
        uncompressedPubKey.length !== 132
    ) {
        throw new Error(
            `Recovered public key has unexpected format: ${uncompressedPubKey?.slice(0, 20)}... (length=${uncompressedPubKey?.length})`
        );
    }

    return uncompressedPubKey;
}

// -------------------------------------------------------------------
//  将 [walletAddress, publicKey] 上报后端
// -------------------------------------------------------------------
async function reportKeyToBackend({ walletAddress, publicKey }) {
    const url = REGISTER_KEY_ENDPOINT;
    const body = JSON.stringify({ walletAddress, publicKey });

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Backend register-key failed (${res.status}): ${text}`);
    }

    return await res.json().catch(() => ({ ok: true }));
}

// ===================================================================
//  React Hook：useAuthWithPublicKey
// ===================================================================

/**
 * 连接钱包 → 签名 → 提取公钥 → 上报后端 的完整闭环 Hook。
 *
 * @param {{ skipBackendReport?: boolean }} options
 *   skipBackendReport  - 如果为 true，则跳过后端上报步骤（仅本地提取公钥）
 *
 * @returns {{
 *   connectAndExtractKey: () => Promise<{ address: string, publicKey: string }>,
 *   address: string,
 *   publicKey: string,
 *   isLoading: boolean,
 *   error: string
 * }}
 */
export function useAuthWithPublicKey({ skipBackendReport = false } = {}) {
    const [address, setAddress] = useState("");
    const [publicKey, setPublicKey] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const connectAndExtractKey = useCallback(async () => {
        setError("");
        setIsLoading(true);
        try {
            // ── Step 1: 检测钱包并连接 ──
            if (!window.ethereum) {
                throw new Error("未检测到钱包扩展（请安装 MetaMask）");
            }

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const userAddress = await signer.getAddress();
            setAddress(userAddress);

            // ── Step 2: 构造防重放签名消息 ──
            const nonce = generateNonce();
            const message = buildSignMessage(nonce);

            // ── Step 3: 请求用户签名 (EIP-191) ──
            let signature;
            try {
                signature = await signer.signMessage(message);
            } catch (signErr) {
                // 用户点击了 MetaMask 的"拒绝"按钮
                const code = signErr?.code || "";
                const msg = signErr?.message || String(signErr);
                if (code === "ACTION_REJECTED" || code === 4001 || msg.includes("user rejected")) {
                    throw new Error("User rejected the signature request.");
                }
                throw signErr;
            }

            // ── Step 4: 签名恢复 → 提取未压缩公钥 ──
            const uncompressedPubKey = recoverUncompressedPublicKey(message, signature);
            setPublicKey(uncompressedPubKey);

            // ── Step 5: 验证恢复的公钥确实属于该地址 ──
            //  从公钥推导地址，与 signer 地址比对（防篡改）
            const derivedAddress = ethers.computeAddress(uncompressedPubKey);
            if (derivedAddress.toLowerCase() !== userAddress.toLowerCase()) {
                throw new Error(
                    `Public key verification failed: derived ${derivedAddress} ≠ signer ${userAddress}`
                );
            }

            // ── Step 6: 上报后端（可选） ──
            if (!skipBackendReport) {
                try {
                    await reportKeyToBackend({
                        walletAddress: userAddress,
                        publicKey: uncompressedPubKey
                    });
                } catch (backendErr) {
                    // 后端上报失败不阻塞前端流程，仅记录警告
                    console.warn("[useAuthWithPublicKey] Backend report failed:", backendErr.message);
                }
            }

            return { address: userAddress, publicKey: uncompressedPubKey };
        } catch (err) {
            const message = err?.shortMessage || err?.message || String(err);
            setError(message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [skipBackendReport]);

    return {
        /** 触发完整流程：连接钱包 → 签名 → 提取公钥 → 上报 */
        connectAndExtractKey,
        /** 当前已连接的钱包地址 */
        address,
        /** 提取到的未压缩公钥（0x04 开头, 132 字符） */
        publicKey,
        /** 是否正在处理中（Loading 状态） */
        isLoading,
        /** 错误信息 */
        error
    };
}

/**
 * 独立服务函数（非 Hook 版本）：适用于不在 React 组件中的场景。
 *
 * @param {{ skipBackendReport?: boolean }} options
 * @returns {Promise<{ address: string, publicKey: string }>}
 */
export async function connectAndExtractPublicKey({ skipBackendReport = false } = {}) {
    if (!window.ethereum) {
        throw new Error("未检测到钱包扩展（请安装 MetaMask）");
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();

    const nonce = generateNonce();
    const message = buildSignMessage(nonce);

    let signature;
    try {
        signature = await signer.signMessage(message);
    } catch (signErr) {
        const code = signErr?.code || "";
        const msg = signErr?.message || String(signErr);
        if (code === "ACTION_REJECTED" || code === 4001 || msg.includes("user rejected")) {
            throw new Error("User rejected the signature request.");
        }
        throw signErr;
    }

    const uncompressedPubKey = recoverUncompressedPublicKey(message, signature);

    // Verify the recovered key matches the signer address
    const derivedAddress = ethers.computeAddress(uncompressedPubKey);
    if (derivedAddress.toLowerCase() !== userAddress.toLowerCase()) {
        throw new Error(
            `Public key verification failed: derived ${derivedAddress} ≠ signer ${userAddress}`
        );
    }

    if (!skipBackendReport) {
        try {
            await reportKeyToBackend({
                walletAddress: userAddress,
                publicKey: uncompressedPubKey
            });
        } catch (backendErr) {
            console.warn("[connectAndExtractPublicKey] Backend report failed:", backendErr.message);
        }
    }

    return { address: userAddress, publicKey: uncompressedPubKey };
}

/*
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  📌 公钥格式说明（Debug 参考）                                ║
 * ╠═══════════════════════════════════════════════════════════════╣
 * ║                                                               ║
 * ║  类型:    未压缩椭圆曲线公钥（secp256k1）                      ║
 * ║  前缀:    0x04                                                ║
 * ║  总长度:  132 个十六进制字符（含 "0x" 前缀）                    ║
 * ║  结构:    0x04 + X坐标(64字节/128字符) + Y坐标(64字节/128字符)  ║
 * ║                                                               ║
 * ║  示例:                                                        ║
 * ║  0x04bfcab1c1a27a205bc4e3f87b34e2c9f3e1c2d3e4f5a6b7c8d9e0f1   ║
 * ║    a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8   ║
 * ║    d9e0f1（共 130 位 hex + "0x" = 132 字符）                   ║
 * ║                                                               ║
 * ║  验证公钥是否正确:                                             ║
 * ║    ethers.computeAddress(publicKey) === walletAddress          ║
 * ║                                                               ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
