# JalalAI Unified Platform — Integration Plan and Audit Boundary

## Goal
Build one JalalAI product that presents a unified interface and integrates capabilities from the supplied projects through explicit adapters and services. This is a **modular integration**, not a claim that unrelated repositories can be safely pasted into one codebase without engineering work.

## What was inspected in this delivery
- Existing JalalAI web application: `index.html` / `jalalai-agent-ui-v3.html`.
- Cloudflare Worker API proxy: `worker/index.js`.
- Cloudflare Worker configuration: `worker/wrangler.toml`.
- Existing automated test suite: `tests/`.
- Source archive top-level manifests and README summaries for the seven source projects preserved under `source-archives/`.

## Source projects and proposed integration role

| Source archive | What its README identifies | Proposed integration boundary | Status |
|---|---|---|---|
| `OpenJarvis-main.zip` | Personal AI / local-device assistant; Python package | Local model/runtime adapter and device-first execution option | Source preserved; adapter not yet wired |
| `deepseek-harness-master.zip` | Plugin-based agent harness; developer preview and safety notice | Agent orchestration/plugin adapter; evaluate safety notice and API stability before execution | Source preserved; adapter not yet wired |
| `ECC-main.zip` | Agent-harness / engineering context collection | Developer workflow/skills catalog; individual skills must be audited before use | Source preserved; not runtime-integrated |
| `Jarvis-Desktop-Voice-Assistant-main.zip` | Desktop voice assistant, voice commands and OS/browser actions | Optional desktop voice/action bridge; requires OS-specific permission sandbox | Source preserved; adapter not yet wired |
| `J.A.R.V.I.S-master.zip` | Python desktop assistant with OS actions and face-recognition components | Optional desktop-only plugin; sensitive capabilities must be disabled by default and separately permissioned | Source preserved; adapter not yet wired |
| `kalliope-master.zip` | Signal-to-neuron personal assistant framework | Voice/event trigger adapter | Source preserved; adapter not yet wired |
| `genoffice-main.zip` | AI office suite for documents, spreadsheets, slides, PDF and Markdown | Office/document workspace integration, ideally as isolated service/module | Source preserved; adapter not yet wired |

## Existing real-provider path
The Worker contains a real outbound Gemini API call using Google's OpenAI-compatible endpoint. It expects provider credentials to be configured as a Cloudflare Worker secret, not committed to source. The current application does **not** include a live deployed Cloudflare service or a supplied Gemini key. Therefore the live cloud path cannot be called deployed until a Cloudflare account deployment and smoke test succeed.

Required Worker secrets:
- `GEMINI_API_KEY` — obtained from the Google AI developer console.
- `JALALAI_ACCESS_TOKEN` — a separate application access token, not the provider key.

Required configuration:
- `ALLOWED_ORIGINS` set to the exact deployed web-app origin.
- `ALLOWED_MODELS` set to the intended allowed Gemini model(s).
- Durable Object binding `RATE_LIMITER` enabled as defined in `worker/wrangler.toml`.

Deploy guide: `docs/DEPLOYMENT.md`.

## Non-negotiable security rules
1. Never put provider API keys in HTML, client JavaScript, committed `.env` files, or source archives.
2. Do not execute arbitrary commands from an LLM without a scoped allowlist, confirmation gates and audit logs.
3. Treat voice, face recognition, file access, email, browser control and system power actions as privileged tools requiring explicit permissions.
4. Treat each upstream project as untrusted input until its license, dependencies, supply-chain risks, and runtime behavior have been audited.
5. Keep source archives intact. Integrate functionality behind narrow adapters rather than blindly overwriting same-named files.

## What is not claimed
- No provider API key has been supplied or tested against the live internet from this package build.
- No Cloudflare Worker has been deployed by this package build.
- No voice hardware, desktop control, face recognition, OpenJarvis runtime, DeepSeek Harness, Kalliope or GenOffice runtime is claimed to be integrated or working in the JalalAI UI yet.
- The archives are preserved as source inputs; archive inclusion alone is not feature integration.

## Recommended build sequence
1. Stabilize the JalalAI web app and server-side provider gateway.
2. Add provider adapters and test them with real credentials in deployment secrets.
3. Add a permissioned agent/tool registry and audit log.
4. Add local-model adapter and capability detection for OpenJarvis.
5. Add voice I/O and desktop bridge as a separately installed, permissioned service.
6. Add document/office service integration.
7. Run integration, security, deployment and browser/device tests before release.
