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
    桌面端 TCP/UDP 会话调试工具 — 多标签会话、ASCII/HEX 报文、结构化日志与按标签持久化的界面状态。
    <br />
    <strong>English：</strong> <a href="./README.md">README.md</a>
    <br />
    <br />
    <a href="#getting-started">快速开始</a>
    &middot;
    <a href="https://github.com/iotplanet/net-octo/issues/new?labels=bug&template=bug-report---.md">报告缺陷</a>
    &middot;
    <a href="https://github.com/iotplanet/net-octo/issues/new?labels=enhancement&template=feature-request---.md">功能建议</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>目录</summary>
  <ol>
    <li>
      <a href="#about-the-project">关于项目</a>
      <ul>
        <li><a href="#built-with">技术栈</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">快速开始</a>
      <ul>
        <li><a href="#prerequisites">环境要求</a></li>
        <li><a href="#installation">安装与运行</a></li>
      </ul>
    </li>
    <li><a href="#usage">使用说明</a></li>
    <li><a href="#roadmap">路线图</a></li>
    <li><a href="#contributing">参与贡献</a></li>
    <li><a href="#license">许可证</a></li>
    <li><a href="#contact">联系方式</a></li>
    <li><a href="#acknowledgments">致谢</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

NetOcto 是基于 **Tauri 2**、**React 19** 与 **TypeScript** 的桌面端 TCP/UDP 会话实验室。可在本机快速搭建 TCP/UDP 服务端或客户端，以结构化日志查看收发数据，支持循环发送与多标签并行会话。

网络 I/O 在 **Rust（Tokio）** 中实现；界面为 **Vite + React**，组件库为 **HeroUI v3**，样式为 **Tailwind CSS v4**。

### 功能要点

- **会话模式：** TCP Server / TCP Client / UDP Server / UDP Client；UDP Client 支持单播、广播、多播等目标配置。
- **TCP 客户端链路：** 断线自动重连（间隔、最大次数、指数退避）、应用层心跳与接收空闲超时、可选系统 TCP keepalive；链路状态可在界面与日志中观察（`nc-tcp-link`）。
- **多标签工作区：** 每个标签独立 `session_id`、后端状态与 `localStorage` 配置（`netocto.settings.v1.<tabId>`）；标签列表与标题可在重启后恢复。
- **报文：** 收发均可选 ASCII 或 HEX；HEX 编辑支持整行 `//` 注释与按字节格式化；发送侧可选 ASCII 转义解析。
- **报文编辑区：** 多行编辑、预设报文、循环发送、发送历史；注释与载荷分色高亮。
- **工具箱：** Modbus RTU CRC-16 计算器（复制 / 插入当前标签编辑器）。
- **事件推送：** Rust 通过 Tauri 事件向前端推送日志、连接列表、统计与运行状态等（`nc-log`、`nc-clients`、`nc-stats`、`nc-server`、`nc-tcp-link` 等）。
- **国际化：** 中英文文案集中在 `src/i18n/catalog.ts`，支持浏览器语言检测与设置页切换。

### 架构说明

| 层级 | 说明 |
|------|------|
| `src-tauri/` | Tauri 壳；`network_cat.rs` 与 `tcp_client_link.rs` 管理套接字、会话注册表及 `#[tauri::command]`。 |
| `src/` | React UI：`NetOctoApp`、`NetOctoSession`、`hexInput.ts`、`persist.ts`、`tcpLink.ts`，工具见 `src/tools/`。 |
| `src/App.tsx` | 根据 webview 标签区分主窗口与设置窗口。 |

### 目录结构

```
src/
  App.tsx                 # 根：I18n + 主窗口 / 设置窗口
  main.tsx
  network/
    NetOctoApp.tsx        # 标签栏、会话、设置与工具入口
    NetOctoSession.tsx    # 侧栏、日志、报文编辑、TCP 链路卡片
    hexInput.ts           # HEX 规范化、编辑器格式化、发送前抽取
    persist.ts            # 按标签持久化设置
    tcpLink.ts            # TCP 重连 / 心跳 UI 辅助
  tools/modbus/           # Modbus CRC-16
  i18n/                   # 文案目录 + React Context
  SettingsWindowPage.tsx  # 独立设置 webview
src-tauri/
  src/lib.rs              # 注册命令与 SessionRegistry
  src/network_cat.rs      # TCP/UDP 实现与命令
  src/tcp_client_link.rs  # TCP 客户端重连与心跳
```

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>



