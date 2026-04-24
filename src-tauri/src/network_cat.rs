//! NetOcto: TCP server/client + UDP server/client.

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::sync::{mpsc, watch, RwLock};

#[derive(Default)]
pub struct Stats {
    rx_pkts: AtomicU64,
    tx_pkts: AtomicU64,
    rx_bytes: AtomicU64,
    tx_bytes: AtomicU64,
}

#[derive(Serialize, Clone, Copy)]
pub struct StatsDto {
    pub rx_pkts: u64,
    pub tx_pkts: u64,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

impl Stats {
    pub fn snapshot(&self) -> StatsDto {
        StatsDto {
            rx_pkts: self.rx_pkts.load(Ordering::Relaxed),
            tx_pkts: self.tx_pkts.load(Ordering::Relaxed),
            rx_bytes: self.rx_bytes.load(Ordering::Relaxed),
            tx_bytes: self.tx_bytes.load(Ordering::Relaxed),
        }
    }

    pub fn reset(&self) {
        self.rx_pkts.store(0, Ordering::Relaxed);
        self.tx_pkts.store(0, Ordering::Relaxed);
        self.rx_bytes.store(0, Ordering::Relaxed);
        self.tx_bytes.store(0, Ordering::Relaxed);
    }
}

pub struct ClientEntry {
    pub tx: mpsc::UnboundedSender<Vec<u8>>,
    pub peer: String,
    pub task: tokio::task::JoinHandle<()>,
}

#[derive(Clone)]
enum UdpSrvCmd {
    SendAll(Vec<u8>),
    SendOne(u64, Vec<u8>),
    ForgetPeer(u64),
    ForgetAll,
}

#[derive(Clone)]
enum UdpOutTx {
    Server(mpsc::UnboundedSender<UdpSrvCmd>),
    Client(mpsc::UnboundedSender<Vec<u8>>),
}

pub struct NcState {
    pub clients: Arc<RwLock<HashMap<u64, ClientEntry>>>,
    pub stats: Arc<Stats>,
    session: Arc<tokio::sync::Mutex<Option<SessionHandle>>>,
    next_client_id: Arc<AtomicU64>,
    udp_out: Arc<tokio::sync::Mutex<Option<UdpOutTx>>>,
}

struct SessionHandle {
    shutdown_tx: watch::Sender<bool>,
    join: tokio::task::JoinHandle<()>,
}

impl Default for NcState {
    fn default() -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            stats: Arc::new(Stats::default()),
            session: Arc::new(tokio::sync::Mutex::new(None)),
            next_client_id: Arc::new(AtomicU64::new(1)),
            udp_out: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }
}

/// 每个窗口标签对应一套独立会话状态
#[derive(Default)]
pub struct SessionRegistry {
    inner: tokio::sync::Mutex<HashMap<String, Arc<NcState>>>,
}

impl SessionRegistry {
    pub async fn get(&self, session_id: &str) -> Arc<NcState> {
        let mut m = self.inner.lock().await;
        m.entry(session_id.to_string())
            .or_insert_with(|| Arc::new(NcState::default()))
            .clone()
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    pub session_id: String,
    pub ts: String,
    pub line: String,
    pub kind: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClientsPayload {
    pub session_id: String,
    pub clients: Vec<ClientInfo>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StatsPayload {
    pub session_id: String,
    pub rx_pkts: u64,
    pub tx_pkts: u64,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Serialize, Clone)]
pub struct ClientInfo {
    pub id: u64,
    pub peer: String,
}

fn ts_string() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string()
}

fn format_recv(data: &[u8], hex_display: bool) -> String {
    if hex_display {
        data.iter()
            .map(|b| format!("{:02X}", b))
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        String::from_utf8_lossy(data).into_owned()
    }
}

fn decode_send_payload(data: &str, as_hex: bool, parse_escapes: bool) -> Result<Vec<u8>, String> {
    if as_hex {
        let compact: String = data.chars().filter(|c| !c.is_whitespace()).collect();
        if compact.len() % 2 != 0 {
            return Err("HEX 长度必须为偶数个字符".into());
        }
        hex::decode(&compact).map_err(|e| e.to_string())
    } else if parse_escapes {
        parse_escapes_ascii(data)
    } else {
        Ok(data.as_bytes().to_vec())
    }
}

fn parse_escapes_ascii(input: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\\' {
            let mut buf = [0u8; 4];
            let s = c.encode_utf8(&mut buf);
            out.extend_from_slice(s.as_bytes());
            continue;
        }
        match chars.next() {
            Some('n') => out.push(b'\n'),
            Some('r') => out.push(b'\r'),
            Some('t') => out.push(b'\t'),
            Some('0') => out.push(0),
            Some('\\') => out.push(b'\\'),
            Some('x') => {
                let a = chars.next().ok_or("不完整的 \\x 转义")?;
                let b = chars.next().ok_or("不完整的 \\x 转义")?;
                let hi = a.to_digit(16).ok_or("\\x 后应为两位十六进制")?;
                let lo = b.to_digit(16).ok_or("\\x 后应为两位十六进制")?;
                out.push(((hi << 4) | lo) as u8);
            }
            Some(other) => return Err(format!("未知转义序列: \\{}", other)),
            None => return Err("末尾单独的 \\".into()),
        }
    }
    Ok(out)
}

