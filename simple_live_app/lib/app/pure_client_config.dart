/// 纯客户端模式开关。
///
/// 双层保障，保证 iOS 始终按纯客户端运行：
///
/// 1. 编译期：iOS 构建注入 `--dart-define=PURE_CLIENT=true`
///    （CI 已传参；Xcode 工程 `DART_DEFINES` 也已内置，见
///    ios/Runner.xcodeproj）。`kPureClient` 是编译期常量，
///    `if (kPureClient)` / `if (!kPureClient)` 在 release AOT 下常量折叠，
///    死分支被 tree-shake，不会进入 iOS 二进制。
/// 2. 运行时兜底：即使个别 iOS 构建未注入该定义（如临时本地构建），
///    所有纯客户端门控处都带有 `Platform.isIOS` 二次判断（统一写作
///    `kPureClient || Platform.isIOS`），保证 iOS 运行时绝不启动
///    EmbeddedLiveServer、不拼接端口、不加载内置/JS 站点、弹幕一律走
///    后端 WS 代理，也不会触发本地网络权限弹窗。
///
/// - true：纯客户端，只连远程后端，弹幕走后端 WS 代理；不内置
///   EmbeddedLiveServer / 内置站点 / JS 站点。
/// - false（默认）：完整模式（Android/桌面），保留内嵌服务 + 内置站点 +
///   JS 站点 + 直连弹幕。
const bool kPureClient = bool.fromEnvironment(
  'PURE_CLIENT',
  defaultValue: false,
);