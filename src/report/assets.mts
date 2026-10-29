/** Safe, deterministic presentation of already retained files. No capture or business requests. */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { HtmlPayload, Preview, Report, ReportAsset } from '../contracts/model.mjs';
import { errorInfo, fail, hash } from '../core/common.mjs';
import { evidenceFile } from '../core/file-integrity.mjs';

export const TEXT_PREVIEW_LIMIT = 256 * 1024;
export interface PayloadOptions { mode?: 'inline' | 'bundle'; textPreviewLimitBytes?: number; allowMissingScreenshots?: boolean }
export function rasterMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}
/** Dimensions describe bytes; they do not certify image decode or semantic coverage. */
export function rasterDimensions(b: Buffer): { width: number; height: number } | undefined {
  const mime = rasterMime(b); let width = 0, height = 0;
  if (mime === 'image/png' && b.length >= 24 && b.toString('ascii', 12, 16) === 'IHDR') { width = b.readUInt32BE(16); height = b.readUInt32BE(20); }
  if (mime === 'image/jpeg') {
    for (let i = 2; i + 8 < b.length;) {
      if (b[i] !== 255) break; const marker = b[i + 1]!; if (marker === 255) { i++; continue; }
      if (marker === 217 || marker === 218) break;
      if (marker === 216 || marker === 1 || marker >= 208 && marker <= 215) { i += 2; continue; }
      const length = b.readUInt16BE(i + 2); if (length < 2 || i + 2 + length > b.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 7) { height = b.readUInt16BE(i + 5); width = b.readUInt16BE(i + 7); break; }
      i += length + 2;
    }
  }
  if (mime === 'image/webp' && b.length >= 30) {
    const type = b.toString('ascii', 12, 16);
    if (type === 'VP8X') { width = 1 + b.readUIntLE(24, 3); height = 1 + b.readUIntLE(27, 3); }
    else if (type === 'VP8 ' && b[23] === 157 && b[24] === 1 && b[25] === 42) { width = b.readUInt16LE(26) & 16383; height = b.readUInt16LE(28) & 16383; }
    else if (type === 'VP8L' && b[20] === 47) { const bits = b.readUInt32LE(21); width = (bits & 16383) + 1; height = ((bits >>> 14) & 16383) + 1; }
  }
  return width > 0 && height > 0 ? { width, height } : undefined;
}
function utf8(bytes: Buffer): string | undefined {
  if (bytes.includes(0)) return undefined;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return undefined; }
}
function textPrefix(bytes: Buffer, limit: number): { text: string; retainedBytes: number } {
  let end = Math.min(bytes.length, limit); const minimum = Math.max(0, end - 3);
  while (end >= minimum) { const text = utf8(bytes.subarray(0, end)); if (text !== undefined) return { text, retainedBytes: end }; end--; }
  return { text: '', retainedBytes: 0 };
}
export function attachmentName(sha256: string, mediaType?: string): string {
  const extension = mediaType === 'image/png' ? '.png' : mediaType === 'image/jpeg' ? '.jpg' : mediaType === 'image/webp' ? '.webp' : mediaType?.startsWith('text/') || mediaType === 'application/json' ? '.txt' : '.bin';
  return 'attachments/' + sha256 + extension;
}
export async function htmlReportPayload(root: string, report: Report, options: PayloadOptions = {}): Promise<HtmlPayload> {
  if (report.schemaVersion !== 8) fail('Unsupported report format; v8 is required. Historical files remain unchanged.');
  const mode = options.mode ?? 'inline', textPreviewLimitBytes = options.textPreviewLimitBytes ?? TEXT_PREVIEW_LIMIT;
  if (!['inline', 'bundle'].includes(mode) || !Number.isSafeInteger(textPreviewLimitBytes) || textPreviewLimitBytes < 256 || textPreviewLimitBytes > 16 * 1024 * 1024) fail('Invalid report delivery options.');
  const previews: Record<string, Preview> = {}, assets: Record<string, ReportAsset> = {};
  let complete = true;
  for (const item of report.evidenceCatalog.items) {
    const meta = item.metadata, p: Preview = { preview: null, previewNote: '', contentState: meta?.contentState ?? 'unknown' };
    previews[item.id] = p;
    let bytes: Buffer;
    try { bytes = await fs.readFile(await evidenceFile(root, item.path)); }
    catch (error) {
      if (options.allowMissingScreenshots && item.kind === 'screenshot' && errorInfo(error).code === 'ENOENT') {
        p.contentState = 'missing'; p.previewNote = '原始截图文件缺失；此草稿不完整，不能查看或补造现场。'; complete = false; continue;
      }
      throw error;
    }
    if (hash(bytes) !== item.sha256 || bytes.length !== item.bytes) fail('Evidence content hash or byte count mismatch while building report: ' + item.id);
    if (meta?.contentState === 'excluded' || meta?.contentState === 'failed') {
      p.previewNote = (meta.contentState === 'excluded' ? '正文被记录策略排除，不在报告中交付。' : '原记录声明采集失败，不把留存说明冒充现场正文。') + (meta.omissionReason ?? '');
      complete = false; continue;
    }
    const mime = rasterMime(bytes);
    if (item.kind === 'screenshot') {
      if (mime) {
        p.assetId = item.sha256; p.mediaType = mime; Object.assign(p, rasterDimensions(bytes));
        assets[item.sha256] ??= { kind: 'image', mediaType: mime, bytes: bytes.length, retainedBytes: bytes.length, truncated: false, data: 'data:' + mime + ';base64,' + bytes.toString('base64') };
        if (meta?.width && p.width && meta.width !== p.width || meta?.height && p.height && meta.height !== p.height) p.previewNote = '来源声明尺寸与文件实际尺寸不一致；展示文件实际宽高。';
      } else { p.contentState = 'unsupported'; p.previewNote = '已登记截图不是支持预览的 PNG、JPEG 或 WebP。原文件未被当作可执行内容打开。'; if (mode === 'inline') complete = false; }
    } else {
      const sourceText = meta?.encoding && !['utf8','utf-8'].includes(meta.encoding.toLowerCase()) ? undefined : utf8(bytes);
      if (sourceText !== undefined) {
        const mediaType = meta?.mediaType?.startsWith('text/') || meta?.mediaType === 'application/json' ? meta.mediaType : path.extname(item.path).toLowerCase() === '.json' ? 'application/json' : 'text/plain';
        const prefix = textPrefix(bytes, textPreviewLimitBytes), truncated = prefix.retainedBytes < bytes.length;
        p.assetId = item.sha256; p.mediaType = mediaType;
        assets[item.sha256] ??= { kind: 'text', mediaType, bytes: bytes.length, retainedBytes: prefix.retainedBytes, truncated, text: prefix.text };
        if (truncated) { p.previewNote = '正文展示前 ' + prefix.retainedBytes + ' / ' + bytes.length + ' 字节；' + (mode === 'bundle' ? '完整留存文件见附件。' : '单文件报告未包含其余正文，需显式导出附件包。'); if (mode === 'inline') complete = false; }
        else p.previewNote = '展示已留存的 UTF-8 文件正文；来源内容状态为 ' + p.contentState + '，不据此声称完整 HTTP 响应。';
      } else { p.contentState = 'unsupported'; p.previewNote = '该证据为二进制或不支持的文字编码，未作为文本/HTML执行或猜测解码。'; if (mode === 'inline') complete = false; }
    }
    if (mode === 'bundle') p.attachmentPath = attachmentName(item.sha256, p.mediaType);
  }
  return { htmlPayloadVersion: 8, report, previews, assets, delivery: { mode, textPreviewLimitBytes, complete, allowMissingScreenshots: options.allowMissingScreenshots === true } };
}
