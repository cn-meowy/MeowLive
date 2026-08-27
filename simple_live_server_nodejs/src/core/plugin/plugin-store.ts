/**
 * 插件磁盘存储
 *
 * 布局：src/plugins/{pluginId}/{version}/{entry, preloadScripts, assets/}
 *
 * 职责：
 * - 扫描已安装 plugin
 * - 从 zipURL 下载 → 校验 sha256 → 解压到临时目录 → 原子重命名到最终目录
 * - 单条失败 → 删除 tmp，不影响其他 plugin
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { InstalledPlugin, PluginManifest } from './plugin-manifest.js';
import { CoreLog } from '../common/core-log.js';

export interface PluginStoreOptions {
  dataDir: string;
  /** 自定义 axios（测试用） */
  http?: AxiosInstance;
  /** 下载超时 ms */
  downloadTimeoutMs?: number;
}

export interface DownloadPluginOptions {
  pluginId: string;
  version: string;
  zipURL: string;
  sha256: string;
}

/** 安装或更新过程中产生的可恢复失败（不影响其他 plugin） */
export class PluginInstallError extends Error {
  constructor(pluginId: string, message: string, public readonly cause?: unknown) {
    super(`[plugin:${pluginId}] ${message}`);
  }
}

export class PluginStore {
  readonly dataDir: string;
  private readonly http: AxiosInstance;
  private readonly downloadTimeoutMs: number;

