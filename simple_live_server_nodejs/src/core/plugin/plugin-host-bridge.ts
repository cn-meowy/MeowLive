/**
 * Host.* 桥接对象
 *
 * 暴露给 plugin JS 的宿主 API 集合，对应 §2 实现矩阵。
 * 通过 plugin-runtime 转 QuickJSHandle 注入到 QuickJS context.global.Host。
 *
 * 设计要点：
 * - 不暴露 JS callback（避免 QuickJS 跨上下文回调 deref 复杂度）。
 * - 弹幕消息通过 Host.danmaku.emit(sessionId, msg) 由宿主控制反转写回 client WS。
 * - HTTP / Crypto / Runtime 直接转发到 Node 侧。
 *
 * Host.http.request 形参兼容两代 plugin 写法：
 *   新式（嵌套）：{ platformId?, authMode?, request: { url, method, headers, body | bodyBase64, timeout } }
 *   旧式（扁平）：{ url, method, headers, body | bodyBase64, timeout, platformId?, authMode? }
 *
 * timeout 一律按 **秒** 解析（默认 20s），与 plugin 端约定一致。
 */

import * as crypto from 'crypto';
import * as zlib from 'zlib';
import axios, { AxiosInstance } from 'axios';
import { QuickJSHandle } from 'quickjs-emscripten';
import { SyncDataManager } from '../../service/sync-data-manager.js';
import { CoreLog } from '../common/core-log.js';

/** Host.http.request 形参（兼容嵌套/扁平两代写法） */
export interface HostHttpRequestArgs {
  platformId?: string;
  authMode?: 'platform_cookie' | 'cookie' | 'none';
  request?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array;
    bodyBase64?: string;
    timeout?: number;
  };
  // 旧式扁平字段
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  bodyBase64?: string;
  timeout?: number;
}

export interface HostHttpResponse {
  /** HTTP 状态码（数值） */
  statusCode: number;
  /** 同 statusCode，向后兼容 */
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  bodyBytes?: Uint8Array;
  bodyBase64?: string;
  /** 跟随重定向后的最终 URL */
  url?: string;
}

/** Host.danmaku.emit 的目标 session 描述 */
export interface DanmakuSessionSink {
  /** 写入 client WS 的文本帧 */
  sendText(text: string): void;
  /** 主动关闭 client WS */
  close(reason: string): void;
}

/**
 * Host bridge 构造器选项
 */
export interface HostBridgeOptions {
  pluginId: string;
  syncDataManager: SyncDataManager;
  http?: AxiosInstance;
  /**
   * sessionId -> 客户端 WS sink
   * 由 DanmakuManager 在创建 danmaku session 时注册、销毁时反注册。
   */
  danmakuSessions: Map<string, DanmakuSessionSink>;
}

/**
 * Host bridge
 *
 * 提供 JS 对象字面量形态的 API；最终由 plugin-runtime 调 toQuickJS()
 * 转成 QuickJSHandle 放到 sandbox globalThis.Host。
 */
export class HostBridge {
  readonly pluginId: string;
  readonly syncDataManager: SyncDataManager;
  private readonly http: AxiosInstance;
  readonly danmakuSessions: Map<string, DanmakuSessionSink>;

