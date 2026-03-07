# TrustArchive (MVP)
A privacy-first decentralized personal data and credential protocol.

![License](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-Prototype-orange)
![Tech](https://img.shields.io/badge/Stack-Web3%20%7C%20Security-purple)

TrustArchive is a decentralized trust archiving system designed to record and verify on-chain digital reputation.  
It enables users to securely store sensitive data, generate verifiable evidence, and selectively disclose information without exposing the original files.

By preserving user privacy and data ownership, TrustArchive aims to build a highly trustworthy digital archiving and notarization ecosystem for the Web3 era.

---

## Key Capabilities (High Level)

- End-to-end encrypted storage (envelope encryption)
- Hybrid encryption batch issuance (AES-256-GCM + ECIES Digital Envelope)
- Public key registry via signature recovery (EIP-191)
- Verifiable evidence and secure proof sharing
- Personal on-chain archive registry (ArchivesRegistry)
- SBT-based credential verification (Merkle proof claim)
- Trust scoring system (on-chain + off-chain signals)
- Time-limited access tokens (5-minute validity)
- Zero raw data exposure
- Institution-user verification workflow (TrustConnect)

---

## Architecture Overview

User → Encrypt → IPFS / Storage  
→ Metadata → Blockchain  
→ Selective Disclosure → Verifier  

**Core Principle**

> Store encrypted, verify without revealing.

---

## Module Overview

### 1. Secure Evidence Storage

- Client-side encryption
- Envelope encryption using master key
- Encrypted credential issuance (self-issue + batch)
- IPFS CID storage (encrypted at rest)
- On-chain hash anchoring

### 2. Verifiable Sharing System

- Time-limited verification tickets
- Selective field disclosure
- Human-readable verification page
- Machine-readable API verification

### 3. TrustConnect (Bidirectional Verification)

Institutions publish verification requirements.  
Users apply using  materials and SBT credentials.

**Workflow**

Institution → Publish requirements  
User → Apply → Authorize verification  
Institution → Review → Verify ticket  
User → Receive result + Contact information  

### 4. Trust Scoring System

Dynamic reputation based on:

- Verified credentials  
- Successful interactions  
- Platform behavioral signals  

---

## Technology Stack

### Frontend

- **Framework:** React 18 + Vite  
- **UI & Styling:** Tailwind CSS + Framer Motion  
- **Web3 Integration:** Ethers.js (v6)  
- **Routing:** React Router v6  
- **Other:** IPFS integration (Pinata Web3), 3D assets (@splinetool)

### Backend

- **Framework:** Node.js + Express  
- **Database:** MySQL 8+  
- **Scheduled Jobs:** node-cron  
- **Contract Interaction:** Ethers.js  
- **Enterprise Integration:** TrustConnect API (e.g., `/api/v1/verify/sbt`)

### Smart Contracts

- **Environment:** Hardhat  
- **Core Library:** OpenZeppelin  

### Cryptography

- AES-256-GCM symmetric encryption (Web Crypto API)  
- ECIES asymmetric key wrapping (secp256k1)  
- Deterministic shared-key derivation (keccak256 + solidityPacked)  
- Public key extraction via Signature Recovery (EIP-191)  
- Master key derivation  
- Envelope encryption  
- Sorted Merkle tree (on-chain claim verification)  
- Recovery key mechanism  

---

## Quick Start (Local Development)

### Prerequisites

- Node.js v18+
- MySQL v8.0+
- MetaMask or any EVM-compatible wallet

---

### 1. Deploy Smart Contracts

Deploy contracts to a local test network or testnet:

```bash
cd contracts
npm install

# Start local Hardhat node
npm run node

# Deploy contracts in a new terminal
npm run deploy:all:localhost
```

After deployment, record the contract addresses and configure them in the backend and frontend `.env` files.

### 2. Start Backend Service

Responsible for listening to on-chain events, database management, and trust score computation:

```bash
cd backend
npm install

cp .env.example .env
```

Configure database connection and contract addresses in `.env`:
```env
CHAIN_RPC_URL=
ISSUER_BATCH_ADDRESS=
...
```

Then run:

```bash
npm run migrate
npm run start
```

Default port: `8787`

### 3. Start Frontend Application

Provides the dark-theme, security-focused user interface:

```bash
cd frontend
npm install
npm run dev
```

Open:
`http://localhost:5173`

---

## Admin Configuration

Set admin allowlist and withdrawal defaults in both backend and frontend environments.

### Backend (.env)

- `ADMIN_ALLOWLIST`: Comma-separated admin wallet addresses used to authorize admin-only API routes.

### Frontend (.env)

- `VITE_ADMIN_ALLOWLIST`: Comma-separated admin wallet addresses used to show admin navigation and gate admin UI.
- `VITE_ADMIN_WITHDRAW_TO`: Default withdrawal recipient address in the admin revenue panel.

---

## Backend API (Partial)

### Health
`GET /health`

### Trust Score
`GET /api/trust-score/:address?sync=1&refresh=1`

### TrustConnect
`POST /api/connect/apply`  
`POST /api/connect/review`  
`POST /api/connect/requirements`  
`POST /api/connect/verify/sbt`  

### Sharing & Verification
`POST /api/share/safe-link/created`  
`POST /api/verify/safe-link`  
`GET /api/verify/safe-link/status/:cid`  

### Public Key Registry
`POST /api/connect/register-key` — Register public key on wallet connect  
`POST /api/users/public-keys` — Bulk lookup recipient public keys  

### Enterprise Verification
`POST /api/v1/verify/sbt`  
Header: `x-api-key`

---

## Troubleshooting

### MySQL authentication failed (using password: NO)
Ensure `MYSQL_PASSWORD` is configured and restart the backend.

### Frontend cannot detect local chain or contracts
Set wallet network to `127.0.0.1:8545` (ChainId 1337).  
Verify contract deployment and frontend `.env` configuration.

### Some error messages appear in Chinese
These are legacy messages and do not affect functionality.  
Full localization will be provided in future versions.

---

## Project Structure

```text
TrustArchive/
  frontend/    # Frontend DApp (Vite)
  backend/     # Trust Score + TrustConnect services (Express)
  contracts/   # Solidity contracts + Hardhat Ignition
```

---

## Use Cases

- Credential verification
- Privacy-preserving resumes
- Legal evidence storage
- Financial proof submission
- Identity-related documentation
- Secure document sharing

---

## Project Status

Prototype / MVP  
Not production-ready.

---

## Demo

<img width="2168" height="1266" alt="屏幕截图 2026-02-21 012321" src="https://github.com/user-attachments/assets/111bdd00-b79c-446a-93d8-2f6f691e6b62" />

Coming soon...

---

## License

MIT License

---

## Author

 Jay-Gould7   
 Contact: gold.xxtxx@gmail.com
