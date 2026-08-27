/**
 * PluginManager 单例
 *
 * 加载策略（Phase 1 调整）：
 * - 不在运行时从 Source URL 拉取插件；插件随仓库分发在 src/plugins/。
 * - 运行时仅扫描 src/plugins/，逐个构建 LiveSite 适配器。
 * - 单 plugin 加载失败 → 记录到 loadError + 跳过，不影响其他 plugin。
 * - reload(pluginId) / POST /api/v1/plugins/reload 供后续管理员手动重载。
 *
 * 设计：
 * - 与 SyncDataManager / DanmakuManager 解耦（构造时注入），便于单元测试
 */

import * as path from 'path';
import { PluginStore } from '../core/plugin/plugin-store.js';
import { PluginRuntime } from '../core/plugin/plugin-runtime.js';
import { HostBridge } from '../core/plugin/plugin-host-bridge.js';
import { PluginBackedSite } from '../core/plugin/plugin-capability-adapter.js';
import { InstalledPlugin } from '../core/plugin/plugin-manifest.js';
import { LiveSite } from '../core/index.js';
import { SyncDataManager } from './sync-data-manager.js';
import { DanmakuManager } from './danmaku-manager.js';
import { CoreLog } from '../core/common/core-log.js';

export interface PluginManagerOptions {
  dataDir: string;
  /** 逗号分隔的 pluginId 黑名单 */
  disabledList: string[];
  syncDataManager: SyncDataManager;
  danmakuManager: DanmakuManager;
  /**
   * 内置站点 lookup（仅用于给 PluginBackedSite 提供 fallback）。
   * LiveSiteService 在 PluginManager 构造时尚未拿到 plugin 列表，但
   * 内置 adapter 已经在 LiveSiteService 内初始化完成，所以这里用延迟
   * provider，等 _loadOne 时再 query。
   */
  builtInSiteProvider?: (siteId: string) => LiveSite | null;
}

interface LoadedPlugin {
  installed: InstalledPlugin;
  runtime: PluginRuntime;
  host: HostBridge;
  site: PluginBackedSite;
}

export class PluginManager {
  readonly dataDir: string;
  readonly disabledList: Set<string>;
  readonly store: PluginStore;
  readonly syncDataManager: SyncDataManager;
  readonly danmakuManager: DanmakuManager;
  private readonly _builtInSiteProvider: (siteId: string) => LiveSite | null;

  private readonly _plugins = new Map<string, LoadedPlugin>();

  constructor(options: PluginManagerOptions) {
    this.dataDir = options.dataDir;
    this.disabledList = new Set(options.disabledList);
    this.store = new PluginStore({ dataDir: options.dataDir });
    this.syncDataManager = options.syncDataManager;
    this.danmakuManager = options.danmakuManager;
    this._builtInSiteProvider = options.builtInSiteProvider ?? (() => null);
  }

  /**
   * 加载所有已安装 plugin；构建 LiveSite 适配器并返回 siteId → adapter 映射。
   * 单个 plugin 加载失败不会影响其他。
   */
  async init(): Promise<Map<string, LiveSite>> {
    await this.store.ensureDirs();
    const installed = await this.store.listInstalled();
    CoreLog.info(
      `[PluginManager] 发现 ${installed.length} 个已安装 plugin（dataDir=${path.resolve(this.dataDir)}）`,
    );

    const sites = new Map<string, LiveSite>();
    for (const item of installed) {
      if (this.disabledList.has(item.pluginId)) {
        CoreLog.info(`[PluginManager] 跳过黑名单 plugin: ${item.pluginId}`);
        continue;
      }
      try {
        const loaded = await this._loadOne(item);
        this._plugins.set(item.pluginId, loaded);
        sites.set(item.pluginId, loaded.site);
        CoreLog.info(
          `[PluginManager] 加载成功: ${item.pluginId}@${item.version}`,
        );
      } catch (err) {
        const msg = formatError(err);
        CoreLog.warn(
          `[PluginManager] 加载 plugin 失败（已禁用）: ${item.pluginId}, ${msg}`,
        );
        item.loadError = msg;
        // 失败 plugin 不进 sites Map
      }
    }
    return sites;
  }

