//! TCP client: auto-reconnect, application heartbeat, optional TCP keepalive.

use crate::network_cat::{
    clear_session_common, emit_clients_tcp, emit_log, emit_server_state, emit_stats, emit_tcp_link,
    parse_heartbeat_hex, set_stream_keepalive, ClientEntry, NcState, SessionHandle, Stats,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot, watch, RwLock};
use tokio::time::sleep;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DisconnectReason {
    User,
    Peer,
    HeartbeatTimeout,
}

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TcpClientLinkOptions {
    pub auto_reconnect: bool,
    pub reconnect_interval_ms: u64,
    /// 0 = unlimited reconnect attempts after disconnect.
    pub reconnect_max_attempts: u32,
    pub reconnect_backoff: bool,
    pub heartbeat_enabled: bool,
    pub heartbeat_interval_ms: u64,
    pub heartbeat_timeout_ms: u64,
    pub heartbeat_hex: String,
    pub tcp_keepalive: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TcpLinkEvent {
    pub session_id: String,
    pub phase: String,
    pub attempt: u32,
    pub max_attempts: u32,
    pub next_retry_ms: u64,
    pub heartbeat: String,
}

struct Ctx<'a> {
    app: &'a AppHandle,
    wv: &'a str,
    sid: &'a str,
    addr: &'a str,
    opts: &'a TcpClientLinkOptions,
}

impl<'a> Ctx<'a> {
    async fn link(&self, phase: &str, attempt: u32, next_retry_ms: u64, heartbeat: &str) {
        emit_tcp_link(
            self.app,
            self.wv,
            self.sid,
            phase,
            attempt,
            self.opts.reconnect_max_attempts,
            next_retry_ms,
            heartbeat,
        )
        .await;
    }

    async fn log(&self, kind: &str, msg: impl Into<String>) {
        emit_log(self.app, self.wv, self.sid, kind, msg.into()).await;
    }
}

fn reconnect_delay_ms(opts: &TcpClientLinkOptions, attempt: u32) -> u64 {
    let base = opts.reconnect_interval_ms.max(200);
    if !opts.reconnect_backoff || attempt <= 1 {
        return base;
    }
    let exp = attempt.saturating_sub(1).min(8);
    base.saturating_mul(1u64 << exp).min(60_000)
}

fn max_attempts_reached(opts: &TcpClientLinkOptions, attempt: u32) -> bool {
    opts.reconnect_max_attempts > 0 && attempt >= opts.reconnect_max_attempts
}

fn max_attempts_label(opts: &TcpClientLinkOptions) -> String {
    if opts.reconnect_max_attempts == 0 {
        "∞".into()
    } else {
        format!("{}", opts.reconnect_max_attempts)
    }
}

async fn wait_shutdown_or_delay(shutdown_rx: &mut watch::Receiver<bool>, delay_ms: u64) -> bool {
    if delay_ms == 0 {
        return shutdown_rx.changed().await.is_ok() && *shutdown_rx.borrow();
    }
    let sleep = sleep(Duration::from_millis(delay_ms));
    tokio::pin!(sleep);
    loop {
        tokio::select! {
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    return true;
                }
            }
            _ = &mut sleep => return false,
        }
    }
}

async fn apply_keepalive(ctx: &Ctx<'_>, sock: &TcpStream) {
    if !ctx.opts.tcp_keepalive {
        return;
    }
    match set_stream_keepalive(sock) {
        Ok(()) => ctx.log("info", "TCP keepalive 已启用").await,
        Err(e) => ctx.log("info", format!("TCP keepalive 未启用: {}", e)).await,
    }
}

async fn resolve_heartbeat_bytes(ctx: &Ctx<'_>) -> Vec<u8> {
    match parse_heartbeat_hex(&ctx.opts.heartbeat_hex) {
        Ok(b) if !b.is_empty() => b,
        Ok(_) => vec![0x00],
        Err(e) => {
            ctx.log("error", format!("心跳载荷无效: {}", e)).await;
            vec![0x00]
        }
    }
}

async fn tls_connect(
    addr: &str,
    sock: TcpStream,
) -> Result<tokio_rustls::client::TlsStream<TcpStream>, String> {
    let host = addr.split(':').next().unwrap_or("localhost").to_string();
    let server_name: rustls::pki_types::ServerName<'static> = host
        .try_into()
        .map_err(|e| format!("invalid server name: {e}"))?;
    let tls_cfg = crate::tls::dangerous_client_config();
    let connector = tokio_rustls::TlsConnector::from(std::sync::Arc::new(tls_cfg));
    connector
        .connect(server_name, sock)
        .await
        .map_err(|e| format!("TLS handshake: {e}"))
}

