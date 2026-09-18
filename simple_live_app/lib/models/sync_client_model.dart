/// 局域网同步设备信息模型。
///
/// 纯数据类，独立存放（与 `SyncService` 解耦）：导航/请求层只需该模型，
/// 不依赖承载 UDP/HTTP 服务的 `sync_service` 库，便于 iOS 纯客户端构建
/// 将整个本地局域网同步服务 tree-shake 出二进制。
class SyncClinet {
  final String id;
  final String name;
  final String address;
  final int port;
  final String type;
  SyncClinet({
    required this.id,
    required this.name,
    required this.address,
    required this.port,
    required this.type,
  });
}