  /** 关闭所有 plugin runtime；用于服务停止 */
  async disposeAll(): Promise<void> {
    for (const [, loaded] of this._plugins) {
      try {
        loaded.runtime.dispose();
      } catch {
        // ignore
      }
    }
    this._plugins.clear();
  }

  /** 暴露已加载 plugin 的 manifest，用于 /api/v1/plugins/health */
  getInstalled(): InstalledPlugin[] {
    return Array.from(this._plugins.values()).map((p) => p.installed);
  }

  getPlugin(pluginId: string): LoadedPlugin | null {
    return this._plugins.get(pluginId) ?? null;
  }

  /** 重新加载某个 plugin：构建新 runtime、原子替换 */
  async reload(pluginId: string): Promise<boolean> {
    const installed = (await this.store.listInstalled()).find(
      (p) => p.pluginId === pluginId,
    );
    if (!installed) return false;
    if (this.disabledList.has(pluginId)) return false;
    try {
      const loaded = await this._loadOne(installed);
      const old = this._plugins.get(pluginId);
      this._plugins.set(pluginId, loaded);
      if (old) {
        try {
          old.runtime.dispose();
        } catch {
          // ignore
        }
      }
      CoreLog.info(
        `[PluginManager] reload 成功: ${pluginId}@${installed.version}`,
      );
      return true;
    } catch (err) {
      const msg = formatError(err);
      CoreLog.warn(
        `[PluginManager] reload 失败: ${pluginId}, ${msg}`,
      );
      return false;
    }
  }

  /** 重新扫描 src/plugins/ 并替换所有已加载 plugin（新增/移除/版本变化都生效） */
  async rescan(): Promise<{ added: string[]; updated: string[]; removed: string[]; failed: string[] }> {
    const installed = await this.store.listInstalled();
    const installedMap = new Map(installed.map((p) => [p.pluginId, p]));
    const added: string[] = [];
    const updated: string[] = [];
    const removed: string[] = [];
    const failed: string[] = [];

    for (const [pluginId, loaded] of this._plugins) {
      if (!installedMap.has(pluginId)) {
        removed.push(pluginId);
        try {
          loaded.runtime.dispose();
        } catch {
          // ignore
        }
        this._plugins.delete(pluginId);
      }
    }

    for (const item of installed) {
      if (this.disabledList.has(item.pluginId)) continue;
      const existing = this._plugins.get(item.pluginId);
      if (existing && existing.installed.version === item.version) continue;
      try {
        const loaded = await this._loadOne(item);
        const old = this._plugins.get(item.pluginId);
        this._plugins.set(item.pluginId, loaded);
        if (old) {
          updated.push(item.pluginId);
          try {
            old.runtime.dispose();
          } catch {
            // ignore
          }
        } else {
          added.push(item.pluginId);
        }
      } catch (err) {
        failed.push(item.pluginId);
        CoreLog.warn(
          `[PluginManager] rescan 加载失败: ${item.pluginId}, ${formatError(err)}`,
        );
      }
    }

    return { added, updated, removed, failed };
  }

  private async _loadOne(installed: InstalledPlugin): Promise<LoadedPlugin> {
    const host = new HostBridge({
      pluginId: installed.pluginId,
      syncDataManager: this.syncDataManager,
      danmakuSessions: this.danmakuManager.sessionSinks,
    });
    const runtime = new PluginRuntime({
      pluginId: installed.pluginId,
      rootDir: installed.rootDir,
      manifest: installed.manifest,
      host,
    });
    await runtime.init();
    await runtime.loadScripts();
    installed.loadedAt = Date.now();
    const fallback = this._builtInSiteProvider(installed.pluginId);
    const site = new PluginBackedSite({
      installed,
      runtime,
      danmakuManager: this.danmakuManager,
      fallback: fallback ?? undefined,
    });
    return { installed, runtime, host, site };
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err === null || err === undefined) return String(err);
  if (typeof err === 'object') {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}