import 'dart:async';
import 'dart:convert';

import 'package:simple_live_app/app/log.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/core/interface/live_danmaku.dart';
import 'package:simple_live_app/core/model/live_message.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// 纯客户端模式弹幕客户端。
///
/// 连接后端 nodejs WS 代理 `/api/v1/sites/{siteId}/rooms/{roomId}/danmaku`，
/// 由后端负责与上游直播平台的弹幕协议交互，客户端只做消息解析。
/// 协议与 `simple_live_apple_tv/.../DanmakuClient.swift` 对齐，参考
/// `simple_live_server_nodejs/src/service/danmaku-manager.ts` 与
/// `live-site-service.ts` 的 `messageToJson`。
class RemoteDanmaku extends LiveDanmaku {
  final String siteId;
  final String roomId;

  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  bool _stopped = false;

  RemoteDanmaku({required this.siteId, required this.roomId});

  @override
  Future start(dynamic args) async {
    _stopped = false;
    // 忽略入参（danmakuData）：弹幕由后端代理，客户端只需 baseUrl/siteId/roomId。
    final baseUrl = await LiveApiFactory.resolveBaseUrl();
    if (baseUrl.isEmpty) {
      onClose?.call('未配置服务端地址，无法连接弹幕');
      return;
    }
    final wsUrl = _buildWsUrl(baseUrl);
    try {
      final channel = WebSocketChannel.connect(Uri.parse(wsUrl));
      _channel = channel;
      _subscription = channel.stream.listen(
        _onData,
        onError: (Object e) {
          Log.d('[RemoteDanmaku] error: $e');
          onClose?.call('弹幕连接错误: $e');
        },
        onDone: () {
          Log.d('[RemoteDanmaku] connection closed');
        },
        cancelOnError: false,
      );
      onReady?.call();
    } catch (e) {
      Log.e('[RemoteDanmaku] 连接失败: $e', StackTrace.current);
      onClose?.call('弹幕连接失败: $e');
    }
  }

  /// 由 `http(s)://host:port` 推导 `ws(s)://host:port/api/v1/sites/.../danmaku`
  String _buildWsUrl(String baseUrl) {
    final uri = Uri.parse(baseUrl);
    final scheme = uri.scheme == 'https' ? 'wss' : 'ws';
    final host = uri.host;
    final port = uri.hasPort ? ':${uri.port}' : '';
    return '$scheme://$host$port/api/v1/sites/$siteId/rooms/$roomId/danmaku';
  }

  void _onData(dynamic data) {
    try {
      final Map<String, dynamic> msg;
      if (data is String) {
        msg = json.decode(data) as Map<String, dynamic>;
      } else if (data is Map) {
        msg = Map<String, dynamic>.from(data);
      } else {
        return;
      }
      _handleMessage(msg);
    } catch (e) {
      Log.d('[RemoteDanmaku] 消息解析失败: $e');
    }
  }

  void _handleMessage(Map<String, dynamic> msg) {
    final type = msg['type']?.toString();
    switch (type) {
      case 'chat':
        onMessage?.call(
          LiveMessage(
            type: LiveMessageType.chat,
            userName: msg['userName']?.toString() ?? '',
            message: msg['message']?.toString() ?? '',
            color: _parseColor(msg['color']?.toString()),
          ),
        );
        break;
      case 'online':
        final count = int.tryParse(msg['data']?.toString() ?? '') ?? 0;
        onMessage?.call(
          LiveMessage(
            type: LiveMessageType.online,
            userName: '',
            message: '',
            data: count,
            color: LiveMessageColor.white,
          ),
        );
        break;
      case 'superChat':
        // 后端 messageToJson 对 superChat 的 data 做了 String(...) 序列化，
        // 此处按可用字段尽力还原，缺失字段给默认值，避免 superChats 类型崩溃。
        onMessage?.call(
          LiveMessage(
            type: LiveMessageType.superChat,
            userName: msg['userName']?.toString() ?? '',
            message: msg['message']?.toString() ?? '',
            color: LiveMessageColor.white,
            data: LiveSuperChatMessage(
              userName: msg['userName']?.toString() ?? '',
              face: '',
              message: msg['message']?.toString() ?? '',
              price: (num.tryParse(msg['price']?.toString() ?? '') ?? 0).toInt(),
              startTime: DateTime.now(),
              endTime: DateTime.now().add(const Duration(minutes: 1)),
              backgroundColor: '#FB7299',
              backgroundBottomColor: '#FB7299',
            ),
          ),
        );
        break;
      case 'roomInfo':
      case 'info':
        // 房间信息 / 系统提示：忽略（直播详情已由 HTTP 提供）
        break;
      case 'close':
      case 'error':
        onClose?.call(msg['msg']?.toString() ?? '弹幕服务器断开');
        break;
      default:
        break;
    }
  }

  LiveMessageColor _parseColor(String? hex) {
    if (hex == null || !hex.startsWith('#') || hex.length != 7) {
      return LiveMessageColor.white;
    }
    try {
      return LiveMessageColor(
        int.parse(hex.substring(1, 3), radix: 16),
        int.parse(hex.substring(3, 5), radix: 16),
        int.parse(hex.substring(5, 7), radix: 16),
      );
    } catch (_) {
      return LiveMessageColor.white;
    }
  }

  @override
  void heartbeat() {
    // 后端代理负责与上游弹幕服务保活，客户端无需心跳。
  }

  @override
  Future stop() async {
    if (_stopped) return;
    _stopped = true;
    await _subscription?.cancel();
    _subscription = null;
    await _channel?.sink.close();
    _channel = null;
  }
}
