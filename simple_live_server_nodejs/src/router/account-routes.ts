/**
 * 账号路由
 *
 * 挂载到 /api/v1/sites/:siteId/account，提供扫码登录、Cookie、用户名管理接口。
 *
 * 端点：
 * - POST /qr/generate       生成二维码（仅 bilibili）
 * - GET  /qr/poll           轮询扫码状态（仅 bilibili）
 * - GET  /username          读取用户名
 * - PUT  /username          写入用户名
 * - DELETE /username        删除用户名
 * - GET  /login-info        Phase 3：返回登录方式元数据（决定 tvOS 渲染哪种 UI）
 * - GET  /status            Phase 3：单站点凭据状态快照
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LiveSiteService } from '../service/live-site-service.js';
import { SyncDataManager } from '../service/sync-data-manager.js';
import { CredentialStatusCache } from '../service/credential-status-cache.js';
import { sendJson, sendBadRequest, sendError, sendCustomError } from './route-helpers.js';

/**
 * 注册账号路由
 */
export async function registerAccountRoutes(
  app: FastifyInstance,
  service: LiveSiteService,
  manager: SyncDataManager,
  cache?: CredentialStatusCache,
): Promise<void> {

  // POST /api/v1/sites/:siteId/account/qr/generate - 生成二维码
  app.post(
    '/api/v1/sites/:siteId/account/qr/generate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };

        if (siteId !== 'bilibili') {
          sendCustomError(reply, 404, `平台 ${siteId} 不支持扫码登录`);
          return;
        }

        const result = await service.generateBilibiliQR();
        sendJson(reply, result);
      } catch (e) {
        req.log.error({ err: e }, '生成二维码失败');
        sendError(reply, e);
      }
    },
  );

  // GET /api/v1/sites/:siteId/account/qr/poll - 轮询扫码状态
  app.get(
    '/api/v1/sites/:siteId/account/qr/poll',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };
        const query = req.query as Record<string, unknown>;

        if (siteId !== 'bilibili') {
          sendCustomError(reply, 404, `平台 ${siteId} 不支持扫码登录`);
          return;
        }

        const qrcodeKey = query['qrcodeKey'] as string | undefined;
        if (!qrcodeKey) {
          sendBadRequest(reply, '缺少 qrcodeKey 参数');
          return;
        }

        const result = await service.pollBilibiliQR(qrcodeKey);
        sendJson(reply, result);
      } catch (e) {
        req.log.error({ err: e }, '轮询扫码状态失败');
        sendError(reply, e);
      }
    },
  );

  // GET /api/v1/sites/:siteId/account/username - 读取用户名
  app.get(
    '/api/v1/sites/:siteId/account/username',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };
        const username = manager.getUsername(siteId);
        sendJson(reply, { username: username ?? '' });
      } catch (e) {
        req.log.error({ err: e }, '读取用户名失败');
        sendError(reply, e);
      }
    },
  );

  // PUT /api/v1/sites/:siteId/account/username - 写入用户名
  app.put(
    '/api/v1/sites/:siteId/account/username',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };
        const body = req.body as Record<string, unknown> | undefined;

        if (!body) {
          sendBadRequest(reply, '请求体不能为空');
          return;
        }

        const username = body['username'] as string | undefined;
        if (username === undefined || username === null) {
          sendBadRequest(reply, 'username 字段不能为空');
          return;
        }

        manager.setUsername(siteId, username);
        sendJson(reply, { siteId, username });
      } catch (e) {
        req.log.error({ err: e }, '写入用户名失败');
        sendError(reply, e);
      }
    },
  );

  // DELETE /api/v1/sites/:siteId/account/username - 删除用户名
  app.delete(
    '/api/v1/sites/:siteId/account/username',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };
        manager.deleteUsername(siteId);
        sendJson(reply, { siteId, deleted: true });
      } catch (e) {
        req.log.error({ err: e }, '删除用户名失败');
        sendError(reply, e);
      }
    },
  );

  // GET /api/v1/sites/:siteId/account/login-info - Phase 3 登录方式元数据
  app.get(
    '/api/v1/sites/:siteId/account/login-info',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };
        const info = buildLoginInfo(siteId, service, cache);
        sendJson(reply, info);
      } catch (e) {
        req.log.error({ err: e }, '读取 login-info 失败');
        sendError(reply, e);
      }
    },
  );

  // GET /api/v1/sites/:siteId/account/status - Phase 3 凭据状态
  app.get(
    '/api/v1/sites/:siteId/account/status',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { siteId } = req.params as { siteId: string };
        if (!cache) {
          sendJson(reply, {
            state: 'unknown',
            userId: '',
            userName: '',
            expireAt: 0,
            message: 'credentialStatus cache 未启用',
            checkedAt: 0,
            source: 'cache',
          });
          return;
        }
        const status = cache.getSync(siteId);
        // 冷启动时同步触发一次刷新（不阻塞响应）
        if (status.checkedAt === 0) {
          void cache.refresh(siteId);
        }
        sendJson(reply, status);
      } catch (e) {
        req.log.error({ err: e }, '读取 account status 失败');
        sendError(reply, e);
      }
    },
  );
}

function buildLoginInfo(
  siteId: string,
  service: LiveSiteService,
  cache?: CredentialStatusCache,
): Record<string, unknown> {
  // 优先查 plugin manifest
  const installed = service.getInstalledPlugins();
  const plugin = installed.find((p) => p.pluginId === siteId);

  if (plugin) {
    const auth = plugin.manifest.auth;
    const loginFlow = plugin.manifest.loginFlow;
    if (auth?.required === false) {
      return {
        type: 'none',
        supportsStatusCheck: false,
        supportsValidation: false,
      };
    }
    if (loginFlow?.kind === 'webview' || (auth?.credentialKinds ?? []).includes('cookie')) {
      return {
        type: 'cookie',
        loginURL: loginFlow?.loginURL,
        cookieDomains: loginFlow?.cookieDomains,
        authSignalCookies: loginFlow?.authSignalCookies,
        uidCookieNames: loginFlow?.uidCookieNames,
        userAgent: loginFlow?.userAgent,
        requiredCookieHint: loginFlow?.requiredCookieHint,
        supportsStatusCheck: auth?.supportsStatusCheck === true,
        supportsValidation: auth?.supportsValidation === true,
      };
    }
    return {
      type: 'qr',
      supportsStatusCheck: auth?.supportsStatusCheck === true,
      supportsValidation: auth?.supportsValidation === true,
    };
  }

  // 内置平台
  switch (siteId) {
    case 'bilibili':
      return {
        type: 'qr',
        supportsStatusCheck: true,
        supportsValidation: true,
      };
    case 'douyin':
      return {
        type: 'cookie',
        loginURL: 'https://www.douyin.com',
        requiredCookieHint: '自定义 ttwid 可提升画质',
        supportsStatusCheck: false,
        supportsValidation: false,
      };
    case 'local':
      return {
        type: 'none',
        hint: '配置本地用户名',
        supportsStatusCheck: false,
        supportsValidation: false,
      };
    default:
      return {
        type: 'none',
        supportsStatusCheck: false,
        supportsValidation: false,
        _credentialStatus: cache?.getSync(siteId),
      };
  }
}