async fn run_single_connection(
    ctx: &Ctx<'_>,
    socket: impl tokio::io::AsyncRead + tokio::io::AsyncWrite + Send + Unpin + 'static,
    recv_hex: bool,
    stats: Arc<Stats>,
    clients: Arc<RwLock<HashMap<u64, ClientEntry>>>,
    shutdown_rx: &mut watch::Receiver<bool>,
) -> DisconnectReason {
    let id = 1u64;
    let peer = ctx.addr.to_string();
    let (tx, rx) = mpsc::unbounded_channel();
    let (peer_done_tx, peer_done_rx) = oneshot::channel::<()>();
    let last_rx = Arc::new(RwLock::new(Instant::now()));
    let hb_failed = Arc::new(AtomicBool::new(false));

    let client_task = tokio::spawn(crate::network_cat::client_loop(
        socket,
        id,
        peer.clone(),
        rx,
        ctx.app.clone(),
        ctx.wv.to_string(),
        ctx.sid.to_string(),
        stats.clone(),
        recv_hex,
        clients.clone(),
        Some(peer_done_tx),
        Some(last_rx.clone()),
    ));

    {
        let mut g = clients.write().await;
        g.insert(
            id,
            ClientEntry {
                tx: tx.clone(),
                peer: peer.clone(),
                task: client_task,
            },
        );
    }
    emit_clients_tcp(ctx.app, ctx.wv, ctx.sid, &clients).await;
    let hb = if ctx.opts.heartbeat_enabled { "ok" } else { "off" };
    ctx.link("connected", 0, 0, hb).await;

    let heartbeat_task = if ctx.opts.heartbeat_enabled {
        let hb_bytes = resolve_heartbeat_bytes(ctx).await;
        let interval = Duration::from_millis(ctx.opts.heartbeat_interval_ms.max(500));
        let timeout = Duration::from_millis(ctx.opts.heartbeat_timeout_ms.max(1000));
        let app = ctx.app.clone();
        let wv = ctx.wv.to_string();
        let sid = ctx.sid.to_string();
        let tx_h = tx.clone();
        let last_rx_h = last_rx.clone();
        let failed_h = hb_failed.clone();
        Some(tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                ticker.tick().await;
                if last_rx_h.read().await.elapsed() > timeout {
                    failed_h.store(true, Ordering::Relaxed);
                    emit_log(
                        &app,
                        &wv,
                        &sid,
                        "error",
                        format!("心跳超时（{} ms 内无接收数据）", timeout.as_millis()),
                    )
                    .await;
                    emit_tcp_link(&app, &wv, &sid, "connected", 0, 0, 0, "timeout").await;
                    return;
                }
                if tx_h.send(hb_bytes.clone()).is_err() {
                    return;
                }
                emit_log(
                    &app,
                    &wv,
                    &sid,
                    "send",
                    format!("HEARTBEAT >>> {} bytes", hb_bytes.len()),
                )
                .await;
                emit_tcp_link(&app, &wv, &sid, "connected", 0, 0, 0, "waiting").await;
            }
        }))
    } else {
        None
    };

    let reason = tokio::select! {
        _ = wait_for_shutdown(shutdown_rx) => DisconnectReason::User,
        _ = peer_done_rx => DisconnectReason::Peer,
        _ = wait_heartbeat_fail(&hb_failed) => DisconnectReason::HeartbeatTimeout,
    };

    if let Some(hb) = heartbeat_task {
        hb.abort();
    }
    {
        let mut g = clients.write().await;
        if let Some(e) = g.remove(&id) {
            if !matches!(reason, DisconnectReason::Peer) {
                e.task.abort();
            }
        }
    }
    emit_clients_tcp(ctx.app, ctx.wv, ctx.sid, &clients).await;
    reason
}

async fn wait_for_shutdown(shutdown_rx: &mut watch::Receiver<bool>) {
    loop {
        if shutdown_rx.changed().await.is_err() {
            break;
        }
        if *shutdown_rx.borrow() {
            break;
        }
    }
}

async fn wait_heartbeat_fail(failed: &AtomicBool) {
    loop {
        if failed.load(Ordering::Relaxed) {
            break;
        }
        sleep(Duration::from_millis(200)).await;
    }
}

/// After disconnect: emit state, bump attempt, return whether the session loop should continue.
async fn after_disconnect(
    ctx: &Ctx<'_>,
    reason: DisconnectReason,
    reconnect_attempt: &mut u32,
) -> bool {
    let hb = match reason {
        DisconnectReason::HeartbeatTimeout => "timeout",
        _ => "off",
    };
    ctx.link("disconnected", *reconnect_attempt, 0, hb).await;

    if !ctx.opts.auto_reconnect {
        return false;
    }
    *reconnect_attempt = reconnect_attempt.saturating_add(1);
    if max_attempts_reached(ctx.opts, *reconnect_attempt) {
        let msg = match reason {
            DisconnectReason::HeartbeatTimeout => "心跳超时且已达最大重连次数",
            _ => "已达最大重连次数，会话结束",
        };
        ctx.log("error", msg).await;
        ctx.link("failed", *reconnect_attempt, 0, hb).await;
        return false;
    }
    true
}

