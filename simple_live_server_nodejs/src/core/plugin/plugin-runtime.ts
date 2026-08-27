/**
 * QuickJS 插件运行时
 *
 * 每个 plugin 一个独立 QuickJSContext，互不污染。
 * Host.* 桥通过 newFunction 注入到沙箱。
 * 额外注入浏览器兼容 shim（console / timers / TextEncoder / URL /
 * MessageChannel / process / performance.rAF / ...），让面向浏览器 API
 * 编写的 plugin（部分含 webpack 打包的浏览器 polyfill，如 douyin 的
 * a_bogus SDK）能在 QuickJS 沙箱中正常执行。
 */

import {
  getQuickJS,
  QuickJSContext,
  QuickJSHandle,
  QuickJSRuntime,
} from 'quickjs-emscripten';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { HostBridge, HostHttpRequestArgs } from './plugin-host-bridge.js';
import { PluginManifest } from './plugin-manifest.js';
import { CoreLog } from '../common/core-log.js';

export interface PluginRuntimeOptions {
  pluginId: string;
  rootDir: string;
  manifest: PluginManifest;
  host: HostBridge;
}

const BASE_GLOBALS_SCRIPT = `
  var __G = globalThis;
  var __lp_noop = function(){};
  function __lp_ensure(name, value) {
    try { if (__G[name] === undefined || __G[name] === null) __G[name] = value; } catch (e) {}
  }
  // performance
  if (typeof __G.performance === 'undefined' || __G.performance === null) {
    __G.performance = { now: function() { return Date.now(); } };
  }
  if (typeof __G.performance.now !== 'function') {
    __G.performance.now = function() { return Date.now(); };
  }
  // console（QuickJS 无内置 console，plugin 顶层 console.log 会 ReferenceError）
  __lp_ensure('console', { log: __lp_noop, info: __lp_noop, warn: __lp_noop, error: __lp_noop, debug: __lp_noop, trace: __lp_noop });
  // timers
  __lp_ensure('setTimeout', function(fn) { Promise.resolve().then(fn); return 0; });
  __lp_ensure('clearTimeout', __lp_noop);
  __lp_ensure('setInterval', function() { return 0; });
  __lp_ensure('clearInterval', __lp_noop);
  __lp_ensure('setImmediate', function(fn) { Promise.resolve().then(fn); return 0; });
  __lp_ensure('clearImmediate', __lp_noop);
  __lp_ensure('queueMicrotask', function(fn) { Promise.resolve().then(fn); });
  // TextEncoder / TextDecoder
  __lp_ensure('TextEncoder', function() {
    this.encode = function(s) {
      var out = [], c;
      for (var i = 0; i < s.length; i++) {
        c = s.charCodeAt(i);
        if (c < 128) out.push(c);
        else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63));
        else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
      }
      return new Uint8Array(out);
    };
  });
  __lp_ensure('TextDecoder', function() {
    this.decode = function(b) {
      var a = b instanceof Uint8Array ? b : new Uint8Array(b);
      var s = '';
      for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
      return s;
    };
  });
  // URL / URLSearchParams
  __lp_ensure('URL', function(u) {
    if (!(this instanceof URL)) return new URL(u);
    this.href = String(u);
    this.protocol = 'https:'; this.host = ''; this.hostname = '';
    this.pathname = ''; this.search = ''; this.hash = '';
    this.toString = function() { return this.href; };
  });
  __lp_ensure('URLSearchParams', function() {
    this.get = function() { return null; };
    this.set = __lp_noop; this.append = __lp_noop; this.toString = function() { return ''; };
  });
  // MessageChannel / MessagePort（webpack 调度器依赖）
  __lp_ensure('MessageChannel', function() {
    var port1 = { onmessage: null };
    var port2 = { onmessage: null };
    port1.postMessage = function(m) { var cb = port2.onmessage; if (cb) Promise.resolve().then(function(){ cb({data:m}); }); };
    port2.postMessage = function(m) { var cb = port1.onmessage; if (cb) Promise.resolve().then(function(){ cb({data:m}); }); };
    return { port1: port1, port2: port2 };
  });
  // process（webpack core-js 探测 "undefined"!=typeof process && "process"==Object.prototype.toString.call(process)）
  // Symbol.toStringTag='process' 让 isProcess 分支命中，使用 process.nextTick 避开有缺陷的回退路径
  if (typeof __G.process === 'undefined' || __G.process === null) {
    var __lp_proc = { nextTick: function(fn) { Promise.resolve().then(fn); }, env: { NODE_ENV: 'production' }, versions: {}, platform: 'linux' };
    try { Object.defineProperty(__lp_proc, Symbol.toStringTag, { value: 'process', configurable: true }); } catch (e) {}
    __G.process = __lp_proc;
  }
  if (typeof __G.performance.requestAnimationFrame !== 'function') {
    __G.performance.requestAnimationFrame = function(fn) { Promise.resolve().then(fn); return 0; };
  }
  // 浏览器中 window.requestAnimationFrame 与 performance.requestAnimationFrame 是同一函数；
  // 部分 plugin（douyin 的 a_bogus bdms SDK）会在 bytecode VM 里调用 window.requestAnimationFrame，
  // 但 plugin 自带的 env stub 只把 window 指向 globalThis，不会单独补这个属性。
  // 直接在 globalThis 上挂同名 shim，避免 SDK 走到 undefined 触发 "undefined is not a function"。
  if (typeof __G.requestAnimationFrame !== 'function') {
    var __lp_raf = __G.performance.requestAnimationFrame;
    __G.requestAnimationFrame = function(fn) { return __lp_raf.call(__G.performance, fn); };
  }
  __lp_ensure('cancelAnimationFrame', __lp_noop);
  __lp_ensure('requestIdleCallback', function(fn) { Promise.resolve().then(function(){ fn({ didTimeout: false, timeRemaining: function(){ return 16; } }); }); return 0; });
  __lp_ensure('cancelIdleCallback', __lp_noop);
  __lp_ensure('MutationObserver', function() { this.observe = __lp_noop; this.disconnect = __lp_noop; this.takeRecords = function(){ return []; }; });
  // atob / btoa
  __lp_ensure('atob', function(s) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    s = String(s).replace(/[^A-Za-z0-9+/=]/g, '');
    var out = '';
    for (var i = 0; i < s.length; i += 4) {
      var e1 = chars.indexOf(s[i]);
      var e2 = chars.indexOf(s[i+1]);
      var e3 = chars.indexOf(s[i+2]);
      var e4 = chars.indexOf(s[i+3]);
      out += String.fromCharCode((e1 << 2) | (e2 >> 4));
      if (e3 !== 64) out += String.fromCharCode(((e2 & 15) << 4) | (e3 >> 2));
      if (e4 !== 64) out += String.fromCharCode(((e3 & 3) << 6) | e4);
    }
    return out;
  });
  __lp_ensure('btoa', function(s) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var out = '';
    for (var i = 0; i < s.length; i += 3) {
      var b1 = s.charCodeAt(i) & 0xff;
      var b2 = i+1 < s.length ? s.charCodeAt(i+1) & 0xff : NaN;
      var b3 = i+2 < s.length ? s.charCodeAt(i+2) & 0xff : NaN;
      out += chars.charAt(b1 >> 2);
      out += chars.charAt(((b1 & 3) << 4) | (b2 >> 4));
      out += isNaN(b2) ? '=' : chars.charAt(((b2 & 15) << 2) | (b3 >> 6));
      out += isNaN(b3) ? '=' : chars.charAt((b3 & 3) << 2);
    }
    return out;
  });
  // crypto.getRandomValues（QuickJS 不带，abogus_bdms_env.js 会自行 stub，
  // 这里也兜底，避免 plugin 顶层直接调用 crypto.getRandomValues 报 ReferenceError）
  if (__G.crypto === undefined || __G.crypto === null || typeof __G.crypto.getRandomValues !== 'function') {
    var __lp_crypto = __G.crypto || {};
    __lp_crypto.getRandomValues = function(arr) {
      for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    };
    try { Object.defineProperty(__lp_crypto, Symbol.toStringTag, { value: 'crypto', configurable: true }); } catch (e) {}
    __G.crypto = __lp_crypto;
  }
`;

