# NetOcto

A desktop TCP/UDP session lab built with **Tauri 2** + **React 19** + **TypeScript** — multi-tab sessions, raw/HEX payloads, logs, and per-tab persisted UI state.

**简体中文：** [README.zh.md](./README.zh.md)

---

### Overview

NetOcto helps you start **TCP server/client** and **UDP server/client** sessions, inspect traffic in a structured log, send outbound payloads (including loop send), and manage multiple isolated sessions in parallel tabs. Networking runs in **Rust (Tokio)**; the UI is a **Vite** SPA using **HeroUI v3** and **Tailwind CSS v4**.

### Features

- **Session modes:** TCP server, TCP client, UDP server, UDP client (with unicast / broadcast / multicast profiles for UDP client).
- **Multi-tab:** Each tab has its own `session_id`, backend `NcState`, and `localStorage` settings (`netocto.settings.v1.<tabId>`).
- **Payloads:** ASCII or HEX send/receive toggles; HEX editor supports `//` full-line comments and line formatting (`normalizeHexInput`-style display); optional ASCII escape parsing for send.
- **Message editor:** Multi-line editor with optional selection send, send history panel, and syntax-style highlighting for comments vs payload.
- **Events:** Log lines, client lists, stats, and server state are pushed from Rust to the webview via Tauri events (`nc-log`, `nc-clients`, `nc-stats`, etc.).
- **i18n:** English and Chinese UI strings in `src/i18n/catalog.ts` (browser locale + manual switch in Settings).

### Architecture

| Layer | Role |
|--------|------|
| `src-tauri/` | Tauri app shell; `network_cat.rs` owns listeners/sockets, session registry, and `#[tauri::command]` handlers. |
| `src/` | React UI: `NetOctoApp` (tabs + chrome), `NetOctoSession` (sidebar + log + editor), `hexInput.ts` (HEX/ASCII helpers), `persist.ts` (per-tab settings). |
| `src/App.tsx` | Routes **main** webview vs **settings** webview by label. |

### Repository layout

```
src/
  App.tsx                 # Root: I18n + main vs settings window
  main.tsx
  network/
    NetOctoApp.tsx        # Tab strip, sessions (all mounted), settings entry
    NetOctoSession.tsx    # Mode/bind/port, RX/TX cards, log, message editor
    hexInput.ts           # HEX normalize, editor format, extract for send
    persist.ts            # loadSettings / saveSettings per tab
  i18n/                   # Locale catalog + React context
  SettingsWindowPage.tsx  # Standalone settings webview content
src-tauri/
  src/lib.rs              # Registers commands + SessionRegistry
  src/network_cat.rs      # TCP/UDP implementation + commands
redesign/                 # Optional UI experiments (not wired to main build)
```

### Prerequisites

- **Node.js** (LTS recommended) and **pnpm** or **npm** (Tauri config uses `pnpm` for `beforeDevCommand` / `beforeBuildCommand`; adjust if you use only npm).
- **Rust** toolchain (stable) and platform targets for **Tauri 2**.

### Getting started

```bash
# Install JS dependencies
pnpm install   # or: npm install

# Web dev (Vite only, no native sockets)
pnpm dev       # or: npm run dev

# Full desktop app (Tauri + Vite)
pnpm tauri dev

# Production web build
pnpm build     # or: npm run build

# Packaged app (per Tauri bundle config)
pnpm tauri build
```

### Tauri commands (Rust → frontend)

Invoked from the UI via `@tauri-apps/api/core` `invoke`:

| Command | Purpose |
|---------|---------|
| `nc_start_session` | Start TCP/UDP session for a `session_id` + `webview_label`. |
| `nc_stop_session` | Stop session for a tab. |
| `nc_stop_server` | Stop server-side listener (if applicable). |
| `nc_send` | Send payload to selected target(s). |
| `nc_disconnect` | Disconnect / remove client mapping as implemented. |
| `nc_reset_stats` | Reset TX/RX counters for the session. |

### Roadmap (planned)

Private / industry protocols are **not implemented yet**; the current stack is generic byte streams. Planned extensions include:

- **JT/T 808** (*道路运输车辆卫星定位系统终端通信协议及信息格式*) — terminal positioning & messaging: frame parsing, escape, checksum, and message templates on top of TCP/UDP sessions.
- **JT/T 1078** (*道路运输车辆卫星定位系统视频通信协议*) — realtime video / channel negotiation; likely as an optional session type or plugin over the same transport lab.
- **Ecosystem glue:** JT/T **809** (supervisory platform data exchange), **905** (taxi / ride-hailing extensions), and similar stacks — evaluated as modular decoders/encoders that feed the existing log and send pipeline.

Contributions or design notes for protocol modules are welcome (e.g. `src/protocols/` + Rust sidecar commands).

---

## License

This project is licensed under the **Mulan Permissive Software License, Version 2** (Mulan PSL v2). The full text is in [`LICENSE`](./LICENSE) at the repository root. Official information: [MulanPSL2](http://license.coscl.org.cn/MulanPSL2).

Chinese readme (including license summary): [README.zh.md](./README.zh.md).
