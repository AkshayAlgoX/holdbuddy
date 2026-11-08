# Security Policy

HoldBuddy takes security and privacy seriously. Because HoldBuddy interacts with telephony protocols and audio streams, this document outlines our security architecture, privacy commitments, and vulnerability reporting procedures.

---

## 1. Supported Versions

| Version | Supported | Notes |
|:---:|:---:|---|
| `1.0.x` | ✅ | Active release candidate |
| `< 1.0.0` | ❌ | Historical development branches |

---

## 2. Security Architecture & Boundary Model

### Public Demonstration Boundary
- The public interactive demonstration operates completely decoupled from live PSTN telephone networks.
- All public caller sessions execute through deterministic offline fixtures with pre-captured and verified transcripts.
- Native privileged endpoints (`/api/v1/native/*`) that interact with local Asterisk PBX daemons or speech APIs require same-origin loopback access (`127.0.0.1` / `localhost`) and fail closed (`404` / `403` / `503`) on public edge deployments.

### Privacy & Zero-Credential Exposure
- **No PII Collected:** The application does not store phone numbers, user voice recordings, credit cards, or personal identifiers.
- **Client Bundles:** Browser client JavaScript bundles contain zero API keys, tokens, or private endpoints.
- **Strict Content Security Policy:** Implemented across all endpoints:
  - `default-src 'self'`
  - `form-action 'none'` (prevents credential exfiltration)
  - `frame-ancestors 'none'` (prevents clickjacking)
  - `object-src 'none'`

---

## 3. Reporting a Vulnerability

If you discover a security vulnerability or credential leak in HoldBuddy, please **do not open a public GitHub issue**.

Instead, please report it privately:
1. Open a **Private Security Advisory** on GitHub via the **Security** tab of the repository.
2. Or contact the maintainers directly via email: `rakshay5764@gmail.com`.

### What to Include:
- A description of the issue and potential impact.
- Step-by-step reproduction instructions or proof-of-concept.
- Any suggested mitigations.

We will acknowledge receipt within 48 hours and coordinate a fix prior to public disclosure.
