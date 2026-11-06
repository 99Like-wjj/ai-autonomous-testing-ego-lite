/** One whitelist for portable evidence links, history verification and chat sources. */
export function safeAttachmentPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (/^attachments\/[a-f0-9]{64}\.(?:png|jpg|webp|txt|bin)$/.test(value)) return value;
  const match = /^attachments\/[a-f0-9]{64}-[a-f0-9]{12}\/([^/\\]+)$/.exec(value);
  return match && match[1] === portableFileName(match[1]!) ? value : undefined;
}
/** OS-safe basename only. Original spelling remains in metadata and the archive index. */
export function portableFileName(name: string): string {
  let value = name.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/[. ]+$/, '');
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) value = '_' + value;
  const dot = value.lastIndexOf('.'), extension = dot > 0 && value.length - dot <= 25 ? value.slice(dot) : '';
  let base = extension ? value.slice(0, dot) : value;
  while (new TextEncoder().encode(base + extension).length > 180) base = [...base].slice(0, -1).join('');
  return (base || 'test-file') + extension;
}
export function attachmentHref(value: unknown): string | undefined {
  const path = safeAttachmentPath(value);
  return path?.split('/').map(segment => encodeURIComponent(segment)).join('/');
}
