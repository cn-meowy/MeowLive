/**
 * 平台/分类/推荐/搜索 路由
 *
 * 对应 Dart 版 simple_live_server/lib/router/site_router.dart
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { LiveSiteService } from '../service/live-site-service.js';
import { LiveSubCategory } from '../core/index.js';
import {
  sendJson,
  sendBadRequest,
  sendError,
  getPage,
  sendJsonWithCredential,
} from './route-helpers.js';
import { CredentialStatusCache } from '../service/credential-status-cache.js';
import { CoreLog } from '../core/common/core-log.js';

/**
 * 注册平台/分类/推荐/搜索路由
 *
 * 所有路由挂载在 /api/v1 前缀下
 */
export async function registerSiteRoutes(
  app: FastifyInstance,
  service: LiveSiteService,
  cache?: CredentialStatusCache,
): Promise<void> {
  // 获取所有平台
  app.get('/api/v1/sites', async (_req: FastifyRequest, reply: FastifyReply) => {
    sendJson(reply, service.getSites());
  });

  // 获取分类列表
  app.get('/api/v1/sites/:siteId/categories', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const categories = await service.getCategories(siteId);
      sendJsonWithCredential(
        reply,
        siteId,
        categories.map((c) => LiveSiteService.categoryToJson(c)),
        cache ?? null,
      );
    } catch (e) {
      req.log.error({ err: e }, '获取分类列表失败');
      sendError(reply, e);
    }
  });

  // 获取推荐房间
  app.get('/api/v1/sites/:siteId/recommend', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const page = getPage(req.query as Record<string, unknown>);
      const result = await service.getRecommendRooms(siteId, page);

      const base = LiveSiteService.categoryResultToJson(result);
      const payload = annotateRecommendEmpty(siteId, base, service, cache ?? null);
      sendJsonWithCredential(reply, siteId, payload, cache ?? null);
    } catch (e) {
      req.log.error({ err: e }, '获取推荐房间失败');
      sendError(reply, e);
    }
  });

  // 获取分类下房间
  // categoryId 可能含逗号（虎牙/抖音），用 query 参数传递更安全
  app.get('/api/v1/sites/:siteId/categories/rooms', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const query = req.query as Record<string, unknown>;
      const page = getPage(query);
      const categoryId = query['categoryId'] as string | undefined;
      const parentId = (query['parentId'] as string) ?? '';
      const name = (query['name'] as string) ?? '';

      if (!categoryId) {
        sendBadRequest(reply, '缺少 categoryId 参数');
        return;
      }

      // 重建 LiveSubCategory
      const category = new LiveSubCategory(categoryId, name, parentId);

      const result = await service.getCategoryRooms(siteId, category, page);
      sendJsonWithCredential(
        reply,
        siteId,
        LiveSiteService.categoryResultToJson(result),
        cache ?? null,
      );
    } catch (e) {
      req.log.error({ err: e }, '获取分类下房间失败');
      sendError(reply, e);
    }
  });

  // 搜索直播间
  app.get('/api/v1/sites/:siteId/search/rooms', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const query = req.query as Record<string, unknown>;
      const keyword = (query['keyword'] as string) ?? '';
      const page = getPage(query);

      if (!keyword) {
        sendBadRequest(reply, '缺少 keyword 参数');
        return;
      }

      const result = await service.searchRooms(siteId, keyword, page);
      sendJsonWithCredential(
        reply,
        siteId,
        LiveSiteService.searchRoomResultToJson(result),
        cache ?? null,
      );
    } catch (e) {
      req.log.error({ err: e }, '搜索直播间失败');
      sendError(reply, e);
    }
  });

  // 搜索主播
  app.get('/api/v1/sites/:siteId/search/anchors', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { siteId } = req.params as { siteId: string };
      const query = req.query as Record<string, unknown>;
      const keyword = (query['keyword'] as string) ?? '';
      const page = getPage(query);

      if (!keyword) {
        sendBadRequest(reply, '缺少 keyword 参数');
        return;
      }

      const result = await service.searchAnchors(siteId, keyword, page);
      sendJsonWithCredential(
        reply,
        siteId,
        LiveSiteService.searchAnchorResultToJson(result),
        cache ?? null,
      );
    } catch (e) {
      req.log.error({ err: e }, '搜索主播失败');
      sendError(reply, e);
    }
  });
}

/**
 * 标注「平台需要登录但当前未登录」的情况
 *
 * 触发条件：
 * 1. plugin manifest 要求登录（auth.required === true）
 * 2. credential cache 状态为 missing / unknown / expired / invalid / risk_control
 *
 * 两种使用场景：
 * - items 为空：纯「未登录导致无数据」错误，UI 必须显示登录提示
 * - items 非空（已通过内置 fallback 拿到数据）：登录态下能展示更多 / 更高画质
 *   推荐内容，UI 仍可展示「登录后查看更多」横幅
 *
 * 满足时在 data 内追加：
 * - notLoggedIn: true
 * - notLoggedInHint: 中文提示，告知前端渲染「请先登录」横幅
 *
 * 其它场景（无需登录的平台、已登录等）保持原样。
 */
function annotateRecommendEmpty(
  siteId: string,
  data: Record<string, unknown>,
  service: LiveSiteService,
  cache: CredentialStatusCache | null,
): Record<string, unknown> {
  const plugin = service.getInstalledPlugins().find((p) => p.pluginId === siteId);
  const requiresAuth = plugin?.manifest.auth?.required === true;
  if (!requiresAuth) return data;
  if (!cache) return data;

  const state = cache.getSync(siteId).state;
  const notLoggedIn =
    state === 'missing' ||
    state === 'unknown' ||
    state === 'expired' ||
    state === 'invalid' ||
    state === 'risk_control';
  if (!notLoggedIn) return data;

  const items = Array.isArray(data['items']) ? (data['items'] as unknown[]) : [];
  if (items.length === 0) {
    CoreLog.info(
      `[site-routes.recommend] ${siteId} 返回空数据且未登录 (state=${state})，追加 notLoggedIn 标注`,
    );
  }

  const hint = buildNotLoggedInHint(siteId, plugin?.manifest.displayName ?? siteId);
  return {
    ...data,
    notLoggedIn: true,
    notLoggedInHint: hint,
  };
}

function buildNotLoggedInHint(siteId: string, displayName: string): string {
  if (siteId === 'bilibili') {
    return '当前未登录哔哩哔哩账号，部分推荐内容已隐藏，请前往账号页扫码登录后重试';
  }
  return `当前未登录${displayName}账号，推荐内容依赖登录态，请前往账号页登录后重试`;
}

