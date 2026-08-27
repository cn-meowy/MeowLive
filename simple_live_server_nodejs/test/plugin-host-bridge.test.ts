/**
 * Host bridge 单元测试
 *
 * 覆盖 Host.http.request：
 * - 嵌套形参（新式 plugin）：{ platformId, authMode, request: { url, ... } }
 * - 扁平形参（旧式 plugin）：{ url, method, headers, bodyBase64, timeout }
 * - timeout 按 **秒** 解析（默认 20s）
 * - bodyBase64 字段支持
 * - 响应字段：statusCode / status（数值）/ url（最终重定向地址）/ bodyBase64
 * - authMode='platform_cookie' 自动注入 Cookie 头
 *
 * 注入 axios adapter 来拦截实际 HTTP 调用，断言请求参数与响应映射。
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { HostBridge } from '../src/core/plugin/plugin-host-bridge.js';
import { SyncDataManager } from '../src/service/sync-data-manager.js';

function makeHost(opts: { pluginId?: string; cookie?: string } = {}) {
  const sync = new SyncDataManager();
  if (opts.cookie) sync.setCookie(opts.pluginId ?? 'mock', opts.cookie);
  // 用一个不走网络的 axios 实例，仅用于结构检查
  const http = axios.create({ validateStatus: () => true });
  const sessions = new Map<string, { sendText: (t: string) => void; close: (r: string) => void }>();
  const bridge = new HostBridge({
    pluginId: opts.pluginId ?? 'mock',
    syncDataManager: sync,
    http,
    danmakuSessions: sessions,
  });
  return { bridge, sync, http };
}

describe('Host.http.request', () => {
  it('应支持嵌套形参（新式 plugin）', async () => {
    const { bridge } = makeHost();
    // 拦截 http.request
    (bridge as unknown as { http: { request: (cfg: unknown) => Promise<unknown> } }).http.request =
      async (cfg: unknown) => {
        const c = cfg as { url: string; method: string; headers: Record<string, string>; data?: Buffer; timeout: number };
        assert.equal(c.url, 'https://api.example.com/foo');
        assert.equal(c.method, 'POST');
        assert.equal(c.headers['X-Token'], 'abc');
        assert.equal(c.timeout, 20000); // 默认 20s -> 20000ms
        return {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          data: Buffer.from('{"ok":1}'),
          request: { res: { responseUrl: 'https://api.example.com/foo' } },
        };
      };
    const r = await bridge.httpRequest({
      platformId: 'mock',
      authMode: 'none',
      request: {
        url: 'https://api.example.com/foo',
        method: 'POST',
        headers: { 'X-Token': 'abc' },
        body: '{"k":1}',
      },
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.status, 200);
    assert.equal(r.bodyText, '{"ok":1}');
    assert.equal(r.url, 'https://api.example.com/foo');
    assert.ok(typeof r.bodyBase64 === 'string' && r.bodyBase64.length > 0);
  });

  it('应支持扁平形参（旧式 plugin，如 cc/douyu/huya/qie/twitch/youtube/yy）', async () => {
    const { bridge } = makeHost();
    (bridge as unknown as { http: { request: (cfg: unknown) => Promise<unknown> } }).http.request =
      async (cfg: unknown) => {
        const c = cfg as { url: string; method: string; headers: Record<string, string>; data?: Buffer; timeout: number };
        assert.equal(c.url, 'https://api.example.com/list');
        assert.equal(c.method, 'GET');
        // timeout 20 表示 20 秒 -> 20000ms（修复前会被当成 20ms 而超时）
        assert.equal(c.timeout, 20000);
        // bodyBase64 应被解码为 Buffer 写入 data
        assert.ok(c.data);
        assert.equal((c.data as Buffer).toString('utf8'), 'hello');
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          data: Buffer.from('[]'),
          request: { res: { responseUrl: 'https://api.example.com/list' } },
        };
      };
    const r = await bridge.httpRequest({
      url: 'https://api.example.com/list',
      method: 'GET',
      headers: { 'User-Agent': 'X' },
      bodyBase64: Buffer.from('hello', 'utf8').toString('base64'),
      timeout: 20,
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.status, 200);
    assert.equal(r.bodyText, '[]');
  });

  it('应将 timeout(秒) 转换为毫秒传给 axios（修复 "timeout of 20ms exceeded"）', async () => {
    const { bridge } = makeHost();
    const captured: number[] = [];
    (bridge as unknown as { http: { request: (cfg: unknown) => Promise<unknown> } }).http.request =
      async (cfg: unknown) => {
        captured.push((cfg as { timeout: number }).timeout);
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          data: Buffer.from(''),
          request: { res: { responseUrl: '' } },
        };
      };
    await bridge.httpRequest({ request: { url: 'https://x', timeout: 6 } });
    await bridge.httpRequest({ url: 'https://x', timeout: 12 });
    assert.deepEqual(captured, [6000, 12000]);
  });

  it('缺失 url 应抛错', async () => {
    const { bridge } = makeHost();
    await assert.rejects(() => bridge.httpRequest({}), /缺少 url/);
  });

  it('authMode=platform_cookie 应自动注入 syncDataManager 中的 cookie', async () => {
    const { bridge } = makeHost({ pluginId: 'bili', cookie: 'SESSDATA=xyz' });
    let capturedHeaders: Record<string, string> | undefined;
    (bridge as unknown as { http: { request: (cfg: unknown) => Promise<unknown> } }).http.request =
      async (cfg: unknown) => {
        capturedHeaders = (cfg as { headers: Record<string, string> }).headers;
        return { status: 200, statusText: 'OK', headers: {}, data: Buffer.from(''), request: { res: { responseUrl: '' } } };
      };
    await bridge.httpRequest({
      platformId: 'bili',
      authMode: 'platform_cookie',
      request: { url: 'https://x', headers: { 'User-Agent': 'U' } },
    });
    assert.equal(capturedHeaders?.['Cookie'], 'SESSDATA=xyz');
    assert.equal(capturedHeaders?.['User-Agent'], 'U');
  });

  it('响应应包含 statusCode/status(body 数值)/url/bodyBase64', async () => {
    const { bridge } = makeHost();
    (bridge as unknown as { http: { request: (cfg: unknown) => Promise<unknown> } }).http.request =
      async () => ({
        status: 302,
        statusText: 'Found',
        headers: { location: 'https://final.example.com/x' },
        data: Buffer.from('hi'),
        request: { res: { responseUrl: 'https://final.example.com/x' } },
      });
    const r = await bridge.httpRequest({ request: { url: 'https://start.example.com/x' } });
    assert.equal(r.statusCode, 302);
    assert.equal(r.status, 302);
    assert.equal(typeof r.status, 'number');
    assert.equal(r.url, 'https://final.example.com/x');
    assert.equal(r.bodyText, 'hi');
    assert.equal(r.bodyBase64, Buffer.from('hi').toString('base64'));
  });
});
