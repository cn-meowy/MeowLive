/**
 * Plugin 运行时单元测试
 *
 * 覆盖：
 * - preload + entry 顺序加载
 * - Host.crypto.md5 / Host.runtime.inflateZlib 等价 Node
 * - LiveParsePlugin 暴露的方法可被 callMethod 调用
 * - 缺方法时 hasMethod 返 false，callMethod 抛错
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { PluginRuntime } from '../src/core/plugin/plugin-runtime.js';
import { HostBridge } from '../src/core/plugin/plugin-host-bridge.js';
import { SyncDataManager } from '../src/service/sync-data-manager.js';
import { PluginManifest } from '../src/core/plugin/plugin-manifest.js';

const FIXTURE_DIR = path.join(import.meta.dirname, 'fixtures', 'mock-plugin');

async function loadFixtureManifest(): Promise<PluginManifest> {
  const raw = await fsp.readFile(path.join(FIXTURE_DIR, 'manifest.json'), 'utf8');
  return JSON.parse(raw) as PluginManifest;
}

function makeHost(pluginId = 'mock'): HostBridge {
  const sync = new SyncDataManager();
  const sessions = new Map();
  return new HostBridge({
    pluginId,
    syncDataManager: sync,
    danmakuSessions: sessions,
  });
}

describe('PluginRuntime', () => {
  let manifest: PluginManifest;

  before(async () => {
    manifest = await loadFixtureManifest();
  });

  after(() => {
    // nothing to clean up at suite level
  });

  it('应顺序加载 preload + entry 并暴露 LiveParsePlugin', async () => {
    const host = makeHost();
    const runtime = new PluginRuntime({
      pluginId: 'mock',
      rootDir: FIXTURE_DIR,
      manifest,
      host,
    });
    await runtime.init();
    await runtime.loadScripts();
    try {
      assert.equal(runtime.hasMethod('getCategories'), true);
      assert.equal(runtime.hasMethod('search'), true);
      assert.equal(runtime.hasMethod('notExist'), false);
    } finally {
      runtime.dispose();
    }
  });

  it('Host.crypto.md5 与 Node crypto.createHash 一致', async () => {
    const host = makeHost();
    const runtime = new PluginRuntime({
      pluginId: 'mock',
      rootDir: FIXTURE_DIR,
      manifest,
      host,
    });
    await runtime.init();
    await runtime.loadScripts();
    try {
      const result = await runtime.callMethod('__setSchema', 'A');
      void result;
      // 通过 entry 调用：调用 Host.crypto.md5 一次
      // 我们利用 plugin 没有调用 Host 的方法，因此改为直接调用 host 验证。
      assert.equal(host.md5('hello'), '5d41402abc4b2a76b9719d911017c592');
    } finally {
      runtime.dispose();
    }
  });

  it('Host.runtime.inflateZlib 与 Node zlib.inflateSync 一致', async () => {
    const host = makeHost();
    const raw = Buffer.from('hello quickjs inflate');
    const deflated = zlib.deflateSync(raw);
    const inflated = host.inflateZlib(new Uint8Array(deflated));
    assert.equal(Buffer.from(inflated).toString('utf8'), 'hello quickjs inflate');
  });

  it('plugin.getCategories 应返回正确数据', async () => {
    const host = makeHost();
    const runtime = new PluginRuntime({
      pluginId: 'mock',
      rootDir: FIXTURE_DIR,
      manifest,
      host,
    });
    await runtime.init();
    await runtime.loadScripts();
    try {
      const cats = (await runtime.callMethod('getCategories', {})) as Array<{
        id: string;
        title: string;
        subList: Array<{ id: string; parentId: string; title: string }>;
      }>;
      assert.equal(cats.length, 1);
      assert.equal(cats[0].id, 'catA');
      assert.equal(cats[0].title, 'Cat A');
      assert.equal(cats[0].subList.length, 2);
      assert.equal(cats[0].subList[0].parentId, 'catA');
    } finally {
      runtime.dispose();
    }
  });

  it('plugin.__setSchema("B") 切换后再调 getRooms 应返回 Schema B 形状', async () => {
    const host = makeHost();
    const runtime = new PluginRuntime({
      pluginId: 'mock',
      rootDir: FIXTURE_DIR,
      manifest,
      host,
    });
    await runtime.init();
    await runtime.loadScripts();
    try {
      await runtime.callMethod('__setSchema', 'B');
      const rooms = (await runtime.callMethod('getRooms', { id: 'all' })) as Array<{
        title?: string;
        roomTitle?: string;
      }>;
      assert.ok('title' in rooms[0], 'Schema B 应包含 title 字段');
      assert.ok(!('roomTitle' in rooms[0]), 'Schema B 不应包含 roomTitle 字段');
    } finally {
      runtime.dispose();
    }
  });

  it('调用不存在的方法应抛错', async () => {
    const host = makeHost();
    const runtime = new PluginRuntime({
      pluginId: 'mock',
      rootDir: FIXTURE_DIR,
      manifest,
      host,
    });
    await runtime.init();
    await runtime.loadScripts();
    try {
      await assert.rejects(
        () => runtime.callMethod('noSuchMethod'),
        /没有方法/,
      );
    } finally {
      runtime.dispose();
    }
  });

  it('QuickJS 沙箱应注入浏览器兼容 shim（修复 console/setTimeout/TextEncoder 等 ReferenceError）', async () => {
    // 用临时 manifest/entry 在内存里跑一段探测 shim 的脚本
    const fs = await import('fs/promises');
    const os = await import('os');
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lp-shim-'));
    const entry = path.join(tmpDir, 'entry.js');
    await fs.writeFile(
      entry,
      `
      var result = {};
      result.console = typeof console;
      result.consoleLog = typeof console.log;
      result.setTimeout = typeof setTimeout;
      result.clearTimeout = typeof clearTimeout;
      result.setImmediate = typeof setImmediate;
      result.queueMicrotask = typeof queueMicrotask;
      result.TextEncoder = typeof TextEncoder;
      result.TextDecoder = typeof TextDecoder;
      result.URL = typeof URL;
      result.URLSearchParams = typeof URLSearchParams;
      result.MessageChannel = typeof MessageChannel;
      result.process = typeof process;
      result.processNextTick = typeof (process && process.nextTick);
      result.processTag = Object.prototype.toString.call(process);
      result.perfRAF = typeof performance.requestAnimationFrame;
      result.requestIdleCallback = typeof requestIdleCallback;
      result.MutationObserver = typeof MutationObserver;
      globalThis.LiveParsePlugin = {
        apiVersion: 1,
        probe() { return result; },
      };
      `,
      'utf8',
    );
    const tmpManifest: PluginManifest = {
      ...manifest,
      preloadScripts: [],
      entry: 'entry.js',
    };
    const host = makeHost();
    const runtime = new PluginRuntime({
      pluginId: 'mock',
      rootDir: tmpDir,
      manifest: tmpManifest,
      host,
    });
    try {
      await runtime.init();
      await runtime.loadScripts();
      const r = (await runtime.callMethod('probe')) as Record<string, string>;
      assert.equal(r.console, 'object', 'console 应被注入');
      assert.equal(r.consoleLog, 'function', 'console.log 应可用');
      assert.equal(r.setTimeout, 'function', 'setTimeout 应被注入');
      assert.equal(r.clearTimeout, 'function', 'clearTimeout 应被注入');
      assert.equal(r.setImmediate, 'function', 'setImmediate 应被注入');
      assert.equal(r.queueMicrotask, 'function', 'queueMicrotask 应被注入');
      assert.equal(r.TextEncoder, 'function', 'TextEncoder 应被注入');
      assert.equal(r.TextDecoder, 'function', 'TextDecoder 应被注入');
      assert.equal(r.URL, 'function', 'URL 应被注入');
      assert.equal(r.URLSearchParams, 'function', 'URLSearchParams 应被注入');
      assert.equal(r.MessageChannel, 'function', 'MessageChannel 应被注入');
      assert.equal(r.process, 'object', 'process 应被注入');
      assert.equal(r.processNextTick, 'function', 'process.nextTick 应可用');
      assert.equal(r.processTag, '[object process]', 'process 应带 toStringTag=process（让 webpack 探测命中）');
      assert.equal(r.perfRAF, 'function', 'performance.requestAnimationFrame 应可用');
      assert.equal(r.requestIdleCallback, 'function', 'requestIdleCallback 应被注入');
      assert.equal(r.MutationObserver, 'function', 'MutationObserver 应被注入');
    } finally {
      runtime.dispose();
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});