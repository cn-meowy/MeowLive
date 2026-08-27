/**
 * 插件 manifest.json 的 TypeScript 类型（apiVersion 1）
 *
 * 本类型仅声明宿主侧读取的字段，对未知字段保持宽容（不阻塞加载）。
 */

export interface PluginAuthSpec {
  required: boolean;
  credentialKinds: Array<'cookie' | 'username' | 'token' | string>;
  supportsStatusCheck?: boolean;
  supportsValidation?: boolean;
}

export interface PluginLoginFlow {
  kind: 'webview' | 'qr' | 'cookie' | string;
  loginURL?: string;
  cookieDomains?: string[];
  authSignalCookies?: string[];
  uidCookieNames?: string[];
  successURLKeyword?: string;
  successTitleKeyword?: string;
  userAgent?: string;
  postRedirectDelay?: number;
  requiredCookieHint?: string;
  websiteHost?: string;
}

export interface PluginCapabilityStatus {
  status: 'available' | 'partial' | 'unavailable' | string;
  reason?: string;
  driver?: string;
  transport?: 'websocket' | 'http_polling' | 'websocket_sockjs' | string;
  protocolId?: string;
  protocolVersion?: string;
}

export interface PluginCapabilities {
  categories?: PluginCapabilityStatus;
  rooms?: PluginCapabilityStatus;
  playback?: PluginCapabilityStatus;
  search?: PluginCapabilityStatus;
  roomDetail?: PluginCapabilityStatus;
  liveState?: PluginCapabilityStatus;
  shareResolve?: PluginCapabilityStatus;
  danmaku?: PluginCapabilityStatus;
}

export interface PluginManifest {
  apiVersion: number;
  pluginId: string;
  version: string;
  platform?: string;
  displayName: string;
  platformDescription?: string;
  liveTypes?: string[];
  entry: string;
  preloadScripts?: string[];
  auth: PluginAuthSpec;
  loginFlow?: PluginLoginFlow;
  capabilities: PluginCapabilities;
  changelog?: string[];
  icon?: string;
  visibility?: 'public' | 'private' | string;
  shareResolve?: { hosts?: string[]; keywords?: string[] };
  hostBehavior?: Record<string, unknown>;
  [extra: string]: unknown;
}

/** 解析后的 manifest，连同 zip 来源 sha256、版本一起打包 */
export interface InstalledPlugin {
  manifest: PluginManifest;
  pluginId: string;
  version: string;
  sha256: string;
  /** 磁盘绝对路径（含 entry/preloadScripts 等相对路径的根） */
  rootDir: string;
  /** 加载错误（解析/eval 阶段失败时记录） */
  loadError?: string;
  /** 加载成功时间（unix ms） */
  loadedAt?: number;
}