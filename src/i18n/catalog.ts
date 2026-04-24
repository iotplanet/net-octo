export type Locale = 'zh' | 'en'

const en = {
  'app.mainTab': 'Main',
  'app.webviewTitle': 'Webview label (event routing)',
  'app.settings': 'Settings',
  'app.closeTab': 'Close tab',
  'app.newTab': 'New session tab',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.langZh': '中文',
  'settings.langEn': 'English',
  'settings.done': 'Done',

  'session.cardSession': 'Session',
  'session.cardRx': 'Receive · RX',
  'session.cardTx': 'Send · TX',
  'session.fieldMode': 'Mode',
  'session.fieldRemoteHost': 'Remote host',
  'session.fieldRemotePort': 'Remote port',
  'session.fieldBind': 'Bind address',
  'session.fieldLocalPort': 'Local port',
  'session.fieldLocalPortClient': 'Connect port',
  'session.fieldTarget': 'Target',
  'session.fieldPayload': 'Payload',
  'session.btnStop': 'Stop session',
  'session.btnStart': 'Start',
  'session.recvShowLog': 'Show as log',
  'session.recvWrap': 'Wrap received data',
  'session.recvHide': 'Hide received payload',
  'session.recvScroll': 'Auto-scroll',
  'session.sendParseEscapes': 'Parse escape sequences',
  'session.sendLoop': 'Loop send',
  'session.loopMsAria': 'Loop interval (ms)',
  'session.output': 'Output',
  'session.exportLog': 'Export log JSON',
  'session.importLog': 'Import log JSON',
  'session.defaults': 'Defaults',
  'session.defaultsAria': 'Reset UI defaults',
  'session.disconnect': 'Disconnect / remove',
  'session.clearLog': 'Clear log',
  'session.clearInput': 'Clear input',
  'session.sendTarget': 'Send target',
  'session.payloadPlaceholder': 'ASCII / HEX payload; Enter does not send (use SEND)',
  'session.send': 'SEND',
  'session.sendPresetsSection': 'Outbound messages',
  'session.addPreset': 'Add message',
  'session.presetTitlePlaceholder': 'Title (e.g. terminal register)',
  'session.clearPresetBodies': 'Clear all message bodies',
  'session.loopPreset': 'Loop uses',
  'session.playSend': 'Send this message',
  'session.removePreset': 'Remove message',
  'session.resetStats': 'reset stats',
  'session.allTargets': 'All targets',
  'session.tabIdle': 'idle',

  'session.udpTargetTitle': 'Target settings',
  'session.udpTargetUnicastHint': 'Send to a single target address',
  'session.udpTargetMulticastHint': 'Send to joined multicast groups',
  'session.udpTargetBroadcastHint': 'Send to broadcast address',
  'session.udpTargetEndpoint': 'Target (host:port)',
  'session.udpTargetBroadcastLabel': 'Broadcast (host:port)',
  'session.udpMulticastGroups': 'Multicast groups',
  'session.udpMulticastAdd': 'Add multicast group',
  'session.udpMulticastGroupPlaceholder': '239.0.0.1:1900',
  'session.udpMulticastRemove': 'Remove',

  'mode.tcpServer': 'TCP Server',
  'mode.tcpClient': 'TCP Client',
  'mode.udpServer': 'UDP Server',
  'mode.udpClient': 'UDP Client',

  'err.portRange': 'Port must be 1–65535',
  'err.remotePortRange': 'Remote port must be 1–65535',
  'err.sendEmpty': 'Nothing to send',
  'err.importNotArray': 'Import file must be a JSON array',
  'err.importNoRecords': 'No valid log records',
  'err.importJsonFail': 'JSON parse failed',
  'err.udpMulticastEmpty': 'Add at least one multicast group (ip:port)',
  'err.udpMulticastPortMismatch': 'Multicast groups must use the same port',
  'err.udpEndpointInvalid': 'Invalid host:port',
} as const

export type MessageId = keyof typeof en