async fn emit_clients_tcp(
    app: &AppHandle,
    webview: &str,
    session_id: &str,
    clients: &RwLock<HashMap<u64, ClientEntry>>,
) {
    let list: Vec<ClientInfo> = clients
        .read()
        .await
        .iter()
        .map(|(id, c)| ClientInfo {
            id: *id,
            peer: c.peer.clone(),
        })
        .collect();
    let _ = app.emit_to(
        webview,
        "nc-clients",
        ClientsPayload {
            session_id: session_id.to_string(),
            clients: list,
        },
    );
}

async fn emit_clients_vec(
    app: &AppHandle,
    webview: &str,
    session_id: &str,
    list: Vec<ClientInfo>,
) {
    let _ = app.emit_to(
        webview,
        "nc-clients",
        ClientsPayload {
            session_id: session_id.to_string(),
            clients: list,
        },
    );
}

async fn emit_log(
    app: &AppHandle,
    webview: &str,
    session_id: &str,
    kind: &str,
    line: String,
) {
    let _ = app.emit_to(
        webview,
        "nc-log",
        LogEvent {
            session_id: session_id.to_string(),
            ts: ts_string(),
            line,
            kind: kind.to_string(),
        },
    );
}

async fn emit_stats(app: &AppHandle, webview: &str, session_id: &str, stats: &Stats) {
    let s = stats.snapshot();
    let _ = app.emit_to(
        webview,
        "nc-stats",
        StatsPayload {
            session_id: session_id.to_string(),
            rx_pkts: s.rx_pkts,
            tx_pkts: s.tx_pkts,
            rx_bytes: s.rx_bytes,
            tx_bytes: s.tx_bytes,
        },
    );
}

async fn emit_server_state(
    app: &AppHandle,
    webview: &str,
    session_id: &str,
    running: bool,
    addr: String,
    mode: &str,
) {
    let _ = app.emit_to(
        webview,
        "nc-server",
        serde_json::json!({
            "sessionId": session_id,
            "running": running,
            "addr": addr,
            "mode": mode,
        }),
    );
}

fn peers_to_client_info(peers: &HashMap<u64, SocketAddr>) -> Vec<ClientInfo> {
    let mut v: Vec<ClientInfo> = peers
        .iter()
        .map(|(id, a)| ClientInfo {
            id: *id,
            peer: a.to_string(),
        })
        .collect();
    v.sort_by_key(|c| c.id);
    v
}

fn ensure_udp_peer(peers: &mut HashMap<u64, SocketAddr>, next: &mut u64, addr: SocketAddr) -> u64 {
    for (id, a) in peers.iter() {
        if *a == addr {
            return *id;
        }
    }
    let id = *next;
    *next += 1;
    peers.insert(id, addr);
    id
}

async fn client_loop(
    mut socket: TcpStream,
    id: u64,
    peer: String,
    mut rx: mpsc::UnboundedReceiver<Vec<u8>>,
    app: AppHandle,
    webview: String,
    session: String,
    stats: Arc<Stats>,
    recv_hex: bool,
    clients: Arc<RwLock<HashMap<u64, ClientEntry>>>,
) {
    let (mut read_half, mut write_half) = socket.split();
    let mut buf = vec![0u8; 16384];
    loop {
        tokio::select! {
            r = read_half.read(&mut buf) => {
                match r {
                    Ok(0) => break,
                    Ok(n) => {
                        stats.rx_pkts.fetch_add(1, Ordering::Relaxed);
                        stats.rx_bytes.fetch_add(n as u64, Ordering::Relaxed);
                        let chunk = &buf[..n];
                        let body = format_recv(chunk, recv_hex);
                        let line = format!("[#{}] {}", id, body);
                        emit_log(&app, &webview, &session, "recv", line).await;
                        emit_stats(&app, &webview, &session, &stats).await;
                    }
                    Err(e) => {
                        emit_log(&app, &webview, &session, "error", format!("读取 #{}: {}", id, e)).await;
                        break;
                    }
                }
            }
            out = rx.recv() => {
                match out {
                    Some(bytes) => {
                        let len = bytes.len();
                        if write_half.write_all(&bytes).await.is_err() {
                            break;
                        }
                        stats.tx_pkts.fetch_add(1, Ordering::Relaxed);
                        stats.tx_bytes.fetch_add(len as u64, Ordering::Relaxed);
                        emit_stats(&app, &webview, &session, &stats).await;
                    }
                    None => break,
                }
            }
        }
    }

    let mut g = clients.write().await;
    g.remove(&id);
    drop(g);

    emit_clients_tcp(&app, &webview, &session, &clients).await;
    emit_log(
        &app,
        &webview,
        &session,
        "info",
        format!("[{}] 客户端 #{} 已断开", peer, id),
    )
    .await;
    emit_stats(&app, &webview, &session, &stats).await;
}

