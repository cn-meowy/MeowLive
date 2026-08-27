/**
 * Plugin → LiveSite / LiveDanmaku 适配器
 *
 * 把 plugin JS 上的 LiveParsePlugin 包装成 LiveSite 实例，
 * 由 LiveSiteService 注入到 _sites（同名 plugin 覆盖内置 TS 适配器）。
 *
 * 设计要点：
 * - Schema A / B 自动嗅探（见 §0.2、§0.3、§0.4）
 * - 双 shape getPlayback 兼容（Schema X 群组 / Schema Y 扁平）
 * - danmaku transport 走 host 控制反转（Host.danmaku.emit/close）
 */

import {
  LiveSite,
  LiveDanmaku,
  LiveCategory,
  LiveSubCategory,
  LiveCategoryResult,
  LiveSearchRoomResult,
  LiveSearchAnchorResult,
  LiveRoomDetail,
  LivePlayQuality,
  LivePlayUrl,
  LiveSuperChatMessage,
  LiveMessage,
  LiveMessageType,
  LiveMessageColor,
  LiveRoomItem,
  LiveAnchorItem,
} from '../index.js';
import {
  InstalledPlugin,
  PluginCapabilities,
} from './plugin-manifest.js';
import { PluginRuntime } from './plugin-runtime.js';
import { DanmakuManager } from '../../service/danmaku-manager.js';
import { WebSocket as WSClient } from 'ws';
import { CoreLog } from '../common/core-log.js';

/** 探测到的 schema 风格 */
type SchemaKind = 'A' | 'B' | 'unknown';

interface PluginDeps {
  installed: InstalledPlugin;
  runtime: PluginRuntime;
  danmakuManager: DanmakuManager;
  /**
   * 内置 TS 适配器，作为「首页推荐」等场景下的 fallback：
   * plugin 在未登录或参数不支持时返回空 / 抛错，自动回退到内置实现，
   * 保证首页能拉到数据并由路由层标注「需要登录」。
   */
  fallback?: LiveSite;
}

/**
 * 把 plugin 包成 LiveSite
 */
export class PluginBackedSite extends LiveSite {
  readonly installed: InstalledPlugin;
  readonly runtime: PluginRuntime;
  /** 内置 fallback，仅部分方法用（如 getRecommendRooms） */
  readonly fallback: LiveSite | null;

  /** 第一项 schema 嗅探结果 */
  private _schema: SchemaKind = 'unknown';
  private _schemaLocked = false;
  /** 最近一次成功的 getRecommendRooms 触发 schema 锁定 */
  private _playbackCache = new Map<string, { ts: number; qualities: LivePlayQuality[] }>();
  private readonly _playbackCacheTtlMs = 5_000;
  /** 最近一次 getDanmaku plan 缓存 */
  private readonly _danmakuPlanCache = new Map<string, { ts: number; plan: unknown }>();
  private readonly _danmakuPlanCacheTtlMs = 30_000;

  constructor(private readonly deps: PluginDeps) {
    super();
    this.installed = deps.installed;
    this.runtime = deps.runtime;
    this.fallback = deps.fallback ?? null;
  }

  get id(): string {
    return this.installed.pluginId;
  }

  get name(): string {
    return this.installed.manifest.displayName;
  }

  getDanmaku(): LiveDanmaku {
    return new PluginBackedDanmaku({
      plugin: this,
      siteId: this.installed.pluginId,
      danmakuManager: this.deps.danmakuManager,
    });
  }

  // ============ 分类 / 房间列表 ============

  async getCategores(): Promise<LiveCategory[]> {
    if (!this.runtime.hasMethod('getCategories')) return [];
    const raw = await this.runtime.callMethod('getCategories', {});
    const list = Array.isArray(raw) ? raw : [];
    return (list as RawCategory[]).map(
      (c) =>
        new LiveCategory(
          String(c.id ?? ''),
          String(c.title ?? c.name ?? ''),
          this._mapSubCategories(c),
        ),
    );
  }