  constructor(options: PluginStoreOptions) {
    this.dataDir = options.dataDir;
    this.http =
      options.http ??
      axios.create({
        timeout: options.downloadTimeoutMs ?? 60000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? 60000;
  }

  /** 确保 dataDir 与 _tmp 目录存在 */
  async ensureDirs(): Promise<void> {
    await fsp.mkdir(this.dataDir, { recursive: true });
    await fsp.mkdir(path.join(this.dataDir, '_tmp'), { recursive: true });
  }

  /** 磁盘上某 plugin 的根目录 */
  pluginDir(pluginId: string, version: string): string {
    return path.join(this.dataDir, pluginId, version);
  }

  /** 读取并解析 manifest.json */
  async readManifest(pluginDirPath: string): Promise<PluginManifest> {
    const filePath = path.join(pluginDirPath, 'manifest.json');
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as PluginManifest;
    if (parsed.apiVersion !== 1) {
      throw new PluginInstallError(
        parsed.pluginId ?? '?',
        `不支持的 manifest apiVersion=${parsed.apiVersion}`,
      );
    }
    return parsed;
  }

  /** 扫描已安装的所有 plugin */
  async listInstalled(): Promise<InstalledPlugin[]> {
    const out: InstalledPlugin[] = [];
    let entries: string[] = [];
    try {
      entries = await fsp.readdir(this.dataDir);
    } catch {
      return out;
    }

    for (const pluginId of entries) {
      if (pluginId.startsWith('_')) continue;
      const pluginRoot = path.join(this.dataDir, pluginId);
      let stat;
      try {
        stat = await fsp.stat(pluginRoot);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      let versions: string[];
      try {
        versions = await fsp.readdir(pluginRoot);
      } catch {
        continue;
      }
      for (const version of versions) {
        const versionDir = path.join(pluginRoot, version);
        let vStat;
        try {
          vStat = await fsp.stat(versionDir);
        } catch {
          continue;
        }
        if (!vStat.isDirectory()) continue;
        try {
          const manifest = await this.readManifest(versionDir);
          const sha256 = (manifest['sha256'] as string | undefined) ?? '';
          out.push({
            manifest,
            pluginId,
            version,
            sha256,
            rootDir: versionDir,
          });
        } catch (err) {
          CoreLog.warn(
            `[PluginStore] 跳过损坏的 plugin 目录: ${versionDir}, ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }

    return out;
  }

  /**
   * 下载并安装一个 plugin（带 sha256 校验、原子替换）
   *
   * 失败抛 PluginInstallError，调用方应捕获并跳过该 plugin。
   */
  async install(opts: DownloadPluginOptions): Promise<InstalledPlugin> {
    await this.ensureDirs();

    const tmpZip = path.join(
      this.dataDir,
      '_tmp',
      `${opts.pluginId}-${opts.version}-${Date.now()}.zip`,
    );
    const tmpExtract = path.join(
      this.dataDir,
      '_tmp',
      `${opts.pluginId}-${opts.version}-${Date.now()}`,
    );

    try {
      // 1. 下载 zip
      await this._downloadZip(opts.zipURL, tmpZip);

      // 2. 校验 sha256
      const actual = await this._sha256OfFile(tmpZip);
      if (actual.toLowerCase() !== opts.sha256.toLowerCase()) {
        throw new PluginInstallError(
          opts.pluginId,
          `sha256 不一致: expected=${opts.sha256}, actual=${actual}`,
        );
      }

      // 3. 解压到 tmp
      await this._extractZip(tmpZip, tmpExtract);

      // 4. 校验解压结果：必须含 manifest.json
      const manifestPath = path.join(tmpExtract, 'manifest.json');
      try {
        await fsp.access(manifestPath);
      } catch {
        throw new PluginInstallError(
          opts.pluginId,
          `解压后缺少 manifest.json`,
        );
      }
      const manifestRaw = await fsp.readFile(manifestPath, 'utf8');
      const manifestObj = JSON.parse(manifestRaw) as PluginManifest;
      if (manifestObj.pluginId !== opts.pluginId) {
        throw new PluginInstallError(
          opts.pluginId,
          `manifest pluginId 与目录名不一致: ${manifestObj.pluginId}`,
        );
      }
      if (manifestObj.version !== opts.version) {
        throw new PluginInstallError(
          opts.pluginId,
          `manifest version 与请求不一致: ${manifestObj.version}`,
        );
      }

      // 5. 原子替换到 pluginId/version
      const finalDir = this.pluginDir(opts.pluginId, opts.version);
      await fsp.mkdir(path.dirname(finalDir), { recursive: true });
      try {
        await fsp.rm(finalDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
      try {
        await fsp.rename(tmpExtract, finalDir);
      } catch (err) {
        // rename 跨设备可能失败，fallback 复制
        await fsp.cp(tmpExtract, finalDir, { recursive: true });
        await fsp.rm(tmpExtract, { recursive: true, force: true });
      }

      CoreLog.info(
        `[PluginStore] 安装 plugin 成功: ${opts.pluginId}@${opts.version}`,
      );

      return {
        manifest: manifestObj,
        pluginId: opts.pluginId,
        version: opts.version,
        sha256: opts.sha256,
        rootDir: finalDir,
      };
    } finally {
      // 清理临时产物
      await Promise.all([
        fsp.rm(tmpZip, { force: true }),
        fsp.rm(tmpExtract, { recursive: true, force: true }),
      ]);
    }
  }

  /** 删除某个 plugin 的某个版本（reload 失败回滚或卸载） */
  async uninstall(pluginId: string, version: string): Promise<void> {
    const target = this.pluginDir(pluginId, version);
    await fsp.rm(target, { recursive: true, force: true });
  }

  private async _downloadZip(url: string, destPath: string): Promise<void> {
    const resp = await this.http.get<ArrayBuffer>(url, {
      timeout: this.downloadTimeoutMs,
      responseType: 'arraybuffer',
    });
    if (resp.status < 200 || resp.status >= 300 || !resp.data) {
      throw new PluginInstallError(
        '?',
        `下载失败 status=${resp.status} url=${url}`,
      );
    }
    const buf = Buffer.from(resp.data as ArrayBuffer);
    await fsp.writeFile(destPath, buf);
  }

  private async _sha256OfFile(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });
    return hash.digest('hex');
  }

  /**
   * 解压 zip —— 极简 deflate/stored 解压
   *
   * 假设所有 zip 由 carsonn 生成（标准 deflate + 普通压缩级别）。
   * 不支持加密/zip64/数据描述符/streaming。
   */
  private async _extractZip(zipPath: string, destDir: string): Promise<void> {
    await fsp.mkdir(destDir, { recursive: true });
    const buf = await fsp.readFile(zipPath);
    const entries = parseZipCentralDirectory(buf);
    const zlib = await import('node:zlib');
    for (const entry of entries) {
      if (entry.isDirectory) {
        await fsp.mkdir(path.join(destDir, entry.name), { recursive: true });
        continue;
      }
      const outPath = path.join(destDir, entry.name);
      await fsp.mkdir(path.dirname(outPath), { recursive: true });
      const data = entry.method === 0
        ? entry.data
        : zlib.inflateRawSync(entry.data);
      await fsp.writeFile(outPath, data);
    }
  }
}

/** 中央目录条目（最小子集） */
interface ZipEntry {
  name: string;
  isDirectory: boolean;
  method: number; // 0 = stored, 8 = deflate
  data: Buffer;
}

/**
 * 极简 ZIP 中央目录解析
 *
 * 仅支持 stored(0) / deflate(8)；不支持数据描述符 / 加密 / zip64。
 */
function parseZipCentralDirectory(buf: Buffer): ZipEntry[] {
  // 找 EOCD（末段最多 64KiB + 22B）
  const eocdSig = 0x06054b50;
  let eocdOffset = -1;
  const start = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === eocdSig) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('无效 zip：未找到 EOCD');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const fileNameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + fileNameLen);

    const lh = localHeaderOffset;
    if (buf.readUInt32LE(lh) !== 0x04034b50) {
      throw new Error(`无效 zip：local header 缺失 @${name}`);
    }
    const lhFileNameLen = buf.readUInt16LE(lh + 26);
    const lhExtraLen = buf.readUInt16LE(lh + 28);
    const dataStart = lh + 30 + lhFileNameLen + lhExtraLen;
    const data = buf.subarray(dataStart, dataStart + compressedSize);
    entries.push({
      name,
      isDirectory: name.endsWith('/'),
      method,
      data,
    });

    p += 46 + fileNameLen + extraLen + commentLen;
  }
  return entries;
}