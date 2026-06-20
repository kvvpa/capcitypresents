import YAML from 'yaml';

export function parseFrontmatter(raw = '') {
  const match = String(raw).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, content: String(raw) };
  return {
    data: YAML.parse(match[1]) || {},
    content: String(raw).slice(match[0].length),
  };
}

export function stringifyFrontmatter(content, data) {
  const yaml = YAML.stringify(data, {
    lineWidth: 0,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  });
  return `---\n${yaml}---\n${content}`;
}
