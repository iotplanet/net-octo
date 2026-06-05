<a id="readme-top"></a>
<!-- PROJECT SHIELDS -->

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/iotplanet/net-octo/realease.yml?style=for-the-badge)
![GitHub contributors](https://img.shields.io/github/contributors/iotplanet/net-octo?style=for-the-badge)
![GitHub last commit](https://img.shields.io/github/last-commit/iotplanet/net-octo?style=for-the-badge)
![GitHub License](https://img.shields.io/github/license/iotplanet/net-octo?style=for-the-badge)

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/iotplanet/net-octo">
    <img src="icon.svg" alt="Logo" width="80" height="80">
  </a>

<h3 align="center">NetOcto</h3>

  <p align="center">
    A desktop TCP/UDP session lab — multi-tab sessions, ASCII/HEX payloads, structured logs, and per-tab persisted UI state.
    <br />
    <strong>简体中文：</strong> <a href="./README.zh.md">README.zh.md</a>
    <br />
    <br />
    <a href="#getting-started">Getting Started</a>
    &middot;
    <a href="https://github.com/iotplanet/net-octo/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    &middot;
    <a href="https://github.com/iotplanet/net-octo/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

NetOcto is a **desktop TCP/UDP session lab** built with **Tauri 2**, **React 19**, and **TypeScript**. It helps you start TCP/UDP server or client sessions, inspect traffic in a structured log, send outbound payloads (including loop send), and manage multiple isolated sessions in parallel tabs.

Networking runs in **Rust (Tokio)**; the UI is a **Vite** SPA using **HeroUI v3** and **Tailwind CSS v4**.

### Features

- **Session modes:** TCP server, TCP client, UDP server, UDP client (UDP client supports unicast, broadcast, and multicast profiles).
- **TCP client link options:** Auto-reconnect (interval, max attempts, exponential backoff), application-layer heartbeat with RX idle timeout, optional OS TCP keepalive; link state is observable in the UI and logs (`nc-tcp-link`).
- **Multi-tab workspace:** Each tab has its own `session_id`, backend `NcState`, and `localStorage` settings (`netocto.settings.v1.<tabId>`); tab list and titles survive restarts.
- **Payloads:** ASCII or HEX send/receive; HEX editor supports `//` full-line comments and byte-oriented formatting; optional ASCII escape parsing on send.
- **Message editor:** Multi-line editor, preset messages, loop send, send history, and syntax-style highlighting for comments vs payload.
- **Toolbox:** Modbus RTU CRC-16 calculator (copy / insert into the active tab editor).
- **Events:** Logs, client lists, stats, and server state are pushed from Rust via Tauri events (`nc-log`, `nc-clients`, `nc-stats`, `nc-server`, `nc-tcp-link`, …).
- **i18n:** English and Chinese UI in `src/i18n/catalog.ts` (browser locale + manual switch in Settings).

### Architecture

| Layer | Role |
|--------|------|
| `src-tauri/` | Tauri shell; `network_cat.rs` and `tcp_client_link.rs` own sockets, session registry, and `#[tauri::command]` handlers. |
| `src/` | React UI: `NetOctoApp`, `NetOctoSession`, `hexInput.ts`, `persist.ts`, `tcpLink.ts`, tools under `src/tools/`. |
| `src/App.tsx` | Routes **main** webview vs **settings** webview by label. |

### Repository layout

```
src/
  App.tsx                 # Root: I18n + main vs settings window
  main.tsx
  network/
    NetOctoApp.tsx        # Tab strip, sessions, settings / tools entry
    NetOctoSession.tsx    # Sidebar, log, message editor, TCP link card
    hexInput.ts           # HEX normalize, editor format, extract for send
    persist.ts            # Per-tab settings
    tcpLink.ts            # TCP reconnect / heartbeat UI helpers
  tools/modbus/           # Modbus CRC-16
  i18n/                   # Locale catalog + React context
  SettingsWindowPage.tsx  # Standalone settings webview
src-tauri/
  src/lib.rs              # Registers commands + SessionRegistry
  src/network_cat.rs      # TCP/UDP implementation + commands
  src/tcp_client_link.rs  # TCP client reconnect + heartbeat
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

* [![Tauri][Tauri]][Tauri-url]
* [![React][React.js]][React-url]
* [![Vite][Vite]][Vite-url]
* [![Rust][Rust-badge]][Rust-url]
* [![TypeScript][TypeScript]][TypeScript-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

### Prerequisites

- **Node.js** (LTS recommended) and **pnpm** or **npm** (Tauri config may use `pnpm` for `beforeDevCommand` / `beforeBuildCommand`; `npm` works if you adjust scripts).
- **Rust** toolchain (stable) and platform targets for **Tauri 2**.

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/iotplanet/net-octo.git
   cd net-octo
   ```
2. Install dependencies
   ```sh
   pnpm install
   # or: npm install
   ```
3. Run the desktop app (Tauri + Vite)
   ```sh
   pnpm tauri dev
   # or: npm run tauri dev
   ```
4. Optional — web-only UI (no native sockets)
   ```sh
   pnpm dev
   # or: npm run dev
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

1. Create or select a **session tab**, choose **TCP Server / TCP Client / UDP Server / UDP Client**, set bind or remote host/port, then **Start**.
2. Watch **RX** traffic in the log panel; tune display options (wrap, hide recv, auto-scroll, export/import JSON logs).
3. Compose payloads in the **message editor** (ASCII or HEX), send once or enable **loop send**; use presets for quick replay.
4. For **TCP Client**, configure **Link · reconnect & heartbeat** in the sidebar before starting; status appears in the stats bar and tab title when reconnecting.
5. Open **Tools** (wrench) for **Modbus RTU CRC-16** — copy or insert results into the active tab editor.

### Tauri commands (Rust → frontend)

| Command | Purpose |
|---------|---------|
| `nc_start_session` | Start TCP/UDP session for a `session_id` + `webview_label`. |
| `nc_stop_session` | Stop session for a tab. |
| `nc_stop_server` | Stop server-side listener (if applicable). |
| `nc_send` | Send payload to selected target(s). |
| `nc_disconnect` | Disconnect / remove client mapping. |
| `nc_reset_stats` | Reset TX/RX counters for the session. |

_For the classic flat readme, see [README.md](./README.md)._

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [x] Multi-tab TCP/UDP sessions with persisted per-tab settings
- [x] TCP client auto-reconnect and application heartbeat
- [x] Modbus RTU CRC-16 toolbox (Phase 1)
- [ ] **JT/T 808** — terminal positioning & messaging (frame parse, escape, checksum, templates)
- [ ] **JT/T 1078** — video / channel negotiation as an optional session type or plugin
- [ ] **Ecosystem glue:** JT/T 809, 905, and similar stacks as modular decoders on the existing log/send pipeline

See the [open issues](https://github.com/iotplanet/net-octo/issues) for proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag `enhancement`.
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Top contributors:

<a href="https://github.com/iotplanet/net-octo/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=iotplanet/net-octo" alt="contrib.rocks image" />
</a>



<!-- LICENSE -->
## License

Distributed under the **Mulan Permissive Software License, Version 2** (Mulan PSL v2). See [`LICENSE`](./LICENSE) for the full text. Official information: [MulanPSL2](http://license.coscl.org.cn/MulanPSL2).

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTACT -->
## Contact

**iotplanet** — [github.com/iotplanet/net-octo](https://github.com/iotplanet/net-octo)

Project Link: [https://github.com/iotplanet/net-octo](https://github.com/iotplanet/net-octo)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [Tauri](https://tauri.app/) — desktop shell and IPC
* [HeroUI](https://www.heroui.com/) — React component library
* [Tokio](https://tokio.rs/) — async networking on the Rust side

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[contributors-shield]: https://img.shields.io/github/contributors/iotplanet/net-octo.svg?style=for-the-badge
[contributors-url]: https://github.com/iotplanet/net-octo/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/iotplanet/net-octo.svg?style=for-the-badge
[forks-url]: https://github.com/iotplanet/net-octo/network/members
[stars-shield]: https://img.shields.io/github/stars/iotplanet/net-octo.svg?style=for-the-badge
[stars-url]: https://github.com/iotplanet/net-octo/stargazers
[issues-shield]: https://img.shields.io/github/issues/iotplanet/net-octo.svg?style=for-the-badge
[issues-url]: https://github.com/iotplanet/net-octo/issues
[license-shield]: https://img.shields.io/github/license/iotplanet/net-octo.svg?style=for-the-badge
[license-url]: https://github.com/iotplanet/net-octo/blob/master/LICENSE
[product-screenshot]: icon.svg
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Tauri]: https://img.shields.io/badge/Tauri-24C8D8?style=for-the-badge&logo=tauri&logoColor=fff
[Tauri-url]: https://tauri.app/
[Vite]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=fff
[Vite-url]: https://vitejs.dev/
[Rust-badge]: https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white
[Rust-url]: https://www.rust-lang.org/
[TypeScript]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=fff
[TypeScript-url]: https://www.typescriptlang.org/