/**
 * 单个 plugin 的 QuickJS 运行时封装。
 */
export class PluginRuntime {
  readonly pluginId: string;
  readonly manifest: PluginManifest;
  readonly rootDir: string;
  readonly host: HostBridge;

  private ctx: QuickJSContext | null = null;
  private _ctx: QuickJSRuntime | null = null;
  private _pluginHandle: QuickJSHandle | null = null;
  private _disposed = false;

  constructor(options: PluginRuntimeOptions) {
    this.pluginId = options.pluginId;
    this.rootDir = options.rootDir;
    this.manifest = options.manifest;
    this.host = options.host;
  }

  async init(): Promise<void> {
    const qjs = await getQuickJS();
    this.ctx = qjs.newContext();
    this._ctx = this.ctx.runtime;

    const r1 = this.ctx.evalCode(BASE_GLOBALS_SCRIPT, 'globals.js');
    if (r1.error) {
      const dump = this.ctx.dump(r1.error);
      r1.error.dispose();
      throw new Error(`注入基础 globals 失败: ${String(dump)}`);
    }
    r1.value.dispose();

    const hostObj = this._buildHostObject();
    this.ctx.setProp(this.ctx.global, 'Host', hostObj);
    hostObj.dispose();
  }

  async loadScripts(): Promise<void> {
    if (!this.ctx) throw new Error('runtime 未初始化');
    const ctx = this.ctx;

    const preloadList = this.manifest.preloadScripts ?? [];
    for (const rel of preloadList) {
      const filePath = path.join(this.rootDir, rel);
      const code = await fsp.readFile(filePath, 'utf8');
      const result = ctx.evalCode(code, rel);
      if (result.error) {
        const dump = ctx.dump(result.error);
        let detail: string;
        if (typeof dump === 'string') {
          detail = dump;
        } else if (dump && typeof dump === 'object') {
          const obj = dump as { name?: unknown; message?: unknown; stack?: unknown };
          const name = obj.name != null ? String(obj.name) : typeof dump;
          const msg = obj.message != null ? String(obj.message) : '';
          const stack = obj.stack != null ? String(obj.stack) : '';
          detail = stack ? `${name}: ${msg}\n${stack}` : `${name}: ${msg || JSON.stringify(dump)}`;
        } else {
          detail = `${typeof dump}: ${String(dump)}`;
        }
        result.error.dispose();
        throw new Error(`执行 preload 失败 @${rel}: ${detail}`);
      }
      result.value.dispose();
    }

    const entryPath = path.join(this.rootDir, this.manifest.entry);
    const entryCode = await fsp.readFile(entryPath, 'utf8');
    const entryResult = ctx.evalCode(entryCode, this.manifest.entry);
    if (entryResult.error) {
      const dump = ctx.dump(entryResult.error);
      let detail: string;
      if (typeof dump === 'string') {
        detail = dump;
      } else if (dump && typeof dump === 'object') {
        const obj = dump as { name?: unknown; message?: unknown; stack?: unknown };
        const name = obj.name != null ? String(obj.name) : typeof dump;
        const msg = obj.message != null ? String(obj.message) : '';
        const stack = obj.stack != null ? String(obj.stack) : '';
        detail = stack ? `${name}: ${msg}\n${stack}` : `${name}: ${msg || JSON.stringify(dump)}`;
      } else {
        detail = `${typeof dump}: ${String(dump)}`;
      }
      entryResult.error.dispose();
      throw new Error(`执行 entry 失败: ${detail}`);
    }
    entryResult.value.dispose();

    const pluginObj = ctx.getProp(ctx.global, 'LiveParsePlugin');
    const dumped = ctx.dump(pluginObj);
    if (dumped === undefined || dumped === null) {
      pluginObj.dispose();
      throw new Error(
        `entry 执行后未找到 globalThis.LiveParsePlugin（pluginId=${this.pluginId}）`,
      );
    }
    if (typeof dumped !== 'object') {
      pluginObj.dispose();
      throw new Error(`LiveParsePlugin 不是 object（typeof=${typeof dumped}）`);
    }

    const apiVerHandle = ctx.getProp(pluginObj, 'apiVersion');
    const apiVerDumped = ctx.dump(apiVerHandle);
    apiVerHandle.dispose();
    const apiVersion = typeof apiVerDumped === 'number' ? apiVerDumped : -1;
    if (apiVersion !== 1) {
      pluginObj.dispose();
      throw new Error(`LiveParsePlugin.apiVersion 必须是 1，得到 ${apiVersion}`);
    }

    this._pluginHandle = pluginObj;
  }

