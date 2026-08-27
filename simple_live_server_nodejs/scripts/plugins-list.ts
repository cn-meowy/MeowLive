/**
 * plugins-list 调试脚本
 *
 * 列出 src/plugins/ 下所有已安装 plugin 的简要信息。
 */

import * as path from 'path';
import { PluginStore } from '../src/core/plugin/plugin-store.js';

const DATA_DIR = process.env['PLUGIN_DATA_DIR'] ?? './src/plugins';

async function main(): Promise<void> {
  const store = new PluginStore({ dataDir: DATA_DIR });
  await store.ensureDirs();
  const installed = await store.listInstalled();
  if (installed.length === 0) {
    console.log(`(empty) dataDir=${path.resolve(DATA_DIR)}`);
    return;
  }
  console.log(`已安装 ${installed.length} 个 plugin:`);
  for (const p of installed) {
    const transport =
      p.manifest.capabilities?.danmaku?.transport ?? 'n/a';
    const status =
      p.manifest.capabilities?.danmaku?.status ?? 'n/a';
    const required = p.manifest.auth?.required ? 'login' : 'public';
    console.log(
      `  - ${p.pluginId}@${p.version}  ${required}  danmaku=${status}/${transport}  sha256=${p.sha256.slice(0, 12)}…`,
    );
  }
}

main().catch((err) => {
  console.error('[plugins-list] 错误:', err);
  process.exit(1);
});