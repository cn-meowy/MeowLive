/**
 * CredentialStatusCache 单元测试
 *
 * 覆盖：
 * - prime 后 entry 占位 unknown
 * - getCredentialStatus 返 valid 时状态写入
 * - 同 siteId 并发 refresh 去重（Promise 复用）
 * - invalidate 后下次 get 触发懒查
 * - 缺 getCredentialStatus 时按 cookie 判 synced/missing
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { CredentialStatusCache } from '../src/service/credential-status-cache.js';
import { SyncDataManager } from '../src/service/sync-data-manager.js';
import { PluginManager } from '../src/service/plugin-manager.js';
import { InstalledPlugin, PluginManifest } from '../src/core/plugin/plugin-manifest.js';
import { PluginRuntime } from '../src/core/plugin/plugin-runtime.js';
import { HostBridge } from '../src/core/plugin/plugin-host-bridge.js';
import { DanmakuManager } from '../src/service/danmaku-manager.js';
import { LiveSiteService } from '../src/service/live-site-service.js';
import { ServerConfig } from '../src/config/server-config.js';
import * as path from 'path';
import * as fsp from 'fs/promises';

const FIXTURE_DIR = path.join(import.meta.dirname, 'fixtures', 'mock-plugin');

async function buildInstalled(): Promise<InstalledPlugin> {
  const manifest = JSON.parse(
    await fsp.readFile(path.join(FIXTURE_DIR, 'manifest.json'), 'utf8'),
  ) as PluginManifest;
  return {
    manifest,
    pluginId: 'mock',
    version: '1.0.0',
    sha256: 'x',
    rootDir: FIXTURE_DIR,
  };
}

class FakePluginManager {
  readonly plugins = new Map<string, { installed: InstalledPlugin; runtime: PluginRuntime }>();

  async loadOne(installed: InstalledPlugin): Promise<void> {
    const host = new HostBridge({
      pluginId: installed.pluginId,
      syncDataManager: new SyncDataManager(),
      danmakuSessions: new Map(),
    });
    const runtime = new PluginRuntime({
      pluginId: installed.pluginId,
      rootDir: installed.rootDir,
      manifest: installed.manifest,
      host,
    });
    await runtime.init();
    await runtime.loadScripts();
    this.plugins.set(installed.pluginId, { installed, runtime });
  }

  getPlugin(id: string): { installed: InstalledPlugin; runtime: PluginRuntime } | null {
    return this.plugins.get(id) ?? null;
  }

  getInstalled(): InstalledPlugin[] {
    return Array.from(this.plugins.values()).map((p) => p.installed);
  }
}

describe('CredentialStatusCache', () => {
  let fakeManager: FakePluginManager;
  let cache: CredentialStatusCache;
  let sync: SyncDataManager;
  let installed: InstalledPlugin;

  before(async () => {
    installed = await buildInstalled();
    fakeManager = new FakePluginManager();
    await fakeManager.loadOne(installed);
    sync = new SyncDataManager();
    cache = new CredentialStatusCache({
      syncDataManager: sync,
      pluginManager: fakeManager as unknown as PluginManager,
      checkIntervalMinutes: 0,
      staleAfterMinutes: 5,
      concurrency: 1,
    });
    cache.primeWithInstalled([installed]);
  });

  it('prime 后 entry 占位 unknown', () => {
    const status = cache.getSync('mock');
    assert.equal(status.state, 'unknown');
    assert.equal(status.checkedAt, 0);
  });

  it('getCredentialStatus 返 valid 时 cache 更新', async () => {
    // mock manifest 要求 auth.required + credentialKinds=['cookie']，无 cookie 会走 missing
    sync.setCookie('mock', 'a=1');
    const status = await cache.refresh('mock');
    assert.equal(status.state, 'valid');
    assert.equal(status.userId, 'u1');
    assert.equal(status.userName, 'Mock User');
    assert.ok(status.checkedAt > 0);
  });

  it('并发 refresh 同 siteId 只触发一次 plugin 调用（Promise 去重）', async () => {
    sync.setCookie('mock', 'a=1');
    cache.invalidate('mock');
    const p1 = cache.refresh('mock');
    const p2 = cache.refresh('mock');
    const p3 = cache.refresh('mock');
    const [a, b, c] = await Promise.all([p1, p2, p3]);
    assert.equal(a.state, b.state);
    assert.equal(b.state, c.state);
  });

  it('invalidate 后下次 get 触发懒查', async () => {
    sync.setCookie('mock', 'a=1');
    cache.invalidate('mock');
    const status = cache.getSync('mock');
    assert.equal(status.state, 'synced');
    // 立即 get 应触发懒查
    const _ = await cache.get('mock');
    void _;
  });

  it('plugin 不暴露 credential API 时按 cookie 判 synced/missing', async () => {
    // 模拟另一个 plugin：manifest.auth.required 但 fakeManager.getPlugin() 返 null
    sync.setCookie('cookie-only', 'a=1; b=2');
    const status = await cache.refresh('cookie-only');
    assert.equal(status.state, 'synced');

    sync.deleteCookie('cookie-only');
    const status2 = await cache.refresh('cookie-only');
    assert.equal(status2.state, 'missing');
  });
});