  async searchRooms(keyword: string, page = 1): Promise<LiveSearchRoomResult> {
    if (!this.runtime.hasMethod('search')) {
      return new LiveSearchRoomResult(false, []);
    }
    const raw = (await this.runtime.callMethod('search', { keyword, page })) ?? [];
    const items = this._mapRoomItems(raw as RawRoomItem[]);
    const hasMore = this._detectHasMore(raw as unknown[], items.length, page);
    return new LiveSearchRoomResult(hasMore, items);
  }

  async searchAnchors(keyword: string, page = 1): Promise<LiveSearchAnchorResult> {
    // 多数 plugin 没有独立 anchor 接口；复用 search 并映射到 anchor 形状
    const searchCap = (this.installed.manifest.capabilities as PluginCapabilities).search;
    if (searchCap?.status === 'unavailable' || !this.runtime.hasMethod('search')) {
      return new LiveSearchAnchorResult(false, []);
    }
    const raw = (await this.runtime.callMethod('search', { keyword, page })) ?? [];
    const rooms = this._mapRoomItems(raw as RawRoomItem[]);
    const anchors = rooms.map(
      (r) =>
        new LiveAnchorItem(
          r.roomId,
          r.userName,
          '', // plugin 返回不强制包含 userAvatar
          true,
        ),
    );
    const hasMore = this._detectHasMore(raw as unknown[], anchors.length, page);
    return new LiveSearchAnchorResult(hasMore, anchors);
  }

  async getCategoryRooms(
    category: LiveSubCategory,
    page = 1,
  ): Promise<LiveCategoryResult> {
    if (!this.runtime.hasMethod('getRooms')) {
      return new LiveCategoryResult(false, []);
    }
    let resultList: unknown;
    try {
      resultList = await this.runtime.callMethod('getRooms', {
        id: category.id,
        parentId: category.parentId,
        page,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('INVALID_ARGS')) {
        // 一些 plugin 的推荐入口用 'recommended' / 'all'
        try {
          resultList = await this.runtime.callMethod('getRooms', {
            id: 'all',
            parentId: category.parentId,
            page,
          });
        } catch {
          resultList = await this.runtime.callMethod('getRooms', {
            id: 'recommended',
            parentId: category.parentId,
            page,
          });
        }
      } else {
        throw err;
      }
    }
    const items = this._mapRoomItems((resultList ?? []) as RawRoomItem[]);
    const hasMore = this._detectHasMore(resultList as unknown[], items.length, page);
    return new LiveCategoryResult(hasMore, items);
  }

  async getRecommendRooms(page = 1): Promise<LiveCategoryResult> {
    // plugin 没暴露 getRooms → 走 fallback
    if (!this.runtime.hasMethod('getRooms')) {
      if (this.fallback) {
        CoreLog.info(
          `[plugin:${this.installed.pluginId}] getRooms 缺失，回退到内置实现`,
        );
        return this.fallback.getRecommendRooms(page);
      }
      return new LiveCategoryResult(false, []);
    }
    let raw: unknown;
    let threw = false;
    let thrownErr: unknown = null;
    try {
      raw = await this.runtime.callMethod('getRooms', { id: 'all', page });
    } catch (err) {
      threw = true;
      thrownErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('INVALID_ARGS')) {
        // 一些 plugin 把「全部」用 'recommended'
        try {
          threw = false;
          raw = await this.runtime.callMethod('getRooms', {
            id: 'recommended',
            page,
          });
        } catch (err2) {
          threw = true;
          thrownErr = err2;
        }
      }
    }

    // 解析 plugin 返回；若插件失败或返回空，回退到内置实现
    const items = this._mapRoomItems((raw ?? []) as RawRoomItem[]);
    if (threw || items.length === 0) {
      if (this.fallback) {
        const reason = threw
          ? `plugin 抛错: ${
              thrownErr instanceof Error ? thrownErr.message : String(thrownErr)
            }`
          : 'plugin 返回空列表';
        CoreLog.info(
          `[plugin:${this.installed.pluginId}] 推荐接口 ${reason}，回退到内置实现`,
        );
        try {
          return await this.fallback.getRecommendRooms(page);
        } catch (fallbackErr) {
          CoreLog.warn(
            `[plugin:${this.installed.pluginId}] 内置 fallback 也失败: ${
              fallbackErr instanceof Error
                ? fallbackErr.message
                : String(fallbackErr)
            }`,
          );
          // 内置也失败时仍返回 plugin 的原始结果（空或抛错前的部分数据）
          if (threw) throw thrownErr;
          const hasMore = this._detectHasMore(raw as unknown[], items.length, page);
          return new LiveCategoryResult(hasMore, items);
        }
      }
      if (threw) throw thrownErr;
      const hasMore = this._detectHasMore(raw as unknown[], items.length, page);
      return new LiveCategoryResult(hasMore, items);
    }

    const hasMore = this._detectHasMore(raw as unknown[], items.length, page);
    return new LiveCategoryResult(hasMore, items);
  }

