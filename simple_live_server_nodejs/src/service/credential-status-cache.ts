/**
 * CredentialStatusCache（Phase 3 核心）
 *
 * 单例服务，挂在 LiveSiteService 之上。所有 plugin-backed 站点的登录态缓存。
 *
 * 行为：
 * - 启动后为每个 manifest.auth.required === true 的 plugin 占位 unknown。
 * - startAutoCheck(intervalMs)：对每个 entry 触发 plugin.getCredentialStatus /
 *   plugin.validateCredential；plugin 不支持时仅根据 SyncDataManager.getCookie 判断
 *   synced / missing。
 * - get(siteId)：返回缓存；如 stale 触发懒查（不阻塞调用方）。
 * - invalidate(siteId)：cookie 写入路径调用，下轮轮询重新探测。
 * - Promise 去重：同 siteId 并发刷新只触发一次 plugin 调用。
 *
 * 不注入 credentialStatus 到 envelope —— 由 route-helpers.sendJsonWithCredential 决定。
 */

import { SyncDataManager } from './sync-data-manager.js';
import { PluginManager } from './plugin-manager.js';
import { InstalledPlugin } from '../core/plugin/plugin-manifest.js';
import { CoreLog } from '../core/common/core-log.js';

export type CredentialStatusState =
  | 'unknown'
  | 'missing'
  | 'synced'
  | 'valid'
  | 'expired'
  | 'invalid'
  | 'risk_control'
  | 'error';

export interface CredentialStatus {
  state: CredentialStatusState;
  userId: string;
  userName: string;
  expireAt: number;
  message: string;
  checkedAt: number;
  source: 'cache' | 'cold-fetch' | 'manual';
}

interface InternalEntry {
  status: CredentialStatus;
  inflight?: Promise<CredentialStatus>;
}

export interface CredentialStatusCacheOptions {
  syncDataManager: SyncDataManager;
  pluginManager: PluginManager;
  checkIntervalMinutes: number;
  staleAfterMinutes: number;
  concurrency: number;
}

const EMPTY_STATUS: CredentialStatus = Object.freeze({
  state: 'unknown',
  userId: '',
  userName: '',
  expireAt: 0,
  message: '',
  checkedAt: 0,
  source: 'cache',
});

