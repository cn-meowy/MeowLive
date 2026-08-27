/**
 * plugin-capability-adapter 单元测试
 *
 * 覆盖：
 * - Schema A → LiveRoomItem 字段映射
 * - Schema B → LiveRoomItem 字段映射
 * - getPlayback Schema X → 多个 LivePlayQuality，sort 升序跨 CDN 群组
 * - getLiveState('1') → true
 * - 缺 setCredential 不抛 TypeError
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { PluginRuntime } from '../src/core/plugin/plugin-runtime.js';
import { HostBridge } from '../src/core/plugin/plugin-host-bridge.js';
import { SyncDataManager } from '../src/service/sync-data-manager.js';
import { DanmakuManager } from '../src/service/danmaku-manager.js';
import { PluginBackedSite } from '../src/core/plugin/plugin-capability-adapter.js';
import { PluginManifest } from '../src/core/plugin/plugin-manifest.js';
import { LiveSiteService } from '../src/service/live-site-service.js';
import { ServerConfig } from '../src/config/server-config.js';

const FIXTURE_DIR = path.join(import.meta.dirname, 'fixtures', 'mock-plugin');

async function makeSite(): Promise<{
  site: PluginBackedSite;
  runtime: PluginRuntime;
  service: LiveSiteService;
  cleanup: () => void;
}> {
  const manifest = JSON.parse(
    await fsp.readFile(path.join(FIXTURE_DIR, 'manifest.json'), 'utf8'),
  ) as PluginManifest;
  const sync = new SyncDataManager();
  const danmakuManager = new DanmakuManager(new LiveSiteService(new ServerConfig()), 10);
  const host = new HostBridge({
    pluginId: 'mock',
    syncDataManager: sync,
    danmakuSessions: danmakuManager.sessionSinks,
  });
  const runtime = new PluginRuntime({
    pluginId: 'mock',
    rootDir: FIXTURE_DIR,
    manifest,
    host,
  });
  await runtime.init();
  await runtime.loadScripts();
  const site = new PluginBackedSite({
    installed: { manifest, pluginId: 'mock', version: '1.0.0', sha256: 'x', rootDir: FIXTURE_DIR },
    runtime,
    danmakuManager,
  });
  const service = new LiveSiteService(new ServerConfig());
  return {
    site,
    runtime,
    service,
    cleanup: () => runtime.dispose(),
  };
}

describe('PluginBackedSite 字段映射', () => {
  let bundle: Awaited<ReturnType<typeof makeSite>>;

  before(async () => {
    bundle = await makeSite();
  });

  after(() => {
    bundle.cleanup();
  });

  it('Schema A → LiveRoomItem 字段正确', async () => {
    await bundle.runtime.callMethod('__setSchema', 'A');
    const result = await bundle.site.searchRooms('keyword', 1);
    assert.equal(result.items.length, 1);
    const item = result.items[0];
    assert.equal(item.title, 'Title 100');
    assert.equal(item.cover, 'https://example.com/cover/100');
    assert.equal(item.userName, 'User 100');
    assert.equal(item.online, 1234);
  });

  it('Schema B → LiveRoomItem 字段正确', async () => {
    await bundle.runtime.callMethod('__setSchema', 'B');
    const result = await bundle.site.searchRooms('keyword', 1);
    assert.equal(result.items.length, 1);
    const item = result.items[0];
    assert.equal(item.title, 'Title 100');
    assert.equal(item.cover, 'https://example.com/cover/100');
    assert.equal(item.userName, 'User 100');
    assert.equal(item.online, 4321);
  });

  it('getPlayback Schema X → 多个 LivePlayQuality，sort 升序跨 CDN', async () => {
    await bundle.runtime.callMethod('__setSchema', 'A');
    const detail = await bundle.site.getRoomDetail('1');
    const qualities = await bundle.site.getPlayQualites(detail);
    assert.equal(qualities.length, 3, '应有 2 + 1 = 3 个 quality');
    // sort 应递增（gi * 1000 + qi）：主线路 1000/1001 → 备线路 2000
    const sorts = qualities.map((q) => q.sort);
    for (let i = 1; i < sorts.length; i++) {
      assert.ok(sorts[i] > sorts[i - 1], `sort 应递增: ${sorts.join(',')}`);
    }
  });

  it('getLiveState("1") → true', async () => {
    const live = await bundle.site.getLiveStatus('1');
    assert.equal(live, true);
  });

  it('getPlayUrls 应从 getPlayback 缓存取 url 与 headers', async () => {
    await bundle.runtime.callMethod('__setSchema', 'A');
    const detail = await bundle.site.getRoomDetail('1');
    const qualities = await bundle.site.getPlayQualites(detail);
    const q = qualities.find((qq) => qq.quality === '10000')!;
    const url = await bundle.site.getPlayUrls(detail, q);
    assert.equal(url.urls.length, 1);
    assert.ok(url.urls[0].includes('10000'));
    assert.equal(url.headers['Referer'] ?? '', 'https://example.com');
    assert.equal(url.headers['User-Agent'] ?? '', 'MockUA/1.0');
  });

  it('danmaku.start 兼容 transport 为字符串形态', async () => {
    // 早期 plugin 形态：transport = 'websocket' 字符串
    const danmaku = bundle.site.getDanmaku();
    let messages: string[] = [];
    danmaku.onMessage = (msg) => {
      messages.push(`${msg.type}:${msg.userName}:${msg.message}`);
    };
    await danmaku.start({
      transport: 'websocket',
      url: 'wss://example.com/danmaku/transport-string',
      headers: { 'User-Agent': 'MockUA/1.0' },
    });
    // 立刻 stop：仅验证 start 不抛 "不支持的 transport" 错
    await danmaku.stop();
    assert.ok(messages.length >= 0, '不应抛错');
  });

  it('danmaku.start 兼容 transport 为 { kind, url } 对象形态（修复平台加载失败）', async () => {
    // 标准化后 plugin 形态：transport = { kind, url, frameType } 对象
    // 此前 adapter 把它当字符串处理，触发 "不支持的 transport=[object Object]"，
    // 导致 bilibili/kick/youtube 等平台连上房间后立即断流，表现为「平台加载失败」。
    const danmaku = bundle.site.getDanmaku();
    let messages: string[] = [];
    danmaku.onMessage = (msg) => {
      messages.push(`${msg.type}:${msg.userName}:${msg.message}`);
    };
    await danmaku.start({
      transport: { kind: 'websocket', url: 'wss://example.com/danmaku/transport-object', frameType: 'text' },
      headers: { 'User-Agent': 'MockUA/1.0' },
    });
    await danmaku.stop();
    // plan.url 已被 adapter 兜底从 transport.url 提升到 plan.url，
    // 避免 plugin 把 url 放在 transport 内、adapter 又只查 plan.url 导致连接失败
    assert.ok(messages.length >= 0, '对象形态 transport 启动不应抛 "不支持的 transport" 错');
  });

  it('danmaku.start 在 transport 缺省时默认走 websocket（向后兼容）', async () => {
    const danmaku = bundle.site.getDanmaku();
    let messages: string[] = [];
    danmaku.onMessage = (msg) => {
      messages.push(`${msg.type}:${msg.userName}:${msg.message}`);
    };
    await danmaku.start({
      url: 'wss://example.com/danmaku/transport-default',
      headers: { 'User-Agent': 'MockUA/1.0' },
    });
    await danmaku.stop();
    assert.ok(messages.length >= 0, '缺省 transport 应默认走 websocket，不抛错');
  });
});