  constructor(options: HostBridgeOptions) {
    this.pluginId = options.pluginId;
    this.syncDataManager = options.syncDataManager;
    this.http =
      options.http ??
      axios.create({
        timeout: 20000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
    this.danmakuSessions = options.danmakuSessions;
  }

  // ======================== Host.http ========================

  /**
   * 真实 HTTP 调用，被 plugin 调用前由 runtime 包装一层（参数来自 sandbox）。
   */
  async httpRequest(args: HostHttpRequestArgs): Promise<HostHttpResponse> {
    // 兼容嵌套 / 扁平两种调用形参
    const inner = args.request ?? {};
    const url = inner.url ?? args.url;
    if (!url) {
      throw new Error('Host.http.request: 缺少 url');
    }
    const method = inner.method ?? args.method;
    const headers: Record<string, string> = { ...(inner.headers ?? args.headers ?? {}) };
    const bodyRaw = inner.body ?? args.body;
    const bodyBase64 = inner.bodyBase64 ?? args.bodyBase64;
    // plugin 端 timeout 一律按 **秒** 解析（默认 20s）；host 内部转毫秒给 axios
    const timeoutSec = inner.timeout ?? args.timeout ?? 20;
    const timeoutMs = Math.max(1, Math.floor(timeoutSec * 1000));

    const platformId = args.platformId ?? this.pluginId;

    // authMode: 注入 Cookie 头
    if (args.authMode === 'platform_cookie') {
      const cookie = this.syncDataManager.getCookie(platformId);
      if (cookie) {
        headers['Cookie'] = cookie;
      }
    }
    // 'cookie' / 'none'：透传，plugin 自己负责 Cookie 头或不注入

    let bodyBuf: Buffer | undefined;
    if (bodyRaw !== undefined && bodyRaw !== null) {
      bodyBuf =
        typeof bodyRaw === 'string'
          ? Buffer.from(bodyRaw, 'utf8')
          : Buffer.from(bodyRaw);
    } else if (typeof bodyBase64 === 'string' && bodyBase64.length > 0) {
      bodyBuf = Buffer.from(bodyBase64, 'base64');
    }

    const resp = await this.http.request({
      url,
      method: (method ?? 'GET').toUpperCase(),
      headers,
      data: bodyBuf,
      timeout: timeoutMs,
      responseType: 'arraybuffer',
      transformResponse: (x) => x,
      // 不自动跟随超过一次的循环重定向，避免插件传错 url 导致无限循环
      maxRedirects: 10,
    });

    const buf = Buffer.from(resp.data as ArrayBuffer);
    const bodyText = buf.toString('utf8');
    const headerObj: Record<string, string> = {};
    for (const [k, v] of Object.entries(resp.headers ?? {})) {
      headerObj[k] = Array.isArray(v) ? v.join(',') : String(v);
    }

    return {
      statusCode: resp.status,
      status: resp.status,
      headers: headerObj,
      bodyText,
      bodyBytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      bodyBase64: buf.toString('base64'),
      url: (resp.request?.res?.responseUrl as string | undefined) ?? url,
    };
  }

  // ======================== Host.crypto ========================

  md5(input: string): string {
    return crypto.createHash('md5').update(input, 'utf8').digest('hex');
  }

  sha256(input: string | Uint8Array): string {
    const h = crypto.createHash('sha256');
    if (typeof input === 'string') h.update(input, 'utf8');
    else h.update(Buffer.from(input));
    return h.digest('hex');
  }

  /** xhs 1.0.20+ 要求的 UTF-8 安全 base64 解码 */
  base64Decode(input: string): string {
    return Buffer.from(input, 'base64').toString('utf8');
  }

  base64Encode(input: string | Uint8Array): string {
    if (typeof input === 'string') {
      return Buffer.from(input, 'utf8').toString('base64');
    }
    return Buffer.from(input).toString('base64');
  }

  // ======================== Host.runtime ========================

  inflateZlib(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(zlib.inflateSync(Buffer.from(bytes)));
  }

  inflateBrotli(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(zlib.brotliDecompressSync(Buffer.from(bytes)));
  }

  inflateGzip(bytes: Uint8Array): Uint8Array {
    return new Uint8Array(zlib.gunzipSync(Buffer.from(bytes)));
  }

  // ======================== Host.session ========================

  getCookieHeader(hostname?: string): string {
    // hostname 当前用于日志；platformId 由 plugin 注入路径推导出
    const cookie = this.syncDataManager.getCookie(this.pluginId);
    if (!cookie) return '';
    return cookie;
  }

  // ======================== Host.platform_cookie ========================

  platformCookieGet(): string {
    return this.syncDataManager.getCookie(this.pluginId) ?? '';
  }

  platformCookieSet(cookie: string): void {
    this.syncDataManager.setCookie(this.pluginId, cookie);
  }

  platformCookieClear(): void {
    this.syncDataManager.deleteCookie(this.pluginId);
  }

  // ======================== Host.json / Host.text / Host.console ========================

  jsonParse(text: string): unknown {
    return JSON.parse(text);
  }

  jsonStringify(value: unknown): string {
    return JSON.stringify(value);
  }

  textDecode(bytes: Uint8Array, encoding?: string): string {
    return new TextDecoder(encoding ?? 'utf-8').decode(
      new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );
  }

  textEncode(text: string, encoding?: string): Uint8Array {
    void encoding;
    return new TextEncoder().encode(text);
  }

  consoleLog(level: string, ...args: unknown[]): void {
    const msg = args
      .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
      .join(' ');
    switch (level) {
      case 'warn':
        CoreLog.warn(`[plugin:${this.pluginId}] ${msg}`);
        break;
      case 'error':
        CoreLog.error(`[plugin:${this.pluginId}] ${msg}`);
        break;
      default:
        CoreLog.info(`[plugin:${this.pluginId}] ${msg}`);
        break;
    }
  }

  // ======================== Host.danmaku ========================

  danmakuEmit(sessionId: string, msg: unknown): boolean {
    const sink = this.danmakuSessions.get(sessionId);
    if (!sink) return false;
    try {
      sink.sendText(
        typeof msg === 'string' ? msg : JSON.stringify(msg),
      );
      return true;
    } catch (err) {
      CoreLog.warn(
        `[HostBridge:${this.pluginId}] danmaku emit failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  danmakuClose(sessionId: string, reason: string): boolean {
    const sink = this.danmakuSessions.get(sessionId);
    if (!sink) return false;
    try {
      sink.close(reason);
    } catch {
      // ignore
    }
    return true;
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}