async fn udp_server_loop(
    socket: UdpSocket,
    mut shutdown_rx: watch::Receiver<bool>,
    mut cmd_rx: mpsc::UnboundedReceiver<UdpSrvCmd>,
    app: AppHandle,
    webview: String,
    session: String,
    stats: Arc<Stats>,
    recv_hex: bool,
    udp_out_slot: Arc<tokio::sync::Mutex<Option<UdpOutTx>>>,
) {
    let mut buf = vec![0u8; 65536];
    let mut peers: HashMap<u64, SocketAddr> = HashMap::new();
    let mut next_id: u64 = 1;

    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    break;
                }
            }
            r = socket.recv_from(&mut buf) => {
                match r {
                    Ok((n, addr)) => {
                        stats.rx_pkts.fetch_add(1, Ordering::Relaxed);
                        stats.rx_bytes.fetch_add(n as u64, Ordering::Relaxed);
                        let chunk = &buf[..n];
                        let body = format_recv(chunk, recv_hex);
                        let id = ensure_udp_peer(&mut peers, &mut next_id, addr);
                        emit_clients_vec(&app, &webview, &session, peers_to_client_info(&peers)).await;
                        let line = format!("[#{} ← {}] {}", id, addr, body);
                        emit_log(&app, &webview, &session, "recv", line).await;
                        emit_stats(&app, &webview, &session, &stats).await;
                    }
                    Err(e) => {
                        emit_log(&app, &webview, &session, "error", format!("UDP recv: {}", e)).await;
                        break;
                    }
                }
            }
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(UdpSrvCmd::SendAll(data)) => {
                        let n_peers = peers.len();
                        if n_peers == 0 {
                            emit_log(&app, &webview, &session, "error", "没有已知 UDP 对端，请先接收数据".into()).await;
                            continue;
                        }
                        let len = data.len();
                        for (_, addr) in peers.clone() {
                            if socket.send_to(&data, addr).await.is_ok() {
                                stats.tx_pkts.fetch_add(1, Ordering::Relaxed);
                                stats.tx_bytes.fetch_add(len as u64, Ordering::Relaxed);
                            }
                        }
                        emit_stats(&app, &webview, &session, &stats).await;
                    }
                    Some(UdpSrvCmd::SendOne(id, data)) => {
                        let len = data.len();
                        if let Some(addr) = peers.get(&id) {
                            if socket.send_to(&data, *addr).await.is_ok() {
                                stats.tx_pkts.fetch_add(1, Ordering::Relaxed);
                                stats.tx_bytes.fetch_add(len as u64, Ordering::Relaxed);
                            }
                        }
                        emit_stats(&app, &webview, &session, &stats).await;
                    }
                    Some(UdpSrvCmd::ForgetPeer(id)) => {
                        peers.remove(&id);
                        emit_clients_vec(&app, &webview, &session, peers_to_client_info(&peers)).await;
                    }
                    Some(UdpSrvCmd::ForgetAll) => {
                        peers.clear();
                        emit_clients_vec(&app, &webview, &session, vec![]).await;
                    }
                    None => break,
                }
            }
        }
    }

    *udp_out_slot.lock().await = None;
}

async fn udp_client_loop_connected(
    socket: UdpSocket,
    mut shutdown_rx: watch::Receiver<bool>,
    mut cmd_rx: mpsc::UnboundedReceiver<Vec<u8>>,
    app: AppHandle,
    webview: String,
    session: String,
    stats: Arc<Stats>,
    recv_hex: bool,
    remote: SocketAddr,
    udp_out_slot: Arc<tokio::sync::Mutex<Option<UdpOutTx>>>,
) {
    let mut buf = vec![0u8; 65536];
    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    break;
                }
            }
            r = socket.recv(&mut buf) => {
                match r {
                    Ok(n) => {
                        stats.rx_pkts.fetch_add(1, Ordering::Relaxed);
                        stats.rx_bytes.fetch_add(n as u64, Ordering::Relaxed);
                        let chunk = &buf[..n];
                        let body = format_recv(chunk, recv_hex);
                        let line = format!("[← {}] {}", remote, body);
                        emit_log(&app, &webview, &session, "recv", line).await;
                        emit_stats(&app, &webview, &session, &stats).await;
                    }
                    Err(e) => {
                        emit_log(&app, &webview, &session, "error", format!("UDP recv: {}", e)).await;
                        break;
                    }
                }
            }
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(data) => {
                        let len = data.len();
                        if socket.send(&data).await.is_ok() {
                            stats.tx_pkts.fetch_add(1, Ordering::Relaxed);
                            stats.tx_bytes.fetch_add(len as u64, Ordering::Relaxed);
                            emit_stats(&app, &webview, &session, &stats).await;
                        }
                    }
                    None => break,
                }
            }
        }
    }

    *udp_out_slot.lock().await = None;
}

