/**
 * 插件管理路由（管理员入口）
 *
 * - GET  /api/v1/plugins/health   列出已加载 plugin + 状态
 * - POST /api/v1/plugins/reload   重新加载指定 pluginId
 * - POST /api/v1/plugins/reseed   重新扫描 src/plugins/ 目录
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PluginManager } from '../service/plugin-manager.js';
import { sendJson, sendBadRequest } from './route-helpers.js';
import { LiveSiteService } from '../service/live-site-service.js';

export async function registerPluginRoutes(
  app: FastifyInstance,
  pluginManager: PluginManager,
  service?: LiveSiteService,
): Promise<void> {
  app.get('/api/v1/plugins/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    const installed = pluginManager.getInstalled();
    const data = {
      installed: installed.map((p) => ({
        pluginId: p.pluginId,
        version: p.version,
        displayName: p.manifest.displayName,
        sha256: p.sha256.slice(0, 16) + '…',
        auth: {
          required: p.manifest.auth?.required ?? false,
          kinds: p.manifest.auth?.credentialKinds ?? [],
        },
        capabilities: Object.fromEntries(
          Object.entries(p.manifest.capabilities ?? {}).map(([k, v]) => [
            k,
            v && typeof v === 'object' && 'status' in v ? (v as { status: string }).status : '?',
          ]),
        ),
        loadedAt: p.loadedAt ?? 0,
        loadError: p.loadError,
      })),
      disabled: Array.from(pluginManager.disabledList),
    };
    sendJson(reply, data);
  });

  app.post('/api/v1/plugins/reload', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const pluginId = typeof body['pluginId'] === 'string' ? (body['pluginId'] as string) : '';
      if (!pluginId) {
        sendBadRequest(reply, '缺少 pluginId 字段');
        return;
      }
      const ok = await pluginManager.reload(pluginId);
      sendJson(reply, { pluginId, reloaded: ok });
    } catch (e) {
      reply.code(500).send({
        code: 500,
        data: null,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  });

  app.post('/api/v1/plugins/reseed', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await pluginManager.rescan();
      // 同步 LiveSiteService 端的 sites Map 和 _installedPlugins
      if (service) {
        const nextSites = new Map<string, unknown>();
        for (const p of pluginManager.getInstalled()) {
          const loaded = pluginManager.getPlugin(p.pluginId);
          if (loaded) nextSites.set(p.pluginId, loaded.site);
        }
        service.applyPlugins(
          nextSites as never,
          pluginManager.getInstalled(),
        );
      }
      sendJson(reply, result);
    } catch (e) {
      reply.code(500).send({
        code: 500,
        data: null,
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  });

  // 插件静态资源：/api/v1/plugins/assets/<pluginId>/<filename>
  // 提供插件站点图标等素材（如 mini_live_card_<siteId>.png），供 app 端直接渲染，
  // 也是 /api/v1/sites 返回的 logo 字段指向的资源。
  app.get(
    '/api/v1/plugins/assets/:pluginId/:filename',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { pluginId, filename } = req.params as {
        pluginId: string;
        filename: string;
      };
      const plugin = pluginManager
        .getInstalled()
        .find((p) => p.pluginId === pluginId);
      if (!plugin) {
        reply.code(404).send('Not Found');
        return;
      }

      const assetDir = path.resolve(path.join(plugin.rootDir, 'assets'));
      const resolved = path.resolve(path.join(assetDir, filename));
      // 安全检查：防止路径遍历
      if (!resolved.startsWith(assetDir + path.sep)) {
        reply.code(403).send('Forbidden');
        return;
      }

      try {
        const stat = await fs.promises.stat(resolved);
        if (stat.isFile()) {
          const ext = path.extname(resolved).toLowerCase();
          const contentType =
            ext === '.png'
              ? 'image/png'
              : ext === '.jpg' || ext === '.jpeg'
                ? 'image/jpeg'
                : ext === '.gif'
                  ? 'image/gif'
                  : ext === '.webp'
                    ? 'image/webp'
                    : 'application/octet-stream';
          reply.header('Content-Type', contentType);
          reply.header('Cache-Control', 'public, max-age=86400');
          reply.header('Access-Control-Allow-Origin', '*');
          const data = await fs.promises.readFile(resolved);
          reply.send(data);
        } else {
          reply.code(404).send('Not Found');
        }
      } catch {
        reply.code(404).send('Not Found');
      }
    },
  );
}