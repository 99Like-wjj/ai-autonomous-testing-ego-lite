/** Development-only navigation validation. Never decides relevance or business verdicts. */
import fs from 'node:fs/promises';
import path from 'node:path';
export async function checkExperience(root: string): Promise<string[]> {
  const errors: string[] = [], ids = new Set<string>();
  const realRoot = await fs.realpath(root);
  for (const [filename, stage, prefix] of [['case-design-guide.md', '设计', 'D'], ['experience-guide.md', '执行', 'E']] as const) {
    const source = await fs.readFile(path.join(root, filename), 'utf8');
    if (!source.split('## 主题索引')[0]?.includes('适用阶段：' + stage + '。')) errors.push(filename + ': wrong entry stage');
    const entries = source.split(/(?=^- 标识：)/m).slice(1);
    if (!entries.length) errors.push(filename + ': empty index');
    for (const entry of entries) {
      const block = (entry.split(/^\s*$/m)[0] ?? '').trimEnd();
      const id = /^- 标识：([DE]-[A-Z][A-Z0-9-]*)$/m.exec(block)?.[1];
      if (!id || !id.startsWith(prefix + '-')) { errors.push(filename + ': invalid id'); continue; }
      if (ids.has(id)) errors.push(id + ': duplicate id'); ids.add(id);
      const fields = new Map<string, string>();
      for (const line of block.split('\n').slice(1)) {
        const field = /^  - ([^：]+)：(.+)$/.exec(line);
        if (!field?.[1] || !field[2]) { errors.push(id + ': invalid field'); continue; }
        if (fields.has(field[1])) errors.push(id + ': duplicate field');
        fields.set(field[1], field[2]);
      }
      const required = ['阶段', '主题', '触发线索', '检索别名', '正文位置'];
      if (fields.size !== required.length || required.some(key => !fields.get(key)?.trim())) errors.push(id + ': missing or unknown field');
      if (fields.get('阶段') !== stage) errors.push(id + ': wrong stage');
      const link = /^\[[^\]]+\]\(([a-z][a-z0-9-]*\.md)#([a-z][a-z0-9-]*)\)$/.exec(fields.get('正文位置') ?? '');
      if (!link?.[1] || !link[2] || link[2] !== id.toLowerCase()) { errors.push(id + ': invalid target'); continue; }
      try {
        const target = path.join(root, link[1]);
        const real = await fs.realpath(target);
        if (path.dirname(real) !== realRoot || !(await fs.lstat(target)).isFile()) throw new Error('target outside references or not regular');
        const text = await fs.readFile(target, 'utf8');
        const anchors = [...text.matchAll(/<a id="([a-z][a-z0-9-]*)"><\/a>/g)].map(m => m[1]);
        if (new Set(anchors).size !== anchors.length) errors.push(id + ': duplicate anchor');
        const marker = '<a id="' + link[2] + '"></a>';
        if (!text.includes(marker)) { errors.push(id + ': missing anchor'); continue; }
        const section = text.slice(text.indexOf(marker) + marker.length).split('<a id=')[0] ?? '';
        if (!section.includes('适用阶段：' + stage + '。')) errors.push(id + ': target stage mismatch');
        if (!section.includes('不适用与边界：')) errors.push(id + ': missing exception');
      } catch { errors.push(id + ': unreadable or unsafe target'); }
    }
  }
  return errors;
}
