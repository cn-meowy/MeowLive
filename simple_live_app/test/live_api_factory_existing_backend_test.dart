import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:hive/hive.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/services/embedded_live_server.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/services/remote_live_api.dart';
import 'package:simple_live_app/services/local_storage_service.dart';

/// 回归：本机地址上已经运行自建后端时，应直接连接该后端（渲染其返回的站点），
/// 而不是误启动内嵌服务（内嵌服务只会返回内置 4 站点，导致首页看不到后端站点）。
void main() {
  setUpAll(() async {
    Hive.init('/tmp/dart_simple_live_test_${DateTime.now().millisecondsSinceEpoch}');
    if (!Get.isRegistered<LocalStorageService>()) {
      final svc = Get.put(LocalStorageService());
      await svc.init();
    }
    if (!Get.isRegistered<AppSettingsController>()) {
      Get.put(AppSettingsController());
    }
  });

  setUp(() async {
    await LiveApiFactory.reset();
    LiveApiFactory.restoreCreateInstance();
    AppSettingsController.instance.serverUrl.value = '';
    AppSettingsController.instance.embeddedServerStatus.value = 'disabled';
    await EmbeddedLiveServer.instance.stop();
  });

  tearDown(() async {
    await LiveApiFactory.reset();
    LiveApiFactory.restoreCreateInstance();
    AppSettingsController.instance.serverUrl.value = '';
    AppSettingsController.instance.embeddedServerStatus.value = 'disabled';
    await EmbeddedLiveServer.instance.stop();
  });

  test('本机地址已运行可用后端（/health 返回 ok）时直接连接，不启动内嵌服务', () async {
    // 模拟一个已在 127.0.0.1 上运行的真实后端（如 simple_live_server_nodejs）。
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final route = server;
    var healthHits = 0;
    route.listen((request) async {
      if (request.uri.path == '/health') {
        healthHits++;
        request.response.write('ok');
      } else {
        request.response.statusCode = 404;
      }
      await request.response.close();
    });
    final backendUrl = 'http://127.0.0.1:${server.port}';

    try {
      AppSettingsController.instance.serverUrl.value = backendUrl;

      final api = await LiveApiFactory.instanceAsync;

      // 直接连到已存在的后端，而非内嵌服务
      expect(api, isA<RemoteLiveApi>());
      expect((api as RemoteLiveApi).baseUrl, backendUrl,
          reason: '应连接配置的本机后端地址，而不是内嵌服务的随机地址');
      expect(
        AppSettingsController.instance.embeddedServerStatus.value,
        'remote:ok',
      );

      // 探测 /health 至少发生一次（确认走了“先探测已存在后端”的分支）
      expect(healthHits, greaterThanOrEqualTo(1));
    } finally {
      await server.close(force: true);
    }
  });
}