pub async fn run_tcp_client_session(
    app: AppHandle,
    webview: String,
    session_id: String,
    addr_s: String,
    recv_hex: bool,
    use_tls: bool,
    opts: TcpClientLinkOptions,
    stats: Arc<Stats>,
    clients: Arc<RwLock<HashMap<u64, ClientEntry>>>,
    session_slot: Arc<tokio::sync::Mutex<Option<SessionHandle>>>,
    state: Arc<NcState>,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    let wv = webview.as_str();
    let sid = session_id.as_str();
    let ctx = Ctx {
        app: &app,
        wv,
        sid,
        addr: &addr_s,
        opts: &opts,
    };

    emit_server_state(ctx.app, ctx.wv, ctx.sid, true, addr_s.clone(), "tcp_client").await;
    ctx.link("idle", 0, 0, "off").await;

    let mut reconnect_attempt: u32 = 0;

    loop {
        if *shutdown_rx.borrow() {
            break;
        }

        if reconnect_attempt > 0 {
            let delay = reconnect_delay_ms(&opts, reconnect_attempt);
            ctx.log(
                "info",
                format!(
                    "正在重连 {}（第 {}/{} 次，{} ms 后重试）",
                    addr_s,
                    reconnect_attempt,
                    max_attempts_label(&opts),
                    delay
                ),
            )
            .await;
            ctx.link("reconnecting", reconnect_attempt, delay, "off").await;
            if wait_shutdown_or_delay(&mut shutdown_rx, delay).await {
                break;
            }
        }

        match TcpStream::connect(&addr_s).await {
            Err(e) => {
                reconnect_attempt = reconnect_attempt.saturating_add(1);
                ctx.log(
                    "error",
                    format!("连接失败 (尝试 {}): {}", reconnect_attempt, e),
                )
                .await;
                ctx.link(
                    "reconnecting",
                    reconnect_attempt,
                    reconnect_delay_ms(&opts, reconnect_attempt),
                    "off",
                )
                .await;
                if !opts.auto_reconnect || max_attempts_reached(&opts, reconnect_attempt) {
                    if max_attempts_reached(&opts, reconnect_attempt) {
                        ctx.log("error", "已达最大重连次数，会话结束").await;
                        ctx.link("failed", reconnect_attempt, 0, "off").await;
                    }
                    break;
                }
            }
            Ok(sock) => {
                apply_keepalive(&ctx, &sock).await;
                let proto = if use_tls { "TLS " } else { "" };
                let msg = if reconnect_attempt == 0 {
                    format!("# {}TCP connected to {}", proto, addr_s)
                } else {
                    format!("# {}TCP 重连成功 {}", proto, addr_s)
                };
                ctx.log("server", msg).await;
                emit_stats(ctx.app, ctx.wv, ctx.sid, &stats).await;
                reconnect_attempt = 0;

                if use_tls {
                    let tls_result = tls_connect(&addr_s, sock).await;
                    match tls_result {
                        Ok(tls_stream) => {
                            let reason = run_single_connection(
                                &ctx,
                                tls_stream,
                                recv_hex,
                                stats.clone(),
                                clients.clone(),
                                &mut shutdown_rx,
                            )
                            .await;
                            match reason {
                                DisconnectReason::User => break,
                                DisconnectReason::Peer | DisconnectReason::HeartbeatTimeout => {
                                    if !after_disconnect(&ctx, reason, &mut reconnect_attempt).await {
                                        break;
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            ctx.log("error", format!("TLS handshake failed: {}", e)).await;
                            reconnect_attempt = reconnect_attempt.saturating_add(1);
                            if !opts.auto_reconnect || max_attempts_reached(&opts, reconnect_attempt) {
                                ctx.link("failed", reconnect_attempt, 0, "off").await;
                                break;
                            }
                        }
                    }
                } else {
                    let reason = run_single_connection(
                        &ctx,
                        sock,
                        recv_hex,
                        stats.clone(),
                        clients.clone(),
                        &mut shutdown_rx,
                    )
                    .await;

                    match reason {
                        DisconnectReason::User => break,
                        DisconnectReason::Peer | DisconnectReason::HeartbeatTimeout => {
                            if !after_disconnect(&ctx, reason, &mut reconnect_attempt).await {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    ctx.log("server", "# TCP client session closed").await;
    emit_server_state(ctx.app, ctx.wv, ctx.sid, false, String::new(), "idle").await;
    ctx.link("stopped", 0, 0, "off").await;
    {
        let mut srv = session_slot.lock().await;
        *srv = None;
    }
    clear_session_common(ctx.app, ctx.wv, ctx.sid, state.as_ref()).await;
    emit_stats(ctx.app, ctx.wv, ctx.sid, &stats).await;
}
