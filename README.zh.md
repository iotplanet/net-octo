# NetOcto 中文说明

> 英文文档：[README.md](./README.md)

基于 **Tauri 2**、**React 19** 与 **TypeScript** 的桌面端 TCP/UDP 会话调试工具，支持多标签会话、ASCII/HEX 报文、日志与按标签持久化的界面状态。

---

## 概述

NetOcto 用于在桌面端快速搭建 **TCP 服务端/客户端** 与 **UDP 服务端/客户端**，以结构化日志查看收发数据，支持 ASCII/HEX、循环发送与多标签并行会话。网络 I/O 在 **Rust（Tokio）** 中实现，界面为 **Vite + React**，组件库为 **HeroUI v3**，样式为 **Tailwind CSS v4**。

## 功能要点

- **会话模式：** TCP Server / TCP Client / UDP Server / UDP Client；UDP Client 支持单播、广播、多播等目标配置。
- **多标签：** 每个标签独立 `session_id`、后端状态与 `localStorage` 配置（`netocto.settings.v1.<tabId>`）。
- **报文：** 收发均可选 ASCII 或 HEX；HEX 编辑支持整行 `//` 注释、展示层自动按字节空格与大写格式化；发送侧可选 ASCII 转义解析。
- **报文编辑区：** 多行编辑、选区发送、发送历史插入；注释与载荷分色高亮（行首可选空白后的 `//` 视为注释起点）。
- **事件推送：** Rust 通过 Tauri 事件向前端推送日志、连接列表、统计与运行状态等。
- **国际化：** 中英文文案集中在 `src/i18n/catalog.ts`，支持浏览器语言检测与设置页切换。

## 架构说明

| 层级 | 说明 |
|------|------|
| `src-tauri/` | Tauri 壳与原生能力；`network_cat.rs` 管理监听/套接字、会话注册表及 `#[tauri::command]`。 |
| `src/` | React UI：`NetOctoApp`（标签与外壳）、`NetOctoSession`（侧栏 + 日志 + 报文编辑）、`hexInput.ts`、`persist.ts`。 |
| `src/App.tsx` | 根据 webview 标签区分主窗口与设置窗口。 |

## 目录结构

```
src/
  App.tsx                 # 根：I18n + 主窗口 / 设置窗口
  main.tsx
  network/
    NetOctoApp.tsx        # 标签栏、会话（全部挂载）、设置入口
    NetOctoSession.tsx    # 模式/绑定/端口、RX/TX 卡片、日志、报文编辑
    hexInput.ts           # HEX 规范化、编辑器格式化、发送前抽取
    persist.ts            # 按标签 loadSettings / saveSettings
  i18n/                   # 文案目录 + React Context
  SettingsWindowPage.tsx  # 独立设置 webview 内容
src-tauri/
  src/lib.rs              # 注册命令与 SessionRegistry
  src/network_cat.rs      # TCP/UDP 实现与命令
redesign/                 # 可选 UI 实验（未接入主构建）
```

## 环境要求

- **Node.js**（建议 LTS）及 **pnpm** 或 **npm**（仓库 `tauri.conf.json` 中默认使用 `pnpm` 作为 dev/build 前置命令，可按需改为 `npm`）。
- **Rust** stable 及 **Tauri 2** 所需平台目标。

## 开发与构建

```bash
pnpm install
pnpm dev              # 仅前端 Vite
pnpm tauri dev        # 桌面端完整调试
pnpm build            # 前端生产构建
pnpm tauri build      # 打包桌面应用
```

## Tauri 命令（Rust → 前端）

前端通过 `@tauri-apps/api/core` 的 `invoke` 调用：

| 命令 | 说明 |
|------|------|
| `nc_start_session` | 为指定 `session_id` 与 `webview_label` 启动 TCP/UDP 会话。 |
| `nc_stop_session` | 停止该标签的会话。 |
| `nc_stop_server` | 停止服务端监听（若适用）。 |
| `nc_send` | 向所选目标发送载荷。 |
| `nc_disconnect` | 按当前实现断开 / 移除客户端映射。 |
| `nc_reset_stats` | 重置该会话的 TX/RX 统计。 |

## 路线图（未来计划）

当前版本为**通用字节流**调试，尚未内置行业私有协议栈。计划在现有会话与报文通道之上逐步接入：

- **JT/T 808**（道路运输车辆卫星定位系统 **终端** 通信协议及信息格式）— 帧边界、转义、校验及常用消息体模板与解析视图。
- **JT/T 1078**（道路运输车辆卫星定位系统 **视频** 通信协议）— 音视频通道、信令与数据面的实验性支持，可与 808 会话联动设计。
- **相关扩展：** 如 **JT/T 809**（监管平台数据交换）、**905**（出租汽车服务）等，以「可插拔协议模块」形式接入现有日志与下发管线，避免与通用 TCP/UDP 实验室能力耦合过紧。

若你有协议字段表、测试向量或希望优先的报文类型，欢迎通过 Issue / PR 讨论模块划分（例如前端 `src/protocols/` + Rust 侧独立子模块或命令）。

## 许可证

本项目采用 **木兰宽松许可证，第 2 版（Mulan PSL v2）**。完整条款见仓库根目录 [`LICENSE`](./LICENSE)。官方说明见 [木兰许可证网站](http://license.coscl.org.cn/MulanPSL2)。
