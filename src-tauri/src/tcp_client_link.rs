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

async fn run_single_connection(
    app: AppHandle,
    webview: &str,
    session_id: &str,
    peer: &str,
    socket: TcpStream,
    recv_hex: bool,
    stats: Arc<Stats>,
    clients: Arc<RwLock<HashMap<u64, ClientEntry>>>,
    opts: &TcpClientLinkOptions,
    shutdown_rx: &mut watch::Receiver<bool>,
) -> DisconnectReason {
    let id = 1u64;
    let (tx, rx) = mpsc::unbounded_channel();
    let (peer_done_tx, peer_done_rx) = oneshot::channel::<()>();
    let last_rx = Arc::new(RwLock::new(Instant::now()));
    let hb_failed = Arc::new(AtomicBool::new(false));

    let client_task = tokio::spawn(crate::network_cat::client_loop(
        socket,
        id,
        peer.to_string(),
        rx,
        app.clone(),
        webview.to_string(),
        session_id.to_string(),
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
                peer: peer.to_string(),
                task: client_task,
            },
        );
    }
    emit_clients_tcp(&app, webview, session_id, &clients).await;
    emit_tcp_link(
        &app,
        webview,
        session_id,
        "connected",
        0,
        opts.reconnect_max_attempts,
        0,
        if opts.heartbeat_enabled {
            "ok"
        } else {
            "off"
        },
    )
    .await;

    let heartbeat_task = if opts.heartbeat_enabled {
        let hb_bytes = match parse_heartbeat_hex(&opts.heartbeat_hex) {
            Ok(b) if !b.is_empty() => b,
            Ok(_) => vec![0x00],
            Err(e) => {
                emit_log(
                    &app,
                    webview,
                    session_id,
                    "error",
                    format!("心跳载荷无效: {}", e),
                )
                .await;
                vec![0x00]
            }
        };
        let interval = Duration::from_millis(opts.heartbeat_interval_ms.max(500));
        let timeout = Duration::from_millis(opts.heartbeat_timeout_ms.max(1000));
        let app_h = app.clone();
        let wv = webview.to_string();
        let sid = session_id.to_string();
        let tx_h = tx.clone();
        let last_rx_h = last_rx.clone();
        let failed_h = hb_failed.clone();
        Some(tokio::spawn(async move {
            let mut ticker = tokio::time::interval(interval);
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                ticker.tick().await;
                {
                    let last = *last_rx_h.read().await;
                    if last.elapsed() > timeout {
                        failed_h.store(true, Ordering::Relaxed);
                        emit_log(
                            &app_h,
                            &wv,
                            &sid,
                            "error",
                            format!(
                                "心跳超时（{} ms 内无接收数据）",
                                timeout.as_millis()
                            ),
                        )
                        .await;
                        emit_tcp_link(
                            &app_h,
                            &wv,
                            &sid,
                            "connected",
                            0,
                            0,
                            0,
                            "timeout",
                        )
                        .await;
                        return;
                    }
                }
                emit_tcp_link(
                    &app_h,
                    &wv,
                    &sid,
                    "connected",
                    0,
                    0,
                    0,
                    "ok",
                )
                .await;
                if tx_h.send(hb_bytes.clone()).is_err() {
                    return;
                }
                emit_log(
                    &app_h,
                    &wv,
                    &sid,
                    "send",
                    format!("HEARTBEAT >>> {} bytes", hb_bytes.len()),
                )
                .await;
                emit_tcp_link(
                    &app_h,
                    &wv,
                    &sid,
                    "connected",
                    0,
                    0,
                    0,
                    "waiting",
                )
                .await;
            }
        }))
    } else {
        None
    };

    let reason = tokio::select! {
        _ = async {
            loop {
                if shutdown_rx.changed().await.is_err() {
                    break;
                }
                if *shutdown_rx.borrow() {
                    break;
                }
            }
        } => DisconnectReason::User,
        _ = peer_done_rx => DisconnectReason::Peer,
        _ = async {
            loop {
                if hb_failed.load(Ordering::Relaxed) {
                    break;
                }
                sleep(Duration::from_millis(200)).await;
            }
        } => DisconnectReason::HeartbeatTimeout,
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
    emit_clients_tcp(&app, webview, session_id, &clients).await;
    reason
}