  hasMethod(method: string): boolean {
    if (!this.ctx || !this._pluginHandle) return false;
    const handle = this.ctx.getProp(this._pluginHandle, method);
    const t = this.ctx.typeof(handle);
    handle.dispose();
    return t === 'function';
  }

  async callMethod(method: string, payload?: unknown): Promise<unknown> {
    if (!this.ctx || !this._pluginHandle) {
      throw new Error('runtime 未就绪');
    }
    const ctx = this.ctx;

    const methodHandle = ctx.getProp(this._pluginHandle, method);
    if (ctx.typeof(methodHandle) !== 'function') {
      methodHandle.dispose();
      throw new Error(`plugin 没有方法 ${method}`);
    }

    let payloadHandle: QuickJSHandle | null = null;
    if (payload !== undefined) {
      payloadHandle = marshalToHandle(ctx, payload);
    }

    let resultHandle: QuickJSHandle;
    try {
      if (payloadHandle) {
        resultHandle = ctx.callFunction(methodHandle, ctx.undefined, payloadHandle).unwrap();
      } else {
        resultHandle = ctx.callFunction(methodHandle, ctx.undefined).unwrap();
      }
    } catch (err) {
      methodHandle.dispose();
      if (payloadHandle) payloadHandle.dispose();
      throw new Error(`plugin.${method} 调用失败: ${
        err instanceof Error ? err.message : String(err)
      }`);
    }
    methodHandle.dispose();
    if (payloadHandle) payloadHandle.dispose();

    // 区分 Promise / 非 Promise 两种返回路径。
//  - Promise：转成 host Promise 并等待 settle（state == 'pending' 时走 resolvePromise）。
//  - 非 Promise：直接 dump resultHandle。
//
// 不要先 getPromiseState 拿 state.value 再 dispose resultHandle：
// QuickJS 内部 resultHandle 与 state.value 共享底层引用，
// 提前 dispose 会触发 Lifetime not alive。
    // 区分 Promise / 非 Promise 两种返回路径。
//  - Promise：轮询 drain jobs（host Promise 通过 setImmediate 让出事件循环），
//    最终通过 dump(resultHandle) 拿到 {type:'fulfilled', value:<inner>}
//  - 非 Promise：直接 dump
    if (
      this._ctx &&
      ctx.typeof(resultHandle) === 'object' &&
      !((ctx.getPromiseState(resultHandle) as { notAPromise?: boolean }).notAPromise)
    ) {
      const runtime = this._ctx;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const r = runtime.executePendingJobs(5);
        r.dispose();
        // 让出 Node 事件循环，让 host Promise（如 HTTP 请求）有机会 resolve
        await new Promise((r2) => setImmediate(r2));
        const state = ctx.getPromiseState(resultHandle);
        if (state.type === 'fulfilled' || state.type === 'rejected') break;
      }
      // dump(resultHandle) 内部会处理 fulfilled Promise 的 resolved value dispose
      const dumped = ctx.dump(resultHandle);
      if (dumped && typeof dumped === 'object' && 'type' in dumped) {
        if (dumped.type === 'rejected') {
          const err = (dumped as { error?: unknown }).error;
          const errMsg =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message: unknown }).message)
              : String(err);
          throw new Error(`plugin.${method} 抛错: ${errMsg}`);
        }
        if (dumped.type === 'fulfilled') {
          return (dumped as { value: unknown }).value;
        }
        throw new Error(`plugin.${method} Promise 未在超时内 settle`);
      }
      return dumped;
    }

    // 非 Promise 对象/原始值：直接 dump
    const value = ctx.dump(resultHandle);
    resultHandle.dispose();
    return value;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    try {
      this._pluginHandle?.dispose();
    } catch {
      // ignore
    }
    try {
      this.ctx?.dispose();
    } catch {
      // ignore
    }
    this._pluginHandle = null;
    this.ctx = null;
  }

  private _buildHostObject(): QuickJSHandle {
    if (!this.ctx) throw new Error('ctx 未初始化');
    const ctx = this.ctx;
    const bridge = this.host;
    const hostObj = ctx.newObject();

    // ---------- Host.http ----------
    const httpObj = ctx.newObject();
    ctx.newFunction('request', (...args) =>
      wrapPromise(
        ctx,
        bridge.httpRequest(ctx.dump(args[0]) as HostHttpRequestArgs).then((r) => ({
          statusCode: r.statusCode,
          status: r.status,
          headers: r.headers,
          bodyText: r.bodyText,
          bodyBytes: Array.from(r.bodyBytes ?? []),
          bodyBase64: r.bodyBase64 ?? '',
          url: r.url ?? '',
        })),
      ),
    ).consume((h) => ctx.setProp(httpObj, 'request', h));
    ctx.setProp(hostObj, 'http', httpObj);
    httpObj.dispose();

    // ---------- Host.crypto ----------
    const cryptoObj = ctx.newObject();
    ctx.newFunction('md5', (h) =>
      marshalToHandle(ctx, bridge.md5(String(ctx.dump(h)))),
    ).consume((h) => ctx.setProp(cryptoObj, 'md5', h));
    ctx.newFunction('sha256', (h) => {
      const v = ctx.dump(h);
      return marshalToHandle(
        ctx,
        bridge.sha256(typeof v === 'string' ? v : new Uint8Array(v as number[])),
      );
    }).consume((h) => ctx.setProp(cryptoObj, 'sha256', h));
    ctx.newFunction('base64Decode', (h) =>
      marshalToHandle(ctx, bridge.base64Decode(String(ctx.dump(h)))),
    ).consume((h) => ctx.setProp(cryptoObj, 'base64Decode', h));
    ctx.newFunction('base64Encode', (h) => {
      const v = ctx.dump(h);
      return marshalToHandle(
        ctx,
        bridge.base64Encode(typeof v === 'string' ? v : new Uint8Array(v as number[])),
      );
    }).consume((h) => ctx.setProp(cryptoObj, 'base64Encode', h));
    ctx.setProp(hostObj, 'crypto', cryptoObj);
    cryptoObj.dispose();

    // ---------- Host.runtime ----------
    const runtimeObj = ctx.newObject();
    ctx.newFunction('inflateZlib', (h) => {
      const v = ctx.dump(h);
      const arr = v instanceof Uint8Array ? v : new Uint8Array(v as number[]);
      return bytesToHandle(ctx, bridge.inflateZlib(arr));
    }).consume((h) => ctx.setProp(runtimeObj, 'inflateZlib', h));
    ctx.newFunction('inflateBrotli', (h) => {
      const v = ctx.dump(h);
      const arr = v instanceof Uint8Array ? v : new Uint8Array(v as number[]);
      return bytesToHandle(ctx, bridge.inflateBrotli(arr));
    }).consume((h) => ctx.setProp(runtimeObj, 'inflateBrotli', h));
    ctx.newFunction('inflateGzip', (h) => {
      const v = ctx.dump(h);
      const arr = v instanceof Uint8Array ? v : new Uint8Array(v as number[]);
      return bytesToHandle(ctx, bridge.inflateGzip(arr));
    }).consume((h) => ctx.setProp(runtimeObj, 'inflateGzip', h));
    ctx.setProp(hostObj, 'runtime', runtimeObj);
    runtimeObj.dispose();

    // ---------- Host.session ----------
    const sessionObj = ctx.newObject();
    ctx.newFunction('getCookieHeader', (h) => {
      const v = ctx.dump(h);
      return marshalToHandle(
        ctx,
        bridge.getCookieHeader(typeof v === 'string' ? v : undefined),
      );
    }).consume((h) => ctx.setProp(sessionObj, 'getCookieHeader', h));
    ctx.setProp(hostObj, 'session', sessionObj);
    sessionObj.dispose();

    // ---------- Host.platform_cookie ----------
    const cookieObj = ctx.newObject();
    ctx.newFunction('get', () => marshalToHandle(ctx, bridge.platformCookieGet())).consume(
      (h) => ctx.setProp(cookieObj, 'get', h),
    );
    ctx.newFunction('set', (h) => {
      bridge.platformCookieSet(String(ctx.dump(h)));
      return ctx.undefined;
    }).consume((h) => ctx.setProp(cookieObj, 'set', h));
    ctx.newFunction('clear', () => {
      bridge.platformCookieClear();
      return ctx.undefined;
    }).consume((h) => ctx.setProp(cookieObj, 'clear', h));
    ctx.setProp(hostObj, 'platform_cookie', cookieObj);
    cookieObj.dispose();

    // ---------- Host.json ----------
    const jsonObj = ctx.newObject();
    ctx.newFunction('parse', (h) => {
      try {
        return marshalToHandle(ctx, JSON.parse(String(ctx.dump(h))));
      } catch (e) {
        throw new Error(`JSON.parse: ${(e as Error).message}`);
      }
    }).consume((h) => ctx.setProp(jsonObj, 'parse', h));
    ctx.newFunction('stringify', (h) => {
      const v = ctx.dump(h);
      try {
        return marshalToHandle(ctx, JSON.stringify(v));
      } catch {
        return marshalToHandle(ctx, String(v));
      }
    }).consume((h) => ctx.setProp(jsonObj, 'stringify', h));
    ctx.setProp(hostObj, 'json', jsonObj);
    jsonObj.dispose();

    // ---------- Host.text ----------
    const textObj = ctx.newObject();
    ctx.newFunction('decode', (h, encH) => {
      const v = ctx.dump(h);
      const enc = encH ? String(ctx.dump(encH)) : undefined;
      const arr = v instanceof Uint8Array ? v : new Uint8Array(v as number[]);
      return marshalToHandle(ctx, bridge.textDecode(arr, enc));
    }).consume((h) => ctx.setProp(textObj, 'decode', h));
    ctx.newFunction('encode', (h, encH) => {
      const enc = encH ? String(ctx.dump(encH)) : undefined;
      const out = bridge.textEncode(String(ctx.dump(h)), enc);
      return bytesToHandle(ctx, out);
    }).consume((h) => ctx.setProp(textObj, 'encode', h));
    ctx.setProp(hostObj, 'text', textObj);
    textObj.dispose();

    // ---------- Host.base64 ----------
    const base64Obj = ctx.newObject();
    ctx.newFunction('encode', (h) => {
      const v = ctx.dump(h);
      return marshalToHandle(
        ctx,
        bridge.base64Encode(typeof v === 'string' ? v : new Uint8Array(v as number[])),
      );
    }).consume((h) => ctx.setProp(base64Obj, 'encode', h));
    ctx.newFunction('decode', (h) => {
      const v = ctx.dump(h);
      return marshalToHandle(ctx, bridge.base64Decode(typeof v === 'string' ? v : ''));
    }).consume((h) => ctx.setProp(base64Obj, 'decode', h));
    ctx.setProp(hostObj, 'base64', base64Obj);
    base64Obj.dispose();

    // ---------- Host.console ----------
    const consoleObj = ctx.newObject();
    const makeLog = (level: string) =>
      ctx.newFunction(level, (...rest) => {
        const parts = rest.map((h) => ctx.dump(h));
        bridge.consoleLog(level, ...parts);
        return ctx.undefined;
      });
    makeLog('log').consume((h) => ctx.setProp(consoleObj, 'log', h));
    makeLog('info').consume((h) => ctx.setProp(consoleObj, 'info', h));
    makeLog('warn').consume((h) => ctx.setProp(consoleObj, 'warn', h));
    makeLog('error').consume((h) => ctx.setProp(consoleObj, 'error', h));
    ctx.setProp(hostObj, 'console', consoleObj);
    consoleObj.dispose();

    // ---------- Host.danmaku ----------
    const danmakuObj = ctx.newObject();
    ctx.newFunction('emit', (sessionIdH, msgH) => {
      const sid = String(ctx.dump(sessionIdH));
      const ok = bridge.danmakuEmit(sid, ctx.dump(msgH));
      return marshalToHandle(ctx, ok);
    }).consume((h) => ctx.setProp(danmakuObj, 'emit', h));
    ctx.newFunction('close', (sessionIdH, reasonH) => {
      const sid = String(ctx.dump(sessionIdH));
      const reason = String(ctx.dump(reasonH));
      const ok = bridge.danmakuClose(sid, reason);
      return marshalToHandle(ctx, ok);
    }).consume((h) => ctx.setProp(danmakuObj, 'close', h));
    ctx.setProp(hostObj, 'danmaku', danmakuObj);
    danmakuObj.dispose();

    // ---------- Host.makeError / Host.raise ----------
    ctx.newFunction('makeError', (codeH, msgH, ctxH) => {
      const code = String(ctx.dump(codeH));
      const msg = String(ctx.dump(msgH));
      const c = ctxH ? ctx.dump(ctxH) : undefined;
      return marshalToHandle(
        ctx,
        JSON.stringify({
          __lp_error__: true,
          code,
          message: msg,
          context: c,
        }),
      );
    }).consume((h) => ctx.setProp(hostObj, 'makeError', h));
    ctx.newFunction('raise', (codeH, msgH, ctxH) => {
      const code = String(ctx.dump(codeH));
      const msg = String(ctx.dump(msgH));
      void ctxH;
      const text = `[plugin:${bridge.pluginId}] ${code}: ${msg}`;
      throw new Error(text);
    }).consume((h) => ctx.setProp(hostObj, 'raise', h));

    return hostObj;
  }
}

