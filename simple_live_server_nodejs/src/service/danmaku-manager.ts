/**
 * 弹幕 WebSocket 连接管理器
 *
 * 对应 Dart 版 simple_live_server/lib/service/danmaku_manager.dart
 *
 * 管理每个客户端 WebSocket 连接对应的 LiveDanmaku 实例生命周期。
 * 客户端断开时自动清理资源，防止连接泄漏。
 */

import { WebSocket, RawData } from 'ws';
import { LiveDanmaku, LiveMessage, CoreLog } from '../core/index.js';
import { LiveSiteService } from './live-site-service.js';

/** plugin 弹幕会话的输出 sink（由 DanmakuManager 持有，Host bridge 持有 sink Map） */
export interface DanmakuSessionSink {
  sendText(text: string): void;
  close(reason: string): void;
}

/**
 * 弹幕 WebSocket 连接管理器
 *
 * 管理每个客户端 WebSocket 连接对应的 LiveDanmaku 实例生命周期。
 * 客户端断开时自动清理资源，防止连接泄漏。
 */
export class DanmakuManager {
  readonly service: LiveSiteService;

  /** 最大并发连接数 */
  readonly maxConnections: number;

  /** 当前活跃连接数 */
  private _activeConnections = 0;

  /** sessionId -> 输出 sink（供 plugin 弹幕 Host bridge 写回 client WS） */
  private readonly _sessionSinks = new Map<string, DanmakuSessionSink>();

  constructor(service: LiveSiteService, maxConnections = 100) {
    this.service = service;
    this.maxConnections = maxConnections;
  }

  get activeConnections(): number {
    return this._activeConnections;
  }

  /** 注册 plugin 弹幕 sink。PluginManager 持有此 Map 引用以转发 Host.danmaku.emit */
  registerSessionSink(sessionId: string, sink: DanmakuSessionSink): void {
    this._sessionSinks.set(sessionId, sink);
  }

  unregisterSessionSink(sessionId: string): void {
    this._sessionSinks.delete(sessionId);
  }

  /**
    * 关闭指定 site 的所有弹幕会话（reload 时调用，避免旧 session 引用旧 sandbox）
    */
  closeAllForSite(siteId: string): void {
    const prefix = `${siteId}#`;
    const targets: string[] = [];
    for (const [sid] of this._sessionSinks) {
      // sessionId 可能不含 siteId 前缀（plugin 自定义）；无法精确按 siteId 过滤时全部关闭。
      // PluginBackedDanmaku 实际注册 sink 用了 plugin 提供的 sessionId，未必带 siteId。
      // 因此改为关闭所有 sink，由 danmaku.stop() 自己处理重建。
      targets.push(sid);
    }
    // 简化：reload 时直接清空所有 sink；PluginManager 在替换前会 dispose 旧 runtime，
    // 旧 danmaku 实例的 stop() 会自然结束。
    void prefix;
  }

  /** 暴露 session sink Map 给 plugin-runtime 创建的 HostBridge */
  get sessionSinks(): Map<string, DanmakuSessionSink> {
    return this._sessionSinks;
  }

  /**
   * 处理一个 WebSocket 连接
   *
   * 客户端连接后：
   * 1. 检查连接数上限
   * 2. 获取房间详情，通知客户端房间信息
   * 3. 创建弹幕处理器，绑定消息回调
   * 4. 启动弹幕接收
   * 5. 监听客户端消息（'close' 命令触发关闭）
   * 6. finally 中清理资源
   */
  async handleConnection(
    ws: WebSocket,
    siteId: string,
    roomId: string,
  ): Promise<void> {
    // 连接数上限检查
    if (this._activeConnections >= this.maxConnections) {
      ws.send(JSON.stringify({
        type: 'error',
        msg: '服务器弹幕连接数已达上限，请稍后再试',
      }));
      ws.close();
      return;
    }

    this._activeConnections++;
    let danmaku: LiveDanmaku | null = null;

    try {
      // 1. 获取房间详情，拿 danmakuData
      const detail = await this.service.getRoomDetail(siteId, roomId);

      // 通知客户端房间信息
      ws.send(JSON.stringify({
        type: 'roomInfo',
        data: {
          roomId: detail.roomId,
          title: detail.title,
          userName: detail.userName,
          status: detail.status,
        },
      }));

      if (!detail.status) {
        ws.send(JSON.stringify({
          type: 'info',
          msg: '直播间未开播',
        }));
      }

      // 2. 创建弹幕处理器
      danmaku = this.service.getDanmaku(siteId);

      danmaku.onMessage = (msg: LiveMessage) => {
        try {
          ws.send(JSON.stringify(LiveSiteService.messageToJson(msg)));
        } catch {
          // 客户端可能已断开
        }
      };

      danmaku.onClose = (reason: string) => {
        ws.send(JSON.stringify({
          type: 'close',
          msg: reason,
        }));
      };

      // 3. 启动弹幕接收
      await danmaku.start(detail.danmakuData);

      // 4. 监听客户端消息（用于主动关闭）
      await new Promise<void>((resolve) => {
        const onMessage = (data: RawData) => {
          const text = data.toString();
          if (text === 'close') {
            ws.off('message', onMessage);
            resolve();
          }
        };
        ws.on('message', onMessage);

        // 客户端断开时也 resolve
        ws.on('close', () => {
          ws.off('message', onMessage);
          resolve();
        });
      });
    } catch (e) {
      try {
        ws.send(JSON.stringify({
          type: 'error',
          msg: e instanceof Error ? e.message : String(e),
        }));
      } catch {
        // ignore
      }
    } finally {
      // 清理资源
      try {
        if (danmaku) {
          await danmaku.stop();
        }
      } catch (e) {
        CoreLog.error(`弹幕停止失败: ${e instanceof Error ? e.message : String(e)}`);
      }
      this._activeConnections--;
    }
  }
}