export class CredentialStatusCache {
  private readonly entries = new Map<string, InternalEntry>();
  private readonly syncDataManager: SyncDataManager;
  private readonly pluginManager: PluginManager;
  private readonly checkIntervalMs: number;
  private readonly staleAfterMs: number;
  private readonly concurrency: number;
  private _autoTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: CredentialStatusCacheOptions) {
    this.syncDataManager = options.syncDataManager;
    this.pluginManager = options.pluginManager;
    this.checkIntervalMs = options.checkIntervalMinutes * 60 * 1000;
    this.staleAfterMs = options.staleAfterMinutes * 60 * 1000;
    this.concurrency = Math.max(1, options.concurrency);
  }

  /**
   * 初始化占位条目：为所有 plugin-backed auth.required 站点预填 unknown。
   * 不调用 plugin —— 留给 startAutoCheck / 懒查。
   */
  primeWithInstalled(installed: InstalledPlugin[]): void {
    for (const p of installed) {
      if (p.manifest.auth?.required !== true) continue;
      if (!this.entries.has(p.pluginId)) {
        this.entries.set(p.pluginId, { status: { ...EMPTY_STATUS } });
      }
    }
  }

  /** 同步获取状态（不触发懒查） */
  getSync(siteId: string): CredentialStatus {
    const entry = this.entries.get(siteId);
    if (!entry) return { ...EMPTY_STATUS };
    return entry.status;
  }

  /**
   * 异步获取状态；若 stale 触发懒查
   *
   * - 调用方不等结果也能继续（懒查后台进行）
   * - 不抛错；冷启动时返 unknown
   */
  async get(siteId: string): Promise<CredentialStatus> {
    const entry = this.entries.get(siteId);
    if (!entry) {
      this.entries.set(siteId, { status: { ...EMPTY_STATUS } });
      void this.refresh(siteId);
      return { ...EMPTY_STATUS, source: 'cache' };
    }
    const age = Date.now() - entry.status.checkedAt;
    if (
      entry.status.checkedAt > 0 &&
      age < this.staleAfterMs &&
      entry.status.state !== 'unknown'
    ) {
      return entry.status;
    }
    void this.refresh(siteId);
    return entry.status;
  }

  /** 主动 invalidate（cookie 写入路径调用） */
  invalidate(siteId: string): void {
    const entry = this.entries.get(siteId);
    if (!entry) return;
    entry.status = {
      ...entry.status,
      state: 'synced',
      checkedAt: Date.now(),
      message: 'cookie 已写入，等待下次验证',
      source: 'manual',
    };
  }

  /**
   * 主动刷新一次（带去重）
   */
  async refresh(siteId: string): Promise<CredentialStatus> {
    const entry = this.entries.get(siteId);
    if (!entry) {
      this.entries.set(siteId, { status: { ...EMPTY_STATUS } });
    }
    const e = this.entries.get(siteId)!;
    if (e.inflight) return e.inflight;

    const promise = this._refresh(siteId).finally(() => {
      e.inflight = undefined;
    });
    e.inflight = promise;
    return promise;
  }

  private async _refresh(siteId: string): Promise<CredentialStatus> {
    const plugin = this.pluginManager.getPlugin(siteId);
    const cookie = this.syncDataManager.getCookie(siteId) ?? '';
    const manifest = plugin?.installed.manifest;
    const supportsStatusCheck = manifest?.auth?.supportsStatusCheck === true;
    const supportsValidation = manifest?.auth?.supportsValidation === true;
    const hasCredentialKind = (manifest?.auth?.credentialKinds ?? []).length > 0;

    if (!plugin) {
      const status: CredentialStatus = {
        state: cookie ? 'synced' : 'missing',
        userId: '',
        userName: '',
        expireAt: 0,
        message: '非 plugin 平台；仅按 cookie 是否写入判断',
        checkedAt: Date.now(),
        source: 'cold-fetch',
      };
      this._set(siteId, status);
      return status;
    }

    // 无 cookie 直接 missing
    if (!cookie && hasCredentialKind) {
      const status: CredentialStatus = {
        state: 'missing',
        userId: '',
        userName: '',
        expireAt: 0,
        message: '尚未配置 Cookie',
        checkedAt: Date.now(),
        source: 'cold-fetch',
      };
      this._set(siteId, status);
      return status;
    }

    const runtime = plugin.runtime;

    // 优先 getCredentialStatus
    if (supportsStatusCheck && runtime.hasMethod('getCredentialStatus')) {
      try {
        const result = (await runtime.callMethod('getCredentialStatus', {
          platformId: siteId,
        })) as Record<string, unknown> | undefined;
        if (result && typeof result === 'object') {
          const status = mapPluginCredentialResult(siteId, result);
          this._set(siteId, status);
          return status;
        }
      } catch (err) {
        CoreLog.warn(
          `[CredentialStatusCache:${siteId}] getCredentialStatus 失败: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // 回退 validateCredential
    if (supportsValidation && runtime.hasMethod('validateCredential')) {
      try {
        const result = (await runtime.callMethod('validateCredential', {
          platformId: siteId,
        })) as Record<string, unknown> | undefined;
        if (result && typeof result === 'object') {
          const status = mapPluginCredentialResult(siteId, result);
          this._set(siteId, status);
          return status;
        }
      } catch (err) {
        CoreLog.warn(
          `[CredentialStatusCache:${siteId}] validateCredential 失败: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // plugin 没暴露 credential API → 仅按 cookie 判
    const status: CredentialStatus = {
      state: cookie ? 'synced' : 'missing',
      userId: '',
      userName: '',
      expireAt: 0,
      message: cookie ? 'plugin 未暴露凭据 API，仅按 cookie 是否写入判断' : '未配置 Cookie',
      checkedAt: Date.now(),
      source: 'cold-fetch',
    };
    this._set(siteId, status);
    return status;
  }

  private _set(siteId: string, status: CredentialStatus): void {
    const entry = this.entries.get(siteId) ?? { status: { ...EMPTY_STATUS } };
    entry.status = status;
    this.entries.set(siteId, entry);
  }

  /** 启动后台轮询（0 关闭） */
  startAutoCheck(): void {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
    if (this.checkIntervalMs <= 0) return;
    this._autoTimer = setInterval(() => {
      void this.checkAll();
    }, this.checkIntervalMs);
    this._autoTimer.unref?.();
    CoreLog.info(
      `[CredentialStatusCache] 后台轮询已启动: intervalMs=${this.checkIntervalMs}, concurrency=${this.concurrency}`,
    );
  }

  stopAutoCheck(): void {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
  }

  /** 全量检查一轮（带 concurrency 限流） */
  async checkAll(): Promise<void> {
    const ids = Array.from(this.entries.keys());
    for (let i = 0; i < ids.length; i += this.concurrency) {
      const batch = ids.slice(i, i + this.concurrency);
      // 加 ±2min 抖动，避免固定节拍
      await Promise.all(
        batch.map(async (id) => {
          try {
            await this.refresh(id);
          } catch (err) {
            CoreLog.warn(
              `[CredentialStatusCache:${id}] refresh 异常: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }),
      );
      if (i + this.concurrency < ids.length) {
        await sleep(50);
      }
    }
  }

  /** 调试用：列出所有状态 */
  listAll(): CredentialStatus[] {
    return Array.from(this.entries.values()).map((e) => e.status);
  }
}

function mapPluginCredentialResult(
  siteId: string,
  raw: Record<string, unknown>,
): CredentialStatus {
  const stateRaw = String(raw['state'] ?? '').toLowerCase();
  let state: CredentialStatusState = 'unknown';
  switch (stateRaw) {
    case 'valid':
    case 'ok':
    case 'logged_in':
      state = 'valid';
      break;
    case 'expired':
    case 'reauth_required':
      state = 'expired';
      break;
    case 'invalid':
      state = 'invalid';
      break;
    case 'missing':
    case 'absent':
      state = 'missing';
      break;
    case 'synced':
      state = 'synced';
      break;
    case 'risk':
    case 'risk_control':
    case 'risk-control':
      state = 'risk_control';
      break;
    case 'error':
      state = 'error';
      break;
    default:
      state = 'unknown';
      break;
  }
  void siteId;
  return {
    state,
    userId: String(raw['userId'] ?? raw['uid'] ?? ''),
    userName: String(raw['userName'] ?? raw['nickname'] ?? ''),
    expireAt: typeof raw['expireAt'] === 'number' ? (raw['expireAt'] as number) : 0,
    message: String(raw['message'] ?? raw['msg'] ?? ''),
    checkedAt: Date.now(),
    source: 'cold-fetch',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}