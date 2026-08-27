import 'package:flutter/material.dart';
import 'package:simple_live_app/widgets/net_image.dart';

/// 站点图标
///
/// 站点 [`Site.logo`](../app/sites.dart) 可能为本地 assets 路径
/// （如 `assets/images/bilibili_2.png`）或后端返回的网络/相对 URL
/// （如 `/api/v1/plugins/assets/bigo/mini_live_card_bigo.png`），
/// 本组件自动区分：
/// - 空字符串 / `assets/` 开头 → `Image.asset`（本地资源）
/// - 其他 → `NetImage`（网络图片，`/api/` 相对路径自动拼接 serverUrl）
class SiteLogo extends StatelessWidget {
  final String logo;
  final double? width;
  final double? height;
  final BoxFit fit;
  const SiteLogo(
    this.logo, {
    super.key,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
  });

  @override
  Widget build(BuildContext context) {
    if (logo.length > 1 && !logo.startsWith('assets/')) {
      return NetImage(logo, width: width, height: height, fit: fit);
    }
    return Image.asset(
      logo.isEmpty ? 'assets/images/logo.png' : logo,
      width: width,
      height: height,
      fit: fit,
      errorBuilder: (_, __, ___) =>
          const Icon(Icons.tv, color: Colors.grey, size: 24),
    );
  }
}