// ================== helpers ==================

function marshalToHandle(ctx: QuickJSContext, value: unknown): QuickJSHandle {
  if (value === undefined) return ctx.undefined;
  if (value === null) return ctx.null;
  if (typeof value === 'boolean') return value ? ctx.true : ctx.false;
  if (typeof value === 'number') return ctx.newNumber(value);
  if (typeof value === 'string') return ctx.newString(value);
  if (typeof value === 'bigint') return ctx.newBigInt(value);
  if (value instanceof Uint8Array) return bytesToHandle(ctx, value);
  if (Array.isArray(value)) {
    const arr = ctx.newArray();
    value.forEach((item, idx) => {
      const h = marshalToHandle(ctx, item);
      ctx.setProp(arr, idx, h);
      h.dispose();
    });
    return arr;
  }
  if (typeof value === 'object') {
    const obj = ctx.newObject();
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const h = marshalToHandle(ctx, v);
      ctx.setProp(obj, k, h);
      h.dispose();
    }
    return obj;
  }
  return ctx.newString(String(value));
}

function bytesToHandle(ctx: QuickJSContext, bytes: Uint8Array): QuickJSHandle {
  const arr = ctx.newArray();
  for (let i = 0; i < bytes.length; i++) {
    const h = ctx.newNumber(bytes[i]);
    ctx.setProp(arr, i, h);
    h.dispose();
  }
  return arr;
}

function wrapPromise(ctx: QuickJSContext, p: Promise<unknown>): QuickJSHandle {
  const deferred = ctx.newPromise();
  p.then(
    (v) => {
      const handle = marshalToHandle(ctx, v);
      deferred.resolve(handle);
      handle.dispose();
    },
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      const errorHandle = ctx.newError(msg);
      deferred.reject(errorHandle);
      errorHandle.dispose();
    },
  );
  return deferred.handle;
}