import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';

import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/services/live_api_factory.dart';
import 'package:simple_live_app/app/services/live_api_service.dart';
import 'package:simple_live_app/app/services/sites_service.dart';
import 'package:simple_live_app/core/simple_live_core.dart';

/// 避免依赖 LocalStorageService / DB 等存储：onInit 仅用于被 SitesService
/// 读取的 `serverUrl` / `siteSort` 字段（均字段级初始化，与 onInit 无关）。
class _FakeSettings extends AppSettingsController {
  // super.onInit() 需要 LocalStorageService 等存储服务，单测不初始化它们；
  // 仅依赖字段级初始化的 serverUrl / siteSort。
  @override
  void onInit() {} // ignore: must_call_super
}

/// 创建时捕获当前 serverUrl 的 fake，用于模拟 RemoteLiveApi 在构造时
/// 固定 baseUrl 的行为：若不先 reset，缓存实例会命中旧地址。
class _UrlCapturingFake implements LiveApiService {
  final String baseUrl;
  _UrlCapturingFake(this.baseUrl);

  @override
  Future<List<Map<String, dynamic>>> getSites() async {
    if (baseUrl.contains('b.local')) {
      return const [
        {'id': 'b_site', 'name': 'B'},
        {'id': 'b2_site', 'name': 'B2'},
      ];
    }
    if (baseUrl.contains('c.local')) {
      return const [
        {'id': 'c_site', 'name': 'C', 'logo': '/api/v1/plugins/assets/c_site/mini_live_card_c_site.png'},
      ];
    }
    return const [
      {'id': 'a_site', 'name': 'A'},
    ];
  }

  @override
  Future<List<LiveCategory>> getCategores(String siteId) async => [];

  @override
  Future<LiveCategoryResult> getRecommendRooms(String siteId,
          {int page = 1}) async =>
      LiveCategoryResult(hasMore: false, items: []);

  @override
  Future<LiveCategoryResult> getCategoryRooms(
    String siteId,
    LiveSubCategory category, {
    int page = 1,
  }) async =>
      LiveCategoryResult(hasMore: false, items: []);

  @override
  Future<LiveSearchRoomResult> searchRooms(
    String siteId,
    String keyword, {
    int page = 1,
  }) async =>
      LiveSearchRoomResult(hasMore: false, items: []);

  @override
  Future<LiveSearchAnchorResult> searchAnchors(
    String siteId,
    String keyword, {
    int page = 1,
  }) async =>
      LiveSearchAnchorResult(hasMore: false, items: []);

  @override
  Future<LiveRoomDetail> getRoomDetail(String siteId, String roomId) =>
      throw UnimplementedError();

  @override
  Future<bool> getLiveStatus(String siteId, String roomId) async => false;

  @override
  Future<List<LivePlayQuality>> getPlayQualites(
          String siteId, LiveRoomDetail detail) async =>
      [];

  @override
  Future<LivePlayUrl> getPlayUrls(
    String siteId,
    LiveRoomDetail detail,
    LivePlayQuality quality,
  ) =>
      throw UnimplementedError();

  @override
  Future<List<LiveSuperChatMessage>> getSuperChatMessage(
          String siteId, String roomId) async =>
      [];

  @override
  LiveDanmaku getDanmaku(String siteId, {String? roomId}) => LiveDanmaku();
}

Future<List<String>> _siteIds(SitesService service) =>
    Future.value(service.remoteSites.map((s) => s.id).toList());

void main() {
  late AppSettingsController settings;
  late SitesService service;

  setUp(() {
    Get.reset();
    settings = _FakeSettings();
    Get.put<AppSettingsController>(settings, permanent: true);
    service = Get.put(SitesService(), permanent: true);
  });

  tearDown(() {
    Get.reset();
    LiveApiFactory.restoreCreateInstance();
  });

  test('变换 serverUrl 后先 reset 再拉取，用当前后端而非旧地址缓存实例', () async {
    LiveApiFactory.overrideCreateInstance(
      () async => _UrlCapturingFake(settings.serverUrl.value),
    );

    settings.serverUrl.value = 'http://a.local';
    await LiveApiFactory.reset();
    await service.fetchRemoteSites();
    expect(await _siteIds(service), ['a_site']);

    // 变更地址但【不】reset：缓存实例仍按旧地址创建 → 返回旧站点（复现缺陷行为）
    settings.serverUrl.value = 'http://b.local';
    await service.fetchRemoteSites();
    expect(await _siteIds(service), ['a_site'],
        reason: '未 reset 时应仍拿到旧地址实例的站点列表');

    // 修复路径：先 reset 再拉取 → 使用新后端站点
    await LiveApiFactory.reset();
    await service.fetchRemoteSites();
    expect(await _siteIds(service), ['b_site', 'b2_site'],
        reason: 'reset 后应使用当前 serverUrl 新建的实例');
  });

  test('后端返回 logo 时 Site.logo 使用后端值；未返回时回退默认', () async {
    LiveApiFactory.overrideCreateInstance(
      () async => _UrlCapturingFake(settings.serverUrl.value),
    );

    // 后端返回 logo：Site.logo 应与后端一致
    settings.serverUrl.value = 'http://c.local';
    await LiveApiFactory.reset();
    await service.fetchRemoteSites();
    final cLogo = service.remoteSites.single.logo;
    expect(
      cLogo,
      '/api/v1/plugins/assets/c_site/mini_live_card_c_site.png',
      reason: '应优先使用后端返回的 logo 字段',
    );

    // 后端未返回 logo：回退本地默认图标
    settings.serverUrl.value = 'http://a.local';
    await LiveApiFactory.reset();
    await service.fetchRemoteSites();
    expect(service.remoteSites.single.logo, 'assets/images/logo.png',
        reason: '未知站点未带 logo 时应回退默认图标');
  });
}