pub async fn run_tcp_client_session(
    app: AppHandle,
    webview: String,
    session_id: String,
    addr_s: String,
    recv_hex: bool,
    opts: TcpClientLinkOptions,
    stats: Arc<Stats>,
    clients: Arc<RwLock<HashMap<u64, ClientEntry>>>,
    session_slot: Arc<tokio::sync::Mutex<Option<SessionHandle>>>,
    state: Arc<NcState>,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    let wv = webview.as_str();
    let sid = session_id.as_str();
    let mode_str = "tcp_client";

    emit_server_state(&app, wv, sid, true, addr_s.clone(), mode_str).await;
    emit_tcp_link(
        &app,
        wv,
        sid,
        "idle",
        0,
        opts.reconnect_max_attempts,
        0,
        if opts.heartbeat_enabled {
            "off"
        } else {
            "off"
        },
    )
    .await;

    let mut reconnect_attempt: u32 = 0;

    loop {
        if *shutdown_rx.borrow() {
            break;
        }

        if reconnect_attempt > 0 {
            let delay = reconnect_delay_ms(&opts, reconnect_attempt);
            let max_label = if opts.reconnect_max_attempts == 0 {
                "∞".to_string()
            } else {
                format!("{}", opts.reconnect_max_attempts)
            };
            emit_log(
                &app,
                wv,
                sid,
                "info",
                format!(
                    "正在重连 {}（第 {}/{} 次，{} ms 后重试）",
                    addr_s, reconnect_attempt, max_label, delay
                ),
            )
            .await;
            emit_tcp_link(
                &app,
                wv,
                sid,
                "reconnecting",
                reconnect_attempt,
                opts.reconnect_max_attempts,
                delay,
                "off",
            )
            .await;
            if wait_shutdown_or_delay(&mut shutdown_rx, delay).await {
                break;
            }
        }

        match TcpStream::connect(&addr_s).await {
            Err(e) => {
                reconnect_attempt = reconnect_attempt.saturating_add(1);
                emit_log(
                    &app,
                    wv,
                    sid,
                    "error",
                    format!("连接失败 (尝试 {}): {}", reconnect_attempt, e),
                )
                .await;
                emit_tcp_link(
                    &app,
                    wv,
                    sid,
                    "reconnecting",
                    reconnect_attempt,
                    opts.reconnect_max_attempts,
                    reconnect_delay_ms(&opts, reconnect_attempt),
                    "off",
                )
                .await;
                if !opts.auto_reconnect || max_attempts_reached(&opts, reconnect_attempt) {
                    if max_attempts_reached(&opts, reconnect_attempt) {
                        emit_log(
                            &app,
                            wv,
                            sid,
                            "error",
                            "已达最大重连次数，会话结束".into(),
                        )
                        .await;
                        emit_tcp_link(
                            &app,
                            wv,
                            sid,
                            "failed",
                            reconnect_attempt,
                            opts.reconnect_max_attempts,
                            0,
                            "off",
                        )
                        .await;
                    }
                    break;
                }
                continue;
            }
            Ok(sock) => {
                if opts.tcp_keepalive {
                    if let Err(e) = set_stream_keepalive(&sock) {
                        emit_log(
                            &app,
                            wv,
                            sid,
                            "info",
                            format!("TCP keepalive 未启用: {}", e),
                        )
                        .await;
                    } else {
                        emit_log(&app, wv, sid, "info", "TCP keepalive 已启用".into()).await;
                    }
                }
                if reconnect_attempt == 0 {
                    emit_log(
                        &app,
                        wv,
                        sid,
                        "server",
                        format!("# TCP connected to {}", addr_s),
                    )
                    .await;
                } else {
                    emit_log(
                        &app,
                        wv,
                        sid,
                        "server",
                        format!("# TCP 重连成功 {}", addr_s),
                    )
                    .await;
                }
                emit_stats(&app, wv, sid, &stats).await;
                reconnect_attempt = 0;

                let reason = run_single_connection(
                    app.clone(),
                    wv,
                    sid,
                    &addr_s,
                    sock,
                    recv_hex,
                    stats.clone(),
                    clients.clone(),
                    &opts,
                    &mut shutdown_rx,
                )
                .await;

                match reason {
                    DisconnectReason::User => break,
                    DisconnectReason::Peer => {
                        emit_tcp_link(
                            &app,
                            wv,
                            sid,
                            "disconnected",
                            reconnect_attempt,
                            opts.reconnect_max_attempts,
                            0,
                            "off",
                        )
                        .await;
                        if !opts.auto_reconnect {
                            break;
                        }
                        reconnect_attempt = reconnect_attempt.saturating_add(1);
                        if max_attempts_reached(&opts, reconnect_attempt) {
                            emit_log(
                                &app,
                                wv,
                                sid,
                                "error",
                                "已达最大重连次数，会话结束".into(),
                            )
                            .await;
                            emit_tcp_link(
                                &app,
                                wv,
                                sid,
                                "failed",
                                reconnect_attempt,
                                opts.reconnect_max_attempts,
                                0,
                                "off",
                            )
                            .await;
                            break;
                        }
                        continue;
                    }
                    DisconnectReason::HeartbeatTimeout => {
                        emit_tcp_link(
                            &app,
                            wv,
                            sid,
                            "disconnected",
                            reconnect_attempt,
                            opts.reconnect_max_attempts,
                            0,
                            "timeout",
                        )
                        .await;
                        if !opts.auto_reconnect {
                            break;
                        }
                        reconnect_attempt = reconnect_attempt.saturating_add(1);
                        if max_attempts_reached(&opts, reconnect_attempt) {
                            emit_log(
                                &app,
                                wv,
                                sid,
                                "error",
                                "心跳超时且已达最大重连次数".into(),
                            )
                            .await;
                            emit_tcp_link(
                                &app,
                                wv,
                                sid,
                                "failed",
                                reconnect_attempt,
                                opts.reconnect_max_attempts,
                                0,
                                "timeout",
                            )
                            .await;
                            break;
                        }
                        continue;
                    }
                }
            }
        }
    }

    emit_log(
        &app,
        wv,
        sid,
        "server",
        "# TCP client session closed".into(),
    )
    .await;
    emit_server_state(&app, wv, sid, false, String::new(), "idle").await;
    emit_tcp_link(&app, wv, sid, "stopped", 0, 0, 0, "off").await;
    {
        let mut srv = session_slot.lock().await;
        *srv = None;
    }
    clear_session_common(&app, wv, sid, state.as_ref()).await;
    emit_stats(&app, wv, sid, &stats).await;
}