/// Broadcast / multicast: unconnected socket, `send_to` all targets, `recv_from`.
async fn udp_client_loop_datagram(
    socket: UdpSocket,
    mut shutdown_rx: watch::Receiver<bool>,
    mut cmd_rx: mpsc::UnboundedReceiver<Vec<u8>>,
    app: AppHandle,
    webview: String,
    session: String,
    stats: Arc<Stats>,
    recv_hex: bool,
    send_targets: Arc<[SocketAddr]>,
    udp_out_slot: Arc<tokio::sync::Mutex<Option<UdpOutTx>>>,
) {
    let mut buf = vec![0u8; 65536];
    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    break;
                }
            }
            r = socket.recv_from(&mut buf) => {
                match r {
                    Ok((n, src)) => {
                        stats.rx_pkts.fetch_add(1, Ordering::Relaxed);
                        stats.rx_bytes.fetch_add(n as u64, Ordering::Relaxed);
                        let chunk = &buf[..n];
                        let body = format_recv(chunk, recv_hex);
                        let line = format!("[← {}] {}", src, body);
                        emit_log(&app, &webview, &session, "recv", line).await;
                        emit_stats(&app, &webview, &session, &stats).await;
                    }
                    Err(e) => {
                        emit_log(&app, &webview, &session, "error", format!("UDP recv: {}", e)).await;
                        break;
                    }
                }
            }
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(data) => {
                        let len = data.len();
                        let mut ok: u64 = 0;
                        for addr in send_targets.iter() {
                            if socket.send_to(&data, *addr).await.is_ok() {
                                ok += 1;
                                stats.tx_bytes.fetch_add(len as u64, Ordering::Relaxed);
                            }
                        }
                        if ok > 0 {
                            stats.tx_pkts.fetch_add(ok, Ordering::Relaxed);
                            emit_stats(&app, &webview, &session, &stats).await;
                        }
                    }
                    None => break,
                }
            }
        }
    }

    *udp_out_slot.lock().await = None;
}

fn parse_multicast_group_list(groups: &[String]) -> Result<Vec<SocketAddr>, String> {
    let mut addrs = Vec::new();
    let mut common_port: Option<u16> = None;
    for s in groups {
        let t = s.trim();
        if t.is_empty() {
            continue;
        }
        let a: SocketAddr = t
            .parse()
            .map_err(|_| format!("无效多播组: {}", t))?;
        if !a.ip().is_multicast() {
            return Err(format!("须为多播地址: {}", a));
        }
        match common_port {
            None => common_port = Some(a.port()),
            Some(p) if p != a.port() => {
                return Err("多播组必须使用相同端口".into());
            }
            _ => {}
        }
        addrs.push(a);
    }
    if addrs.is_empty() {
        return Err("请至少添加一个多播组".into());
    }
    Ok(addrs)
}

fn preview_payload(bytes: &[u8], as_hex: bool) -> String {
    if as_hex {
        hex::encode(bytes)
    } else {
        let s = String::from_utf8_lossy(bytes);
        let t = s.trim_end_matches('\n').trim_end_matches('\r');
        let short: String = t.chars().take(512).collect();
        if t.chars().count() > 512 {
            format!("{}…", short)
        } else {
            short
        }
    }
}

async fn clear_session_common(
    app: &AppHandle,
    webview: &str,
    session_id: &str,
    state: &NcState,
) {
    {
        let mut g = state.clients.write().await;
        for (_, e) in g.drain() {
            e.task.abort();
        }
    }
    *state.udp_out.lock().await = None;
    emit_clients_vec(app, webview, session_id, vec![]).await;
    emit_server_state(app, webview, session_id, false, String::new(), "idle").await;
    emit_stats(app, webview, session_id, &state.stats).await;
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum UdpClientTargetKind {
    #[default]
    #[serde(rename = "unicast")]
    Unicast,
    #[serde(rename = "broadcast")]
    Broadcast,
    #[serde(rename = "multicast")]
    Multicast,
}

#[derive(Deserialize)]
#[serde(tag = "mode", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum StartSessionArgs {
    #[serde(rename = "tcp_server")]
    TcpServer {
        bind: String,
        port: u16,
        recv_hex: bool,
    },
    #[serde(rename = "tcp_client")]
    TcpClient {
        host: String,
        port: u16,
        recv_hex: bool,
    },
    #[serde(rename = "udp_server")]
    UdpServer {
        bind: String,
        port: u16,
        recv_hex: bool,
    },
    #[serde(rename = "udp_client")]
    UdpClient {
        remote_host: String,
        remote_port: u16,
        recv_hex: bool,
        #[serde(default)]
        target_kind: UdpClientTargetKind,
        #[serde(default)]
        multicast_groups: Vec<String>,
    },
}

fn mode_label(args: &StartSessionArgs) -> &'static str {
    match args {
        StartSessionArgs::TcpServer { .. } => "tcp_server",
        StartSessionArgs::TcpClient { .. } => "tcp_client",
        StartSessionArgs::UdpServer { .. } => "udp_server",
        StartSessionArgs::UdpClient { .. } => "udp_client",
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSessionInvoke {
    pub session_id: String,
    pub webview_label: String,
    #[serde(flatten)]
    pub args: StartSessionArgs,
}

#[tauri::command]
pub async fn nc_start_session(
    app: AppHandle,
    registry: State<'_, SessionRegistry>,
    params: StartSessionInvoke,
) -> Result<(), String> {
    let state = registry.get(&params.session_id).await;
    let sid = params.session_id.clone();
    let wv = params.webview_label.clone();
    let args = params.args;
    let mut srv = state.session.lock().await;
    if srv.is_some() {
        return Err("已有会话在运行，请先关闭".into());
    }

    let mode_str = mode_label(&args);
    state.stats.reset();
    {
        let mut g = state.clients.write().await;
        for (_, e) in g.drain() {
            e.task.abort();
        }
    }
    *state.udp_out.lock().await = None;
    state.next_client_id.store(1, Ordering::Relaxed);

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let app_c = app.clone();
    let stats_c = state.stats.clone();
    let clients_c = state.clients.clone();
    let next_id = state.next_client_id.clone();
    let udp_out_slot = state.udp_out.clone();

    let join = match args {
        StartSessionArgs::TcpServer {
            bind,
            port,
            recv_hex,
        } => {
            let addr_s = format!("{}:{}", bind, port);
            let listener = TcpListener::bind(&addr_s)
                .await
                .map_err(|e| format!("绑定失败 {}: {}", addr_s, e))?;
            let wv_c = wv.clone();
            let sid_c = sid.clone();
            tokio::spawn(async move {
                emit_server_state(&app_c, &wv_c, &sid_c, true, addr_s.clone(), mode_str).await;
                emit_log(
                    &app_c,
                    &wv_c,
                    &sid_c,
                    "server",
                    format!("# TCP server listening on {}", addr_s),
                )
                .await;
                emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
                let mut shutdown_rx = shutdown_rx;
                loop {
                    tokio::select! {
                        _ = shutdown_rx.changed() => {
                            if *shutdown_rx.borrow() {
                                break;
                            }
                        }
                        acc = listener.accept() => {
                            match acc {
                                Ok((socket, a)) => {
                                    let peer = a.to_string();
                                    let id = next_id.fetch_add(1, Ordering::Relaxed);
                                    let (tx, rx) = mpsc::unbounded_channel();
                                    let app_t = app_c.clone();
                                    let stats_t = stats_c.clone();
                                    let clients_t = clients_c.clone();
                                    let wv_t = wv_c.clone();
                                    let sid_t = sid_c.clone();
                                    let task = tokio::spawn(client_loop(
                                        socket,
                                        id,
                                        peer.clone(),
                                        rx,
                                        app_t.clone(),
                                        wv_t,
                                        sid_t,
                                        stats_t,
                                        recv_hex,
                                        clients_t.clone(),
                                    ));
                                    {
                                        let mut g = clients_t.write().await;
                                        g.insert(
                                            id,
                                            ClientEntry {
                                                tx,
                                                peer: peer.clone(),
                                                task,
                                            },
                                        );
                                    }
                                    emit_clients_tcp(&app_t, &wv_c, &sid_c, &clients_t).await;
                                    emit_log(
                                        &app_t,
                                        &wv_c,
                                        &sid_c,
                                        "server",
                                        format!("# TCP client #{} from {}", id, peer),
                                    )
                                    .await;
                                }
                                Err(e) => {
                                    emit_log(&app_c, &wv_c, &sid_c, "error", format!("accept: {}", e)).await;
                                    break;
                                }
                            }
                        }
                    }
                }
                emit_log(&app_c, &wv_c, &sid_c, "server", "# TCP server stopped".into()).await;
                emit_server_state(&app_c, &wv_c, &sid_c, false, String::new(), "idle").await;
                emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
            })
        }
        StartSessionArgs::TcpClient {
            host,
            port,
            recv_hex,
        } => {
            let addr_s = format!("{}:{}", host, port);
            let wv_c = wv.clone();
            let sid_c = sid.clone();
            tokio::spawn(async move {
                emit_server_state(&app_c, &wv_c, &sid_c, true, addr_s.clone(), mode_str).await;
                let sock = match TcpStream::connect(&addr_s).await {
                    Ok(s) => s,
                    Err(e) => {
                        emit_log(&app_c, &wv_c, &sid_c, "error", format!("连接失败: {}", e)).await;
                        emit_server_state(&app_c, &wv_c, &sid_c, false, String::new(), "idle").await;
                        return;
                    }
                };
                emit_log(
                    &app_c,
                    &wv_c,
                    &sid_c,
                    "server",
                    format!("# TCP connected to {}", addr_s),
                )
                .await;
                emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
                let id = 1u64;
                let (tx, rx) = mpsc::unbounded_channel();
                let peer = addr_s.clone();
                let wv_cc = wv_c.clone();
                let sid_cc = sid_c.clone();
                let task = tokio::spawn(client_loop(
                    sock,
                    id,
                    peer.clone(),
                    rx,
                    app_c.clone(),
                    wv_cc,
                    sid_cc,
                    stats_c.clone(),
                    recv_hex,
                    clients_c.clone(),
                ));
                {
                    let mut g = clients_c.write().await;
                    g.insert(
                        id,
                        ClientEntry {
                            tx,
                            peer,
                            task,
                        },
                    );
                }
                emit_clients_tcp(&app_c, &wv_c, &sid_c, &clients_c).await;

                let mut shutdown_rx = shutdown_rx;
                loop {
                    if shutdown_rx.changed().await.is_err() {
                        break;
                    }
                    if *shutdown_rx.borrow() {
                        break;
                    }
                }
                {
                    let mut g = clients_c.write().await;
                    if let Some(e) = g.remove(&id) {
                        e.task.abort();
                    }
                }
                emit_clients_tcp(&app_c, &wv_c, &sid_c, &clients_c).await;
                emit_log(&app_c, &wv_c, &sid_c, "server", "# TCP client session closed".into()).await;
                emit_server_state(&app_c, &wv_c, &sid_c, false, String::new(), "idle").await;
                emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
            })
        }
        StartSessionArgs::UdpServer {
            bind,
            port,
            recv_hex,
        } => {
            let addr_s = format!("{}:{}", bind, port);
            let socket = UdpSocket::bind(&addr_s)
                .await
                .map_err(|e| format!("UDP 绑定失败 {}: {}", addr_s, e))?;
            let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
            *udp_out_slot.lock().await = Some(UdpOutTx::Server(cmd_tx.clone()));
            let slot = udp_out_slot.clone();
            let wv_c = wv.clone();
            let sid_c = sid.clone();
            tokio::spawn(async move {
                emit_server_state(&app_c, &wv_c, &sid_c, true, addr_s.clone(), mode_str).await;
                emit_log(
                    &app_c,
                    &wv_c,
                    &sid_c,
                    "server",
                    format!("# UDP bound on {}", addr_s),
                )
                .await;
                emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
                let stats_u = stats_c.clone();
                udp_server_loop(
                    socket,
                    shutdown_rx,
                    cmd_rx,
                    app_c.clone(),
                    wv_c.clone(),
                    sid_c.clone(),
                    stats_u,
                    recv_hex,
                    slot,
                )
                .await;
                emit_log(&app_c, &wv_c, &sid_c, "server", "# UDP server stopped".into()).await;
                emit_clients_vec(&app_c, &wv_c, &sid_c, vec![]).await;
                emit_server_state(&app_c, &wv_c, &sid_c, false, String::new(), "idle").await;
                emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
            })
        }
        StartSessionArgs::UdpClient {
            remote_host,
            remote_port,
            recv_hex,
            target_kind,
            multicast_groups,
        } => match target_kind {
            UdpClientTargetKind::Unicast => {
                let remote: SocketAddr = format!("{}:{}", remote_host, remote_port)
                    .parse()
                    .map_err(|e| format!("远端地址无效: {}", e))?;
                let socket = UdpSocket::bind("0.0.0.0:0")
                    .await
                    .map_err(|e| format!("UDP 本地绑定失败: {}", e))?;
                socket
                    .connect(remote)
                    .await
                    .map_err(|e| format!("UDP connect 失败: {}", e))?;
                let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
                *udp_out_slot.lock().await = Some(UdpOutTx::Client(cmd_tx.clone()));
                let addr_s = remote.to_string();
                let slot = udp_out_slot.clone();
                let wv_c = wv.clone();
                let sid_c = sid.clone();
                tokio::spawn(async move {
                    emit_server_state(&app_c, &wv_c, &sid_c, true, addr_s.clone(), mode_str).await;
                    emit_log(
                        &app_c,
                        &wv_c,
                        &sid_c,
                        "server",
                        format!("# UDP unicast → {}", addr_s),
                    )
                    .await;
                    emit_clients_vec(
                        &app_c,
                        &wv_c,
                        &sid_c,
                        vec![ClientInfo {
                            id: 1,
                            peer: addr_s.clone(),
                        }],
                    )
                    .await;
                    emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
                    udp_client_loop_connected(
                        socket,
                        shutdown_rx,
                        cmd_rx,
                        app_c.clone(),
                        wv_c.clone(),
                        sid_c.clone(),
                        stats_c.clone(),
                        recv_hex,
                        remote,
                        slot,
                    )
                    .await;
                    emit_clients_vec(&app_c, &wv_c, &sid_c, vec![]).await;
                    emit_log(&app_c, &wv_c, &sid_c, "server", "# UDP client stopped".into()).await;
                    emit_server_state(&app_c, &wv_c, &sid_c, false, String::new(), "idle").await;
                    emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
                })
            }
            UdpClientTargetKind::Broadcast => {
                let remote: SocketAddr = format!("{}:{}", remote_host, remote_port)
                    .parse()
                    .map_err(|e| format!("广播地址无效: {}", e))?;
                let addr_s = remote.to_string();
                let socket = UdpSocket::bind("0.0.0.0:0")
                    .await
                    .map_err(|e| format!("UDP 本地绑定失败: {}", e))?;
                socket
                    .set_broadcast(true)
                    .map_err(|e| format!("set_broadcast: {}", e))?;
                let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
                *udp_out_slot.lock().await = Some(UdpOutTx::Client(cmd_tx.clone()));
                let addrs: Arc<[SocketAddr]> = Arc::from([remote]);
                let slot = udp_out_slot.clone();
                let wv_c = wv.clone();
                let sid_c = sid.clone();
                let cli: Vec<ClientInfo> = addrs
                    .iter()
                    .enumerate()
                    .map(|(i, a)| ClientInfo {
                        id: (i + 1) as u64,
                        peer: a.to_string(),
                    })
                    .collect();
                tokio::spawn(async move {
                    emit_server_state(
                        &app_c,
                        &wv_c,
                        &sid_c,
                        true,
                        format!("BROADCAST {}", addr_s),
                        mode_str,
                    )
                    .await;
                    emit_log(
                        &app_c,
                        &wv_c,
                        &sid_c,
                        "server",
                        format!("# UDP broadcast → {}", addr_s),
                    )
                    .await;
                    emit_clients_vec(&app_c, &wv_c, &sid_c, cli).await;
                    emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
                    udp_client_loop_datagram(
                        socket,
                        shutdown_rx,
                        cmd_rx,
                        app_c.clone(),
                        wv_c.clone(),
                        sid_c.clone(),
                        stats_c.clone(),
                        recv_hex,
                        addrs,
                        slot,
                    )
                    .await;
                    emit_clients_vec(&app_c, &wv_c, &sid_c, vec![]).await;
                    emit_log(&app_c, &wv_c, &sid_c, "server", "# UDP client stopped".into()).await;
                    emit_server_state(&app_c, &wv_c, &sid_c, false, String::new(), "idle").await;
                    emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
                })
            }
            UdpClientTargetKind::Multicast => {
                let addrs = parse_multicast_group_list(&multicast_groups)?;
                let bind_port = addrs[0].port();
                let socket = UdpSocket::bind(format!("0.0.0.0:{}", bind_port))
                    .await
                    .map_err(|e| format!("UDP 多播绑定 {}: {}", bind_port, e))?;
                for a in &addrs {
                    if let IpAddr::V4(m) = a.ip() {
                        socket
                            .join_multicast_v4(m, Ipv4Addr::UNSPECIFIED)
                            .map_err(|e| format!("join_multicast: {}", e))?;
                    } else {
                        return Err("当前仅支持 IPv4 多播".into());
                    }
                }
                let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
                *udp_out_slot.lock().await = Some(UdpOutTx::Client(cmd_tx.clone()));
                let addrs_arc: Arc<[SocketAddr]> = addrs.clone().into();
                let summary = addrs
                    .iter()
                    .map(|a| a.to_string())
                    .collect::<Vec<_>>()
                    .join(", ");
                let slot = udp_out_slot.clone();
                let wv_c = wv.clone();
                let sid_c = sid.clone();
                let cli: Vec<ClientInfo> = addrs
                    .iter()
                    .enumerate()
                    .map(|(i, a)| ClientInfo {
                        id: (i + 1) as u64,
                        peer: a.to_string(),
                    })
                    .collect();
                tokio::spawn(async move {
                    emit_server_state(
                        &app_c,
                        &wv_c,
                        &sid_c,
                        true,
                        format!("MULTICAST :{}", bind_port),
                        mode_str,
                    )
                    .await;
                    emit_log(
                        &app_c,
                        &wv_c,
                        &sid_c,
                        "server",
                        format!("# UDP multicast join {}", summary),
                    )
                    .await;
                    emit_clients_vec(&app_c, &wv_c, &sid_c, cli).await;
                    emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
                    udp_client_loop_datagram(
                        socket,
                        shutdown_rx,
                        cmd_rx,
                        app_c.clone(),
                        wv_c.clone(),
                        sid_c.clone(),
                        stats_c.clone(),
                        recv_hex,
                        addrs_arc,
                        slot,
                    )
                    .await;
                    emit_clients_vec(&app_c, &wv_c, &sid_c, vec![]).await;
                    emit_log(&app_c, &wv_c, &sid_c, "server", "# UDP client stopped".into()).await;
                    emit_server_state(&app_c, &wv_c, &sid_c, false, String::new(), "idle").await;
                    emit_stats(&app_c, &wv_c, &sid_c, &stats_c).await;
                })
            }
        },
    };

    *srv = Some(SessionHandle {
        shutdown_tx,
        join,
    });
    Ok(())
}

#[tauri::command]
pub async fn nc_stop_session(
    app: AppHandle,
    registry: State<'_, SessionRegistry>,
    session_id: String,
    webview_label: String,
) -> Result<(), String> {
    let state = registry.get(&session_id).await;
    let handle = {
        let mut srv = state.session.lock().await;
        srv.take()
    };

    if let Some(h) = handle {
        let _ = h.shutdown_tx.send(true);
        let _ = h.join.await;
    }

    clear_session_common(
        &app,
        webview_label.as_str(),
        session_id.as_str(),
        state.as_ref(),
    )
    .await;
    Ok(())
}

#[tauri::command]
pub async fn nc_stop_server(
    app: AppHandle,
    registry: State<'_, SessionRegistry>,
    session_id: String,
    webview_label: String,
) -> Result<(), String> {
    nc_stop_session(app, registry, session_id, webview_label).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendArgs {
    pub session_id: String,
    pub webview_label: String,
    pub target: String,
    pub data: String,
    pub send_hex: bool,
    pub parse_escapes: bool,
}

#[tauri::command]
pub async fn nc_send(
    app: AppHandle,
    registry: State<'_, SessionRegistry>,
    payload: SendArgs,
) -> Result<(), String> {
    let state = registry.get(&payload.session_id).await;
    let wv = payload.webview_label.as_str();
    let sid = payload.session_id.as_str();
    let bytes = decode_send_payload(
        &payload.data,
        payload.send_hex,
        if payload.send_hex {
            false
        } else {
            payload.parse_escapes
        },
    )?;

    let mode = if payload.send_hex { "HEX" } else { "ASCII" };
    let len = bytes.len();

    let udp = state.udp_out.lock().await.clone();
    match udp {
        Some(UdpOutTx::Server(tx)) => {
            if payload.target == "all" {
                let _ = tx.send(UdpSrvCmd::SendAll(bytes.clone()));
                emit_log(
                    &app,
                    wv,
                    sid,
                    "send",
                    format!("SEND {}/{} >>> UDP ALL PEERS", mode, len),
                )
                .await;
            } else {
                let id: u64 = payload
                    .target
                    .parse()
                    .map_err(|_| "target 应为 all 或数字对端 ID")?;
                let _ = tx.send(UdpSrvCmd::SendOne(id, bytes.clone()));
                emit_log(
                    &app,
                    wv,
                    sid,
                    "send",
                    format!("SEND {}/{} >>> UDP peer #{}", mode, len, id),
                )
                .await;
            }
        }
        Some(UdpOutTx::Client(tx)) => {
            let _ = tx.send(bytes.clone());
            emit_log(
                &app,
                wv,
                sid,
                "send",
                format!("SEND {}/{} >>> UDP remote", mode, len),
            )
            .await;
        }
        None => {
            let g = state.clients.read().await;
            if g.is_empty() {
                return Err("没有可用连接".into());
            }
            if payload.target == "all" {
                let n = g.len();
                for (_, entry) in g.iter() {
                    let _ = entry.tx.send(bytes.clone());
                }
                emit_log(
                    &app,
                    wv,
                    sid,
                    "send",
                    format!(
                        "SEND {}/{} >>> TO ALL CLIENTS ({} recipients)",
                        mode, len, n
                    ),
                )
                .await;
            } else {
                let id: u64 = payload
                    .target
                    .parse()
                    .map_err(|_| "target 应为 all 或数字客户端 ID")?;
                let entry = g
                    .get(&id)
                    .ok_or_else(|| format!("找不到客户端 #{}", id))?;
                let _ = entry.tx.send(bytes.clone());
                emit_log(
                    &app,
                    wv,
                    sid,
                    "send",
                    format!("SEND {}/{} >>> TO CLIENT #{}", mode, len, id),
                )
                .await;
            }
        }
    }

    let preview = preview_payload(&bytes, payload.send_hex);
    emit_log(&app, wv, sid, "send-data", preview).await;

    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisconnectArgs {
    pub session_id: String,
    pub webview_label: String,
    pub target: String,
}

#[tauri::command]
pub async fn nc_disconnect(
    app: AppHandle,
    registry: State<'_, SessionRegistry>,
    payload: DisconnectArgs,
) -> Result<(), String> {
    let state = registry.get(&payload.session_id).await;
    let wv = payload.webview_label.as_str();
    let sid = payload.session_id.as_str();
    let target = payload.target;
    let udp = state.udp_out.lock().await.clone();
    match udp {
        Some(UdpOutTx::Server(tx)) => {
            if target == "all" {
                let _ = tx.send(UdpSrvCmd::ForgetAll);
            } else if let Ok(id) = target.parse::<u64>() {
                let _ = tx.send(UdpSrvCmd::ForgetPeer(id));
            }
            return Ok(());
        }
        Some(UdpOutTx::Client(_)) => {
            return Ok(());
        }
        None => {}
    }

    let mut g = state.clients.write().await;
    if target == "all" {
        for (_, e) in g.drain() {
            e.task.abort();
        }
    } else {
        let id: u64 = target
            .parse()
            .map_err(|_| "断开目标应为 all 或客户端 ID")?;
        if let Some(e) = g.remove(&id) {
            e.task.abort();
        }
    }
    drop(g);
    emit_clients_tcp(&app, wv, sid, &state.clients).await;
    Ok(())
}

#[tauri::command]
pub async fn nc_reset_stats(
    app: AppHandle,
    registry: State<'_, SessionRegistry>,
    session_id: String,
    webview_label: String,
) -> Result<(), String> {
    let state = registry.get(&session_id).await;
    state.stats.reset();
    emit_stats(
        &app,
        webview_label.as_str(),
        session_id.as_str(),
        &state.stats,
    )
    .await;
    Ok(())
}