### Built With

* [![Tauri][Tauri]][Tauri-url]
* [![React][React.js]][React-url]
* [![Vite][Vite]][Vite-url]
* [![Rust][Rust-badge]][Rust-url]
* [![TypeScript][TypeScript]][TypeScript-url]

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

### Prerequisites

- **Node.js**（建议 LTS）及 **pnpm** 或 **npm**（仓库 Tauri 配置可能默认使用 `pnpm` 作为 dev/build 前置命令，也可改用 `npm`）。
- **Rust** stable 及 **Tauri 2** 所需平台目标。

### Installation

1. 克隆仓库
   ```sh
   git clone https://github.com/iotplanet/net-octo.git
   cd net-octo
   ```
2. 安装依赖
   ```sh
   pnpm install
   # 或：npm install
   ```
3. 启动桌面应用（Tauri + Vite）
   ```sh
   pnpm tauri dev
   # 或：npm run tauri dev
   ```
4. 可选 — 仅前端（无原生套接字）
   ```sh
   pnpm dev
   # 或：npm run dev
   ```

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

1. 新建或选择**会话标签**，选择 **TCP/UDP 服务端或客户端**，配置绑定地址或远端主机/端口后**启动**。
2. 在日志区查看 **RX** 数据；可调整换行、隐藏接收、自动滚动，并支持 JSON 日志导入/导出。
3. 在**报文编辑器**中编写 ASCII 或 HEX 载荷，单次发送或开启**循环发送**；使用预设快速重放。
4. **TCP Client** 可在侧栏配置**链路 · 重连与心跳**；重连时状态会反映在底栏统计与标签标题中。
5. 点击**工具**（扳手图标）使用 **Modbus RTU CRC-16**，可将结果复制或插入当前标签编辑器。

### Tauri 命令（Rust → 前端）

| 命令 | 说明 |
|------|------|
| `nc_start_session` | 为指定 `session_id` 与 `webview_label` 启动 TCP/UDP 会话。 |
| `nc_stop_session` | 停止该标签的会话。 |
| `nc_stop_server` | 停止服务端监听（若适用）。 |
| `nc_send` | 向所选目标发送载荷。 |
| `nc_disconnect` | 按当前实现断开 / 移除客户端映射。 |
| `nc_reset_stats` | 重置该会话的 TX/RX 统计。 |

_简明版说明另见 [README.zh.md](./README.zh.md)。_

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [x] 多标签 TCP/UDP 会话与按标签持久化设置
- [x] TCP 客户端自动重连与应用层心跳
- [x] Modbus RTU CRC-16 工具箱（第一阶段）
- [ ] **JT/T 808** — 终端定位与报文（帧解析、转义、校验、常用消息模板）
- [ ] **JT/T 1078** — 视频 / 通道协商，作为可选会话类型或插件
- [ ] **生态扩展：** JT/T 809、905 等，以可插拔协议模块接入现有日志与下发管线

完整讨论与已知问题见 [Issues](https://github.com/iotplanet/net-octo/issues)。

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>



<!-- CONTRIBUTING -->
## Contributing

欢迎通过 Issue 或 Pull Request 参与改进。若你有协议字段表、测试向量或希望优先支持的报文类型，也欢迎在 Issue 中讨论模块划分（例如 `src/protocols/` + Rust 子模块）。

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feature/AmazingFeature`）
3. 提交更改（`git commit -m 'Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 开启 Pull Request

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

### 主要贡献者

<a href="https://github.com/iotplanet/net-octo/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=iotplanet/net-octo" alt="contrib.rocks image" />
</a>



<!-- LICENSE -->
## License

本项目采用 **木兰宽松许可证，第 2 版（Mulan PSL v2）**。完整条款见仓库根目录 [`LICENSE`](./LICENSE)。官方说明：[木兰许可证网站](http://license.coscl.org.cn/MulanPSL2)。

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>



<!-- CONTACT -->
## Contact

**iotplanet** — [github.com/iotplanet/net-octo](https://github.com/iotplanet/net-octo)

项目地址：[https://github.com/iotplanet/net-octo](https://github.com/iotplanet/net-octo)

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>



<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [Tauri](https://tauri.app/) — 桌面壳与 IPC
* [HeroUI](https://www.heroui.com/) — React 组件库
* [Tokio](https://tokio.rs/) — Rust 侧异步网络

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
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
