/**
 * 服务端配置
 *
 * 对应 Dart 版 simple_live_server/lib/config/server_config.dart
 */

export class ServerConfig {
  /** 监听端口 */
  readonly port: number;

  /** 监听地址 */
  readonly host: string;

  /** B站 Cookie */
  readonly bilibiliCookie: string;

  /** 抖音 Cookie */
  readonly douyinCookie: string;

  /** 是否启用日志 */
  readonly enableLog: boolean;

  /** 弹幕最大并发连接数 */
  readonly maxDanmakuConnections: number;

  /** 最大并发转封装会话数 */
  readonly maxStreamSessions: number;

  /** HLS 分片临时目录 */
  readonly streamDir: string;

  /** 空闲进程关闭延迟（秒） */
  readonly streamIdleTimeout: number;

  /** 演示模式：只显示 local 平台（用于 Apple Store 审核） */
  readonly demoMode: boolean;

  /** 本地视频文件目录（local 平台数据源） */
  readonly localVideoDir: string;

  /** 本地数据 JSON 文件路径（为空则自动扫描目录） */
  readonly localDataFile: string;

  /** 封面图片存储目录（演示模式截取视频第一帧保存位置） */
  readonly coverDir: string;

  /** 头像图片存储目录（演示模式截取视频中间帧保存位置） */
  readonly avatarDir: string;

  /** 同步数据 SQLite 数据库路径（为空则纯内存模式，不持久化） */
  readonly syncDbPath: string;

  /** 插件黑名单（pluginId 列表） */
  readonly pluginDisabled: string[];

  /** 插件解压目录（默认 ./src/plugins，随仓库一起分发） */
  readonly pluginDataDir: string;

  /** 单 plugin context 内存上限（MB） */
  readonly pluginQuickjsMemoryMb: number;

  /** 单 plugin context 栈大小 */
  readonly pluginQuickjsStackSize: number;

  /** 凭据状态后台轮询间隔（分钟）；0 关闭（仅懒查） */
  readonly pluginCredentialCheckIntervalMinutes: number;

  /** 凭据缓存 TTL（分钟）；超过触发懒查 */
  readonly pluginCredentialStaleAfterMinutes: number;

  /** 同时探测状态的 plugin 数（防风控） */
  readonly pluginCredentialConcurrency: number;

  constructor(options: {
    port?: number;
    host?: string;
    bilibiliCookie?: string;
    douyinCookie?: string;
    enableLog?: boolean;
    maxDanmakuConnections?: number;
    maxStreamSessions?: number;
    streamDir?: string;
    streamIdleTimeout?: number;
    demoMode?: boolean;
    localVideoDir?: string;
    localDataFile?: string;
    coverDir?: string;
    avatarDir?: string;
    syncDbPath?: string;
    pluginDisabled?: string[];
    pluginDataDir?: string;
    pluginQuickjsMemoryMb?: number;
    pluginQuickjsStackSize?: number;
    pluginCredentialCheckIntervalMinutes?: number;
    pluginCredentialStaleAfterMinutes?: number;
    pluginCredentialConcurrency?: number;
  } = {}) {
    this.port = options.port ?? 8080;
    this.host = options.host ?? '0.0.0.0';
    this.bilibiliCookie = options.bilibiliCookie ?? '';
    this.douyinCookie = options.douyinCookie ?? '';
    this.enableLog = options.enableLog ?? true;
    this.maxDanmakuConnections = options.maxDanmakuConnections ?? 100;
    this.maxStreamSessions = options.maxStreamSessions ?? 20;
    this.streamDir = options.streamDir ?? '/tmp/live_stream';
    this.streamIdleTimeout = options.streamIdleTimeout ?? 30;
    this.demoMode = options.demoMode ?? false;
    this.localVideoDir = options.localVideoDir ?? '/data/videos';
    this.localDataFile = options.localDataFile ?? '';
    this.coverDir = options.coverDir ?? '/tmp/live_stream/covers';
    this.avatarDir = options.avatarDir ?? '/tmp/live_stream/avatars';
    this.syncDbPath = options.syncDbPath ?? '';
    this.pluginDisabled = options.pluginDisabled ?? [];
    this.pluginDataDir = options.pluginDataDir ?? './src/plugins';
    this.pluginQuickjsMemoryMb = options.pluginQuickjsMemoryMb ?? 32;
    this.pluginQuickjsStackSize = options.pluginQuickjsStackSize ?? 4096;
    this.pluginCredentialCheckIntervalMinutes =
      options.pluginCredentialCheckIntervalMinutes ?? 15;
    this.pluginCredentialStaleAfterMinutes =
      options.pluginCredentialStaleAfterMinutes ?? 10;
    this.pluginCredentialConcurrency =
      options.pluginCredentialConcurrency ?? 3;
  }

  /**
   * 从环境变量读取配置
   *
   * 对应 Dart 版 ServerConfig.fromEnv()
   */
  static fromEnv(): ServerConfig {
    const env = process.env;

    const parseIntSafe = (value: string | undefined, defaultValue: number): number => {
      if (value === undefined || value === '') return defaultValue;
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? defaultValue : parsed;
    };

    const parseBoolSafe = (value: string | undefined, defaultValue: boolean): boolean => {
      if (value === undefined || value === '') return defaultValue;
      return value.toLowerCase() === 'true';
    };

    return new ServerConfig({
      port: parseIntSafe(env.PORT, 8089),
      host: env.HOST ?? '0.0.0.0',
      bilibiliCookie: env.BILIBILI_COOKIE ?? '',
      douyinCookie: env.DOUYIN_COOKIE ?? '',
      enableLog: parseBoolSafe(env.ENABLE_LOG, true),
      maxDanmakuConnections: parseIntSafe(env.MAX_DANMAKU_CONNECTIONS, 100),
      maxStreamSessions: parseIntSafe(env.MAX_STREAM_SESSIONS, 20),
      streamDir: env.STREAM_DIR ?? '/tmp/live_stream',
      streamIdleTimeout: parseIntSafe(env.STREAM_IDLE_TIMEOUT, 30),
      demoMode: parseBoolSafe(env.DEMO_MODE, false),
      localVideoDir: env.LOCAL_VIDEO_DIR ?? '/data/videos',
      localDataFile: env.LOCAL_DATA_FILE ?? '',
      coverDir: env.COVER_DIR ?? '/tmp/live_stream/covers',
      avatarDir: env.AVATAR_DIR ?? '/tmp/live_stream/avatars',
      syncDbPath: env.SYNC_DB_PATH ?? '/data/sync_data.db',
      pluginDisabled: (env.PLUGIN_DISABLED ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      pluginDataDir: env.PLUGIN_DATA_DIR ?? './src/plugins',
      pluginQuickjsMemoryMb: parseIntSafe(env.PLUGIN_QUICKJS_MEMORY_MB, 32),
      pluginQuickjsStackSize: parseIntSafe(env.PLUGIN_QUICKJS_STACK_SIZE, 4096),
      pluginCredentialCheckIntervalMinutes: parseIntSafe(
        env.PLUGIN_CREDENTIAL_CHECK_INTERVAL_MINUTES,
        15,
      ),
      pluginCredentialStaleAfterMinutes: parseIntSafe(
        env.PLUGIN_CREDENTIAL_STALE_AFTER_MINUTES,
        10,
      ),
      pluginCredentialConcurrency: parseIntSafe(
        env.PLUGIN_CREDENTIAL_CONCURRENCY,
        3,
      ),
    });
  }
}