  // ============ 房间详情 ============

  async getRoomDetail(roomId: string): Promise<LiveRoomDetail> {
    if (!this.runtime.hasMethod('getRoomDetail')) {
      throw new Error('plugin 不支持 getRoomDetail');
    }
    const detailRaw = (await this.runtime.callMethod('getRoomDetail', {
      roomId,
    })) as RawRoomDetail;

    // 内联调取 danmaku plan（按 roomId 短 TTL 缓存）
    let danmakuPlan: unknown = undefined;
    if (this.runtime.hasMethod('getDanmaku')) {
      const cached = this._danmakuPlanCache.get(roomId);
      if (cached && Date.now() - cached.ts < this._danmakuPlanCacheTtlMs) {
        danmakuPlan = cached.plan;
      } else {
        try {
          danmakuPlan = await this.runtime.callMethod('getDanmaku', { roomId });
          this._danmakuPlanCache.set(roomId, { ts: Date.now(), plan: danmakuPlan });
        } catch (err) {
          CoreLog.warn(
            `[plugin:${this.installed.pluginId}] getDanmaku 失败: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    const mapped = this._mapRoomDetail(detailRaw, roomId);
    return new LiveRoomDetail(
      mapped.roomId,
      mapped.title,
      mapped.cover,
      mapped.userName,
      mapped.userAvatar,
      mapped.online,
      mapped.status,
      mapped.url,
      detailRaw, // data：原始 plugin 返回（X 形扁平 / Y 形 urls+headers）
      danmakuPlan,
      mapped.introduction,
      mapped.notice,
      false,
      '',
    );
  }

  // ============ 播放 ============

  async getPlayQualites(detail: LiveRoomDetail): Promise<LivePlayQuality[]> {
    const cacheKey = detail.roomId;
    const cached = this._playbackCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this._playbackCacheTtlMs) {
      return cached.qualities;
    }

    if (!this.runtime.hasMethod('getPlayback')) {
      return [];
    }
    const raw = (await this.runtime.callMethod('getPlayback', {
      roomId: detail.roomId,
    })) as unknown;
    const qualities = this._mapPlayback(raw);

    this._playbackCache.set(cacheKey, { ts: Date.now(), qualities });
    return qualities;
  }

  async getPlayUrls(
    detail: LiveRoomDetail,
    quality: LivePlayQuality,
  ): Promise<LivePlayUrl> {
    const cached = this._playbackCache.get(detail.roomId);
    let dataUrl: string | undefined;
    let dataHeaders: Record<string, string> | undefined;
    let dataUserAgent: string | undefined;
    let dataCdn: string | undefined;

    if (cached) {
      const matched = cached.qualities.find((q) => q.quality === quality.quality);
      if (matched && typeof matched.data === 'object' && matched.data) {
        const md = matched.data as Record<string, unknown>;
        if (typeof md['url'] === 'string' && md['url']) {
          dataUrl = md['url'] as string;
        }
        if (md['headers'] && typeof md['headers'] === 'object') {
          dataHeaders = md['headers'] as Record<string, string>;
        }
        if (typeof md['userAgent'] === 'string') {
          dataUserAgent = md['userAgent'] as string;
        }
        if (typeof md['cdn'] === 'string') {
          dataCdn = md['cdn'] as string;
        }
      }
    }

    if (!dataUrl && this.runtime.hasMethod('refreshPlayback')) {
      // 让 plugin 自己决定如何刷新
      const refreshed = (await this.runtime.callMethod('refreshPlayback', {
        roomId: detail.roomId,
        quality: { quality: quality.quality },
      })) as Record<string, unknown>;
      if (refreshed && typeof refreshed === 'object') {
        dataUrl = refreshed['url'] as string | undefined;
        dataHeaders = refreshed['headers'] as Record<string, string> | undefined;
        dataUserAgent = refreshed['userAgent'] as string | undefined;
      }
    }

    if (!dataUrl) {
      // 最后兜底：再次 getPlayback
      const fallback = (await this.runtime.callMethod('getPlayback', {
        roomId: detail.roomId,
      })) as unknown;
      const list = this._mapPlayback(fallback);
      const matched = list.find((q) => q.quality === quality.quality);
      if (matched && typeof matched.data === 'object' && matched.data) {
        const md = matched.data as Record<string, unknown>;
        dataUrl = md['url'] as string | undefined;
        dataHeaders = md['headers'] as Record<string, string> | undefined;
        dataUserAgent = md['userAgent'] as string | undefined;
      }
    }

    if (!dataUrl) {
      throw new Error(
        `无法取得 roomId=${detail.roomId} quality=${quality.quality} 的播放直链`,
      );
    }

    const headers: Record<string, string> = { ...(dataHeaders ?? {}) };
    if (dataUserAgent && !headers['User-Agent']) {
      headers['User-Agent'] = dataUserAgent;
    }

    return new LivePlayUrl([dataUrl], headers);
  }

  async getLiveStatus(roomId: string): Promise<boolean> {
    if (this.runtime.hasMethod('getLiveState')) {
      try {
        const raw = (await this.runtime.callMethod('getLiveState', {
          roomId,
        })) as unknown;
        if (typeof raw === 'string') return raw === '1' || raw === 'true';
        if (typeof raw === 'object' && raw) {
          const obj = raw as Record<string, unknown>;
          const state = obj['liveState'] ?? obj['live_state'] ?? obj['status'];
          if (typeof state === 'string') return state === '1' || state === 'live';
          if (typeof state === 'boolean') return state;
          // 直接 true/false
          if ('live' in obj && typeof obj['live'] === 'boolean') return obj['live'] as boolean;
        }
        if (typeof raw === 'boolean') return raw;
      } catch (err) {
        CoreLog.warn(
          `[plugin:${this.installed.pluginId}] getLiveState 失败: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    // fallback：依赖 getRoomDetail().status
    try {
      const d = await this.getRoomDetail(roomId);
      return d.status;
    } catch {
      return false;
    }
  }

  async getSuperChatMessage(roomId: string): Promise<LiveSuperChatMessage[]> {
    void roomId;
    // §3 描述：Phase 1 统一抛 NotImplemented
    throw new Error('plugin 暂不支持 getSuperChatMessage；改走弹幕流');
  }

  /** 暴露给 danmaku adapter 用 */
  getSessionId(wsKey: string): string {
    return `${this.installed.pluginId}#${wsKey}`;
  }

  /** 暴露给 danmaku adapter：plugin 是否有 setCredential/getCredentialStatus/validateCredential */
  get pluginCapabilities(): PluginCapabilities {
    return this.installed.manifest.capabilities;
  }

  // ============ internal helpers ============

  private _mapSubCategories(parent: RawCategory): LiveSubCategory[] {
    if (!Array.isArray(parent.subList)) return [];
    return parent.subList.map((sub) => {
      const id = String(sub?.id ?? '');
      const parentId = String(sub?.parentId ?? parent.id ?? '');
      const name = String(sub?.title ?? sub?.name ?? '');
      const pic = typeof sub?.pic === 'string' ? sub.pic : '';
      return new LiveSubCategory(id, name, parentId, pic);
    });
  }

  private _mapRoomItems(rawItems: RawRoomItem[]): LiveRoomItem[] {
    const items = (rawItems ?? []).map((item) => {
      const mapped = this._mapRoomItem(item);
      return new LiveRoomItem(
        mapped.roomId,
        mapped.title,
        mapped.cover,
        mapped.userName,
        mapped.online,
      );
    });
    // 首次嗅探
    if (rawItems.length > 0 && !this._schemaLocked) {
      this._schema = detectSchema(rawItems[0]);
      if (this._schema !== 'unknown') this._schemaLocked = true;
    }
    return items;
  }

  private _mapRoomItem(item: RawRoomItem): {
    roomId: string;
    title: string;
    cover: string;
    userName: string;
    online: number;
  } {
    if (!item || typeof item !== 'object') {
      return { roomId: '', title: '', cover: '', userName: '', online: 0 };
    }
    // Schema A
    if ('roomTitle' in item || 'roomCover' in item || 'userHeadImg' in item) {
      return {
        roomId: String(item.roomId ?? item.userId ?? ''),
        title: String(item.roomTitle ?? ''),
        cover: String(item.roomCover ?? ''),
        userName: String(item.userName ?? ''),
        online: parseCount(item.liveWatchedCount ?? item.online ?? 0),
      };
    }
    // Schema B (bilibili 旧式)
    return {
      roomId: String(item.roomId ?? ''),
      title: String(item.title ?? ''),
      cover: String(item.cover ?? ''),
      userName: String(item.userName ?? ''),
      online: parseCount(item.online ?? 0),
    };
  }

  private _mapRoomDetail(
    raw: RawRoomDetail,
    roomId: string,
  ): {
    roomId: string;
    title: string;
    cover: string;
    userName: string;
    userAvatar: string;
    online: number;
    status: boolean;
    url: string;
    introduction?: string;
    notice?: string;
  } {
    if (!raw || typeof raw !== 'object') {
      return {
        roomId,
        title: '',
        cover: '',
        userName: '',
        userAvatar: '',
        online: 0,
        status: false,
        url: '',
      };
    }
    // Schema A
    if ('roomTitle' in raw || 'roomCover' in raw) {
      return {
        roomId: String(raw.roomId ?? raw.userId ?? roomId),
        title: String(raw.roomTitle ?? ''),
        cover: String(raw.roomCover ?? ''),
        userName: String(raw.userName ?? ''),
        userAvatar: String(raw.userHeadImg ?? ''),
        online: parseCount(raw.liveWatchedCount ?? 0),
        status: raw.liveState === '1' || raw.liveState === 'live' || raw.liveState === true,
        url: '',
      };
    }
    return {
      roomId: String(raw.roomId ?? roomId),
      title: String(raw.title ?? ''),
      cover: String(raw.cover ?? ''),
      userName: String(raw.userName ?? ''),
      userAvatar: String(raw.userAvatar ?? ''),
      online: parseCount(raw.online ?? 0),
      status: Boolean(raw.status ?? raw.liveStatus),
      url: String(raw.url ?? ''),
    };
  }

  private _mapPlayback(raw: unknown): LivePlayQuality[] {
    if (!Array.isArray(raw)) return [];
    // Schema X：[{ cdn, qualitys: [...] }]
    const first = raw[0] as unknown;
    if (
      raw.length > 0 &&
      typeof first === 'object' &&
      first !== null &&
      Array.isArray((first as Record<string, unknown>)['qualitys'])
    ) {
      const out: LivePlayQuality[] = [];
      raw.forEach((group, gi) => {
        const g = group as Record<string, unknown>;
        const qualitys = (g['qualitys'] as unknown[]) ?? [];
        qualitys.forEach((q, qi) => {
          if (!q || typeof q !== 'object') return;
          const qo = q as Record<string, unknown>;
          const quality = String(qo['qn'] ?? qo['quality'] ?? qi);
          out.push(
            new LivePlayQuality(
              quality,
              qo,
              gi * 1000 + qi,
            ),
          );
        });
      });
      return out;
    }
    // Schema Y bilibili: { urls:[{url,quality}], headers, userAgent, playbackHints? }
    if (
      raw.length === 0 ||
      typeof (raw as unknown as Record<string, unknown>)['urls'] !== 'undefined' ||
      !Array.isArray(raw)
    ) {
      const y = raw as unknown as {
        urls?: Array<{ url?: string; quality?: string | number }>;
        headers?: Record<string, string>;
        userAgent?: string;
        playbackHints?: Record<string, unknown>;
      };
      if (Array.isArray(y.urls)) {
        return y.urls.map((u, i) => {
          const data = {
            url: u.url,
            quality: u.quality,
            headers: y.headers,
            userAgent: y.userAgent,
            playbackHints: y.playbackHints,
          };
          return new LivePlayQuality(String(u.quality ?? ''), data, i);
        });
      }
    }
    return [];
  }

  private _detectHasMore(_raw: unknown, itemCount: number, page: number): boolean {
    // 保守：plugin 没暴露 hasMore 字段时，假定非空即可能还有更多
    if (itemCount === 0) return false;
    // xhs 2.0.2 描述：单元素数组 = hasMore=false
    if (Array.isArray(_raw) && _raw.length === 1) return false;
    return itemCount >= page * 20;
  }
}

// ====================== Danmaku adapter ======================

interface PluginBackedDanmakuDeps {
  plugin: PluginBackedSite;
  siteId: string;
  danmakuManager: DanmakuManager;
}

/**
 * Plugin 弹幕适配器
 *
 * - danmakuData 即 plugin 上一次 getDanmaku({roomId}) 的 plan 对象
 * - 按 plan.transport 启 transport（websocket / http_polling / websocket_sockjs）
 * - plugin → host 控制反转：plugin 调 Host.danmaku.emit(sessionId, msg)
 */
export class PluginBackedDanmaku extends LiveDanmaku {
  private readonly plugin: PluginBackedSite;
  private readonly siteId: string;
  private readonly danmakuManager: DanmakuManager;

  private _wsClient: WSClient | null = null;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _tickTimer: ReturnType<typeof setInterval> | null = null;
  private _sessionId: string | null = null;
  private _plan: unknown = null;

  constructor(deps: PluginBackedDanmakuDeps) {
    super();
    this.plugin = deps.plugin;
    this.siteId = deps.siteId;
    this.danmakuManager = deps.danmakuManager;
  }

  override async start(args: unknown): Promise<void> {
    const plan = args as PlanPayload | undefined;
    if (!plan || typeof plan !== 'object') {
      throw new Error('plugin danmaku.start: 缺少 plan 对象（danmakuData）');
    }
    this._plan = plan;

    const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this._sessionId = sessionId;

    const runtime = this.plugin.runtime;

    // createDanmakuSession
    let tickMs = 5000;
    if (runtime.hasMethod('createDanmakuSession')) {
      try {
        const r = (await runtime.callMethod('createDanmakuSession', {
          sessionId,
          plan,
        })) as { tick?: number } | undefined;
        if (r && typeof r === 'object' && typeof r.tick === 'number' && r.tick > 0) {
          tickMs = r.tick * 1000;
        }
      } catch (err) {
        CoreLog.warn(
          `[plugin:${this.siteId}] createDanmakuSession 失败: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // 注册 sink 到 host bridge，让 plugin.onDanmakuFrame 能 emit 写回 client WS
    this.danmakuManager.registerSessionSink(sessionId, {
      sendText: (text) => this.onMessage && this.tryEmit(text),
      close: (reason) => this.handleClose(reason),
    });

    // 启 transport：兼容 plan.transport 为字符串或 { kind, url } 两种形态。
    // 同时把 transport.url 兜底提升到 plan.url（_startWebSocket 直接读 plan.url），
    // 避免老 plugin 把 URL 放在 transport 里、新 adapter 又只查 plan.url 导致连接失败。
    const transportKind = this._resolveTransportKind(plan.transport);
    const transportUrl =
      typeof plan.transport === 'object' && plan.transport && typeof plan.transport.url === 'string'
        ? plan.transport.url
        : undefined;
    if (transportUrl && !plan.url) {
      plan.url = transportUrl;
    }
    switch (transportKind) {
      case 'websocket':
      case 'websocket_sockjs':
        this._startWebSocket(sessionId, plan);
        break;
      case 'http_polling':
        this._startPolling(sessionId, plan);
        break;
      default:
        throw new Error(`plugin danmaku: 不支持的 transport=${String(plan.transport)}`);
    }

    // tick 心跳
    if (runtime.hasMethod('onDanmakuTick')) {
      this._tickTimer = setInterval(() => {
        runtime
          .callMethod('onDanmakuTick', { sessionId })
          .catch((err) =>
            CoreLog.warn(
              `[plugin:${this.siteId}] onDanmakuTick 失败: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
      }, tickMs);
      this._tickTimer.unref?.();
    }
  }

  override async stop(): Promise<void> {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._wsClient) {
      try {
        this._wsClient.close();
      } catch {
        // ignore
      }
      this._wsClient = null;
    }
    if (this._sessionId) {
      this.danmakuManager.unregisterSessionSink(this._sessionId);
      if (this.plugin.runtime.hasMethod('destroyDanmakuSession')) {
        try {
          await this.plugin.runtime.callMethod('destroyDanmakuSession', {
            sessionId: this._sessionId,
          });
        } catch (err) {
          CoreLog.warn(
            `[plugin:${this.siteId}] destroyDanmakuSession 失败: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      this._sessionId = null;
    }
  }

  /**
   * 解析 plan.transport 为标准 kind 字符串
   *
   * - 字符串形态（早期 plugin）：直接返回
   * - 对象形态（标准化后 plugin）：返回 `transport.kind`
   * - 缺省/未知：默认 `websocket`（与历史行为一致）
   */
  private _resolveTransportKind(transport: PlanPayload['transport']): string {
    if (typeof transport === 'string') return transport;
    if (transport && typeof transport === 'object' && typeof transport.kind === 'string') {
      return transport.kind;
    }
    return 'websocket';
  }

  /** 把 plugin 推送的 frame 文本转 LiveMessage 后调 onMessage */
  private tryEmit(text: string): void {
    if (!this.onMessage) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { type: 'chat', message: text };
    }
    const msg = frameToLiveMessage(parsed);
    try {
      this.onMessage(msg);
    } catch {
      // ignore
    }
  }

  private handleClose(reason: string): void {
    if (this.onClose) {
      try {
        this.onClose(reason);
      } catch {
        // ignore
      }
    }
  }

  private _startWebSocket(sessionId: string, plan: PlanPayload): void {
    if (!plan.url || typeof plan.url !== 'string') {
      throw new Error('plugin danmaku: websocket plan.url 缺失');
    }
    const headers: Record<string, string> = { ...(plan.headers ?? {}) };
    const ws = new WSClient(plan.url, { headers });
    this._wsClient = ws;
    ws.on('open', () => {
      // 让 plugin 处理 onopen：返回的 frames 可作为初始 send
      if (this.plugin.runtime.hasMethod('onDanmakuOpen')) {
        this.plugin.runtime
          .callMethod('onDanmakuOpen', { sessionId })
          .then((r) => {
            const frames = Array.isArray(r) ? r : [];
            for (const frame of frames) {
              try {
                if (typeof frame === 'string') ws.send(frame);
                else ws.send(JSON.stringify(frame));
              } catch {
                // ignore
              }
            }
          })
          .catch((err) =>
            CoreLog.warn(
              `[plugin:${this.siteId}] onDanmakuOpen 失败: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
      }
    });
    ws.on('message', (data) => {
      const text =
        typeof data === 'string'
          ? data
          : Buffer.isBuffer(data)
            ? data.toString('utf8')
            : data.toString();
      if (this.plugin.runtime.hasMethod('onDanmakuFrame')) {
        this.plugin.runtime
          .callMethod('onDanmakuFrame', { sessionId, payload: text })
          .then((r) => {
            const frames = Array.isArray(r) ? r : r ? [r] : [];
            for (const frame of frames) {
              this.tryEmit(
                typeof frame === 'string' ? frame : JSON.stringify(frame),
              );
            }
          })
          .catch((err) =>
            CoreLog.warn(
              `[plugin:${this.siteId}] onDanmakuFrame 失败: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
      }
    });
    ws.on('close', (code, reason) => {
      this.handleClose(`ws close: ${code} ${reason.toString()}`);
    });
    ws.on('error', (err) => {
      CoreLog.warn(
        `[plugin:${this.siteId}] ws error: ${err.message}`,
      );
    });
  }

  private _startPolling(sessionId: string, plan: PlanPayload): void {
    const pollReq = (plan.pollRequest as { url?: string; method?: string; headers?: Record<string, string>; intervalMs?: number }) ?? undefined;
    if (!pollReq || typeof pollReq.url !== 'string') {
      throw new Error('plugin danmaku: http_polling plan.pollRequest.url 缺失');
    }
    const intervalMs = pollReq.intervalMs ?? 5000;
    const tick = async () => {
      try {
        // 透传：Host.http 不接 poll 字段，所以 plugin.onDanmakuFrame 自己会发请求
        // 这里把 poll 字段也作为辅助：plugin 期望的 payload 是 pollRequest 整体。
        const payload = JSON.stringify(pollReq);
        if (this.plugin.runtime.hasMethod('onDanmakuFrame')) {
          const r = await this.plugin.runtime.callMethod('onDanmakuFrame', {
            sessionId,
            payload,
          });
          const frames = Array.isArray(r) ? r : r ? [r] : [];
          for (const frame of frames) {
            this.tryEmit(
              typeof frame === 'string' ? frame : JSON.stringify(frame),
            );
          }
        }
      } catch (err) {
        CoreLog.warn(
          `[plugin:${this.siteId}] polling tick 失败: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    };
    void tick();
    this._pollTimer = setInterval(tick, intervalMs);
    this._pollTimer.unref?.();
  }
}

// ====================== helpers ======================

interface RawCategory {
  id?: string | number;
  title?: string;
  name?: string;
  subList?: Array<{
    id?: string | number;
    title?: string;
    name?: string;
    parentId?: string;
    pic?: string;
  }>;
}

interface RawRoomItem {
  roomId?: string | number;
  userId?: string | number;
  roomTitle?: string;
  title?: string;
  roomCover?: string;
  cover?: string;
  userName?: string;
  userHeadImg?: string;
  userAvatar?: string;
  liveWatchedCount?: number | string;
  online?: number | string;
  liveState?: string | boolean;
  liveType?: string;
}

interface RawRoomDetail extends RawRoomItem {
  status?: boolean;
  liveStatus?: boolean;
  url?: string;
  introduction?: string;
  notice?: string;
  showTime?: string;
  isRecord?: boolean;
}

interface PlanTransport {
  kind?: string;
  url?: string;
  frameType?: string;
  [extra: string]: unknown;
}

interface PlanPayload {
  /**
   * 传输方式：插件早期版本直接传字符串（`'websocket'` / `'http_polling'` …），
   * 标准化后改为对象 `{ kind, url, frameType }`。两层形态都需兼容。
   */
  transport?: string | PlanTransport;
  url?: string;
  headers?: Record<string, string>;
  pollRequest?: Record<string, unknown>;
  tick?: number;
  [extra: string]: unknown;
}

function parseCount(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const num = Number(v);
    if (!Number.isNaN(num)) return num;
  }
  return 0;
}

function detectSchema(item: RawRoomItem): SchemaKind {
  if (!item || typeof item !== 'object') return 'unknown';
  if ('roomTitle' in item || 'roomCover' in item || 'userHeadImg' in item) return 'A';
  if ('title' in item || 'cover' in item || 'userAvatar' in item) return 'B';
  return 'unknown';
}

function frameToLiveMessage(frame: unknown): LiveMessage {
  if (!frame || typeof frame !== 'object') {
    return new LiveMessage(
      LiveMessageType.Chat,
      '',
      String(frame),
      LiveMessageColor.white,
    );
  }
  const obj = frame as Record<string, unknown>;
  const rawType = String(obj['type'] ?? 'chat');
  let type: LiveMessageType;
  switch (rawType) {
    case 'superChat':
    case 'super_chat':
    case 'superchat':
      type = LiveMessageType.SuperChat;
      break;
    case 'online':
    case 'room_count':
      type = LiveMessageType.Online;
      break;
    case 'gift':
      type = LiveMessageType.Gift;
      break;
    default:
      type = LiveMessageType.Chat;
      break;
  }
  const userName = String(obj['userName'] ?? obj['username'] ?? obj['nickname'] ?? '');
  const message = String(obj['message'] ?? obj['msg'] ?? obj['text'] ?? '');
  let color = LiveMessageColor.white;
  if (typeof obj['color'] === 'number') {
    color = LiveMessageColor.numberToColor(obj['color']);
  } else if (typeof obj['color'] === 'string') {
    const hex = obj['color'].replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      color = new LiveMessageColor(r, g, b);
    }
  }
  const data = obj['data'];
  return new LiveMessage(type, userName, message, color, data);
}