import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SOURCE_ROOT } from '../src/scripts/toolchain.mjs';

test('AGENTS navigation has resolvable local entries and preserves the development requirements', async () => {
  const content = await fs.readFile(path.join(SOURCE_ROOT, 'AGENTS.md'), 'utf8');
  const begin = content.indexOf('## 项目导航');
  const end = content.indexOf('## 固定要求');
  assert.ok(begin > 0 && end > begin);
  const navigation = content.slice(begin, end);
  const links = [...navigation.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)];
  assert.ok(links.length >= 20);
  for (const match of links) {
    const target = path.resolve(SOURCE_ROOT, match[1]!);
    const relative = path.relative(SOURCE_ROOT, target);
    assert.ok(!path.isAbsolute(relative) && !relative.startsWith('..'));
    await fs.stat(target);
  }
  for (const required of ['schemas/*.schema.json', 'src/contracts/generated/*.d.mts', '.build/runtime/', 'npm run typecheck', 'npm test', 'npm run check:public']) assert.ok(navigation.includes(required));
  assert.ok(content.includes('## 方法保持开放'));
  assert.ok(content.includes('## 正式版本发布'));
  assert.ok(content.includes('## 分支命名与本地工作目录'));
});
