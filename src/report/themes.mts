/** Theme choices are presentation-only. Evidence pixels and report facts never change. */
export const reportThemes = [
  { id: 'A', name: '暖砂灰', tone: 'light', background: '#e5dfd5', panel: '#eee9e1', header: '#e8e2d8', surface: '#e3ddd3', ink: '#36352f', muted: '#5f5b54', line: '#cbc4b8', accent: '#645647' },
  { id: 'B', name: '雾松绿', tone: 'light', background: '#dbe3db', panel: '#e6ece3', header: '#dfe7dd', surface: '#d8e1d6', ink: '#2e3d35', muted: '#526256', line: '#bdcbbc', accent: '#42654c' },
  { id: 'C', name: '雾蓝灰', tone: 'light', background: '#dbe2ea', panel: '#e7ecf2', header: '#dfe7ef', surface: '#d7e0ea', ink: '#303e50', muted: '#536176', line: '#bac8d8', accent: '#426181' },
  { id: 'D', name: '浅杏纸纹', tone: 'light', background: '#e5dbca', panel: '#eee5d6', header: '#e8decb', surface: '#e2d6c1', ink: '#423b30', muted: '#665b49', line: '#ccbea5', accent: '#786246' },
  { id: 'E', name: '深海蓝', tone: 'dark', background: '#182230', panel: '#243244', header: '#1e2b3c', surface: '#2c3c50', ink: '#dce5ef', muted: '#a3b3c6', line: '#3d4f65', accent: '#b7cee9' },
  { id: 'F', name: '石墨灰', tone: 'dark', background: '#222427', panel: '#2d3035', header: '#272a2e', surface: '#373b42', ink: '#e0e2e5', muted: '#afb5bd', line: '#494e56', accent: '#c9d1df' },
  { id: 'G', name: '墨松绿', tone: 'dark', background: '#1c2925', panel: '#293a32', header: '#22322b', surface: '#32473c', ink: '#dce7de', muted: '#acbfb0', line: '#435a4c', accent: '#b8d8c0' },
  { id: 'H', name: '暖炭棕', tone: 'dark', background: '#2a2522', panel: '#39312c', header: '#312a25', surface: '#463c34', ink: '#e9e0d5', muted: '#c0b1a2', line: '#5c4e43', accent: '#e3c7a8' },
] as const;
export function reportThemeCss(): string {
  return reportThemes.map(t => `${t.id === 'A' ? ':root,' : ''}:root[data-theme="${t.id}"]{color-scheme:${t.tone};${(['background','panel','header','surface','ink','muted','line','accent'] as const).map(k => `--${k}:${t[k]}`).join(';')};${t.tone === 'dark' ? '--violation-bg:#4d2e34;--violation-fg:#f0b6be;--inconclusive-bg:#493d26;--inconclusive-fg:#e8d19a;--verified-bg:#284335;--verified-fg:#b5dcc2;--not-tested-bg:#353d47;--not-tested-fg:#c4cedb;--note-bg:#443b2a;--note-fg:#e8d8b9' : '--violation-bg:#e8d4d3;--violation-fg:#813e42;--inconclusive-bg:#e8ddbd;--inconclusive-fg:#70591d;--verified-bg:#cfdfd1;--verified-fg:#325d43;--not-tested-bg:#d9dbd9;--not-tested-fg:#515b62;--note-bg:#e8dfc8;--note-fg:#70591d'}}`).join('\n') + '\n:root[data-theme="C"] body{background-image:linear-gradient(135deg,#d5dfe9,#e1e7ee 48%,#d6e0e8);background-attachment:fixed}:root[data-theme="D"] body{background-image:radial-gradient(#62503b0a .5px,transparent .5px),linear-gradient(115deg,#e5dccd,#dfd3bf);background-size:3px 3px,100% 100%;background-attachment:fixed}';
}