const zh: Record<MessageId, string> = {
  'app.mainTab': '主会话',
  'app.webviewTitle': '当前 Webview 标签（事件路由）',
  'app.settings': '设置',
  'app.closeTab': '关闭标签',
  'app.newTab': '新建会话标签',

  'settings.title': '设置',
  'settings.language': '语言',
  'settings.langZh': '中文',
  'settings.langEn': 'English',
  'settings.done': '完成',

  'session.cardSession': '会话 · Session',
  'session.cardRx': '接收 · RX',
  'session.cardTx': '发送 · TX',
  'session.fieldMode': '模式',
  'session.fieldRemoteHost': '远端主机',
  'session.fieldRemotePort': '远端端口',
  'session.fieldBind': '本机绑定',
  'session.fieldLocalPort': '本地端口',
  'session.fieldLocalPortClient': '连接端口',
  'session.fieldTarget': '目标',
  'session.fieldPayload': '载荷',
  'session.btnStop': '关闭会话',
  'session.btnStart': '启动',
  'session.recvShowLog': '作为日志显示',
  'session.recvWrap': '接收数据换行',
  'session.recvHide': '隐藏接收数据',
  'session.recvScroll': '自动滚动',
  'session.sendParseEscapes': '解析转义字符',
  'session.sendLoop': '循环发送',
  'session.loopMsAria': '循环间隔毫秒',
  'session.output': '输出',
  'session.exportLog': '导出报文 JSON',
  'session.importLog': '导入报文 JSON',
  'session.defaults': '默认',
  'session.defaultsAria': '恢复默认设置',
  'session.disconnect': '断开 / 移除',
  'session.clearLog': '清空日志',
  'session.clearInput': '清空输入',
  'session.sendTarget': '发送目标',
  'session.payloadPlaceholder': 'ASCII / HEX 载荷，Enter 不会发送（点 SEND）',
  'session.send': 'SEND',
  'session.sendPresetsSection': '下发报文',
  'session.addPreset': '添加报文',
  'session.presetTitlePlaceholder': '标题（如：终端注册）',
  'session.clearPresetBodies': '清空所有报文体',
  'session.loopPreset': '循环使用',
  'session.playSend': '发送该条报文',
  'session.removePreset': '删除此条',
  'session.resetStats': 'reset stats',
  'session.allTargets': '全部目标',
  'session.tabIdle': '未启动',

  'session.udpTargetTitle': '目标设置',
  'session.udpTargetUnicastHint': '发送到单一目标地址',
  'session.udpTargetMulticastHint': '发送到已加入的多播组',
  'session.udpTargetBroadcastHint': '发送到广播地址',
  'session.udpTargetEndpoint': '目标 (host:port)',
  'session.udpTargetBroadcastLabel': '广播 (host:port)',
  'session.udpMulticastGroups': '多播组',
  'session.udpMulticastAdd': '添加多播组',
  'session.udpMulticastGroupPlaceholder': '239.0.0.1:1900',
  'session.udpMulticastRemove': '移除',

  'mode.tcpServer': 'TCP Server',
  'mode.tcpClient': 'TCP Client',
  'mode.udpServer': 'UDP Server',
  'mode.udpClient': 'UDP Client',

  'err.portRange': '端口应为 1–65535',
  'err.remotePortRange': '远端端口应为 1–65535',
  'err.sendEmpty': '发送内容为空',
  'err.importNotArray': '导入文件应为 JSON 数组',
  'err.importNoRecords': '未解析到有效报文记录',
  'err.importJsonFail': 'JSON 解析失败',
  'err.udpMulticastEmpty': '请至少添加一个多播组 (ip:port)',
  'err.udpMulticastPortMismatch': '多播组必须使用相同端口',
  'err.udpEndpointInvalid': '无效的 host:port',
}

export const catalogs: Record<Locale, Record<MessageId, string>> = { en: en as Record<MessageId, string>, zh }

export const LOCALE_STORAGE_KEY = 'netocto.locale'
/** Previous app name; read once for migration */
export const LEGACY_LOCALE_STORAGE_KEY = 'networkcat.locale'

export function readStoredLocale(): Locale | null {
  try {
    let v = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (v !== 'zh' && v !== 'en') {
      v = localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY)
    }
    if (v === 'zh' || v === 'en') return v
  } catch {
    /* ignore */
  }
  return null
}

export function writeStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    try {
      localStorage.removeItem(LEGACY_LOCALE_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function initialLocale(): Locale {
  return readStoredLocale() ?? detectBrowserLocale()
}
