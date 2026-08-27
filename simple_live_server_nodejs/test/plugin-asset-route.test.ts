/**
 * 插件静态资源路由单元测试
 *
 * 覆盖：
 * - /api/v1/plugins/assets/<pluginId>/<filename> 正常返回 PNG
 * - 文件不存在返回 404
 * - 插件不存在返回 404
 * - 路径遍历防护返回 403
 */

import { describe, it, before, after } from 'node:test';
// @ts-ignore
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerPluginRoutes } from '../src/router/plugin-routes.js';
import { PluginManager } from '../src/service/plugin-manager.js';
import type { InstalledPlugin } from '../src/core/plugin/plugin-manifest.js';

describe('插件静态资源路由', () => {
  let tmpDir: string;
  let app: ReturnType<typeof Fastify>;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-asset-test-'));
    const assetDir = path.join(tmpDir, 'assets');
    await fs.mkdir(assetDir, { recursive: true });
    // 1x1 png 最小文件
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    await fs.writeFile(path.join(assetDir, 'mini_live_card_mock.png'), pngBuffer);

    const plugin: InstalledPlugin = {
      pluginId: 'mock',
      version: '1.0.0',
      sha256: 'x'.repeat(64),
      rootDir: tmpDir,
      manifest: {
        apiVersion: 1,
        pluginId: 'mock',
        version: '1.0.0',
        displayName: 'Mock',
        entry: 'index.js',
        auth: { required: false, credentialKinds: [] },
        capabilities: {},
      },
    };

    const fakeManager = {
      getInstalled: () => [plugin],
    } as unknown as PluginManager;

    app = Fastify();
    registerPluginRoutes(app, fakeManager);
    await app.ready();
  });

  after(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('应返回插件 assets 中的 PNG', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/assets/mock/mini_live_card_mock.png',
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.ok(res.body.length > 0, '应返回文件内容');
  });

  it('文件不存在应返回 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/assets/mock/nope.png',
    });
    assert.equal(res.statusCode, 404);
  });

  it('插件不存在应返回 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/assets/unknown/mini_live_card_unknown.png',
    });
    assert.equal(res.statusCode, 404);
  });

  it('路径遍历应被拒绝返回 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/plugins/assets/mock/..%2F..%2F..%2Fetc%2Fpasswd',
    });
    assert.equal(res.statusCode, 403);
  });
});