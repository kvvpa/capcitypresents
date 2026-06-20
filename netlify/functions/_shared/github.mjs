import { parseFrontmatter } from '../../../scripts/events/frontmatter.mjs';

function env(name, fallback = '') {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || fallback;
}

export function githubConfig() {
  return {
    owner: env('GITHUB_REPO_OWNER', 'kvvpa'),
    repo: env('GITHUB_REPO_NAME', 'capcitypresents'),
    branch: env('GITHUB_BRANCH', 'master'),
    token: env('GITHUB_AUTOMATION_TOKEN'),
    workflow: env('GITHUB_SYNC_WORKFLOW', 'event-sync.yml'),
  };
}

async function githubRequest(path, options = {}) {
  const { token } = githubConfig();
  if (!token) throw new Error('GITHUB_AUTOMATION_TOKEN is not configured in Netlify.');
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'CapCityPresentsAdmin/1.0',
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || `GitHub returned ${response.status}.`);
  }
  return payload;
}

export async function getHeadSha() {
  const { owner, repo, branch } = githubConfig();
  const ref = await githubRequest(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  return ref.object.sha;
}

export async function dispatchSync(actor = '') {
  const { owner, repo, branch, workflow } = githubConfig();
  await githubRequest(`/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
      ref: branch,
      inputs: { requested_by: actor || 'CapCity admin' },
    }),
  });
}

export async function getLatestSyncRun() {
  const { owner, repo, branch, workflow } = githubConfig();
  const payload = await githubRequest(
    `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${encodeURIComponent(branch)}&per_page=1`,
  );
  const run = payload.workflow_runs?.[0];
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    url: run.html_url,
  };
}

export async function getJsonFile(repoPath, ref) {
  const text = await getTextFile(repoPath, ref);
  return text ? JSON.parse(text) : null;
}

export async function getTextFile(repoPath, ref) {
  const { owner, repo, branch } = githubConfig();
  try {
    const payload = await githubRequest(
      `/repos/${owner}/${repo}/contents/${repoPath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref || branch)}`,
    );
    if (!payload?.content) return null;
    return Buffer.from(payload.content, 'base64').toString('utf8');
  } catch (error) {
    if (/not found/i.test(error.message)) return null;
    throw error;
  }
}

export async function getCurrentSyncState(ref) {
  return (await getJsonFile('event-sync/state.json', ref)) || { flags: [], events: {} };
}

export async function listEventCommits(since, until = new Date().toISOString()) {
  const { owner, repo, branch } = githubConfig();
  const query = new URLSearchParams({
    sha: branch,
    path: 'src/content/events',
    since,
    until,
    per_page: '100',
  });
  const commits = await githubRequest(`/repos/${owner}/${repo}/commits?${query}`);
  return commits.reverse();
}

async function getCommit(sha) {
  const { owner, repo } = githubConfig();
  return githubRequest(`/repos/${owner}/${repo}/commits/${sha}`);
}

function normalizeDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function parseEvent(text) {
  if (!text) return { data: {}, body: '' };
  const parsed = parseFrontmatter(text);
  return {
    data: { ...parsed.data, date: normalizeDate(parsed.data.date) },
    body: parsed.content.trim(),
  };
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableSort(value[key])]));
  }
  return value;
}

function valuesDiffer(a, b) {
  return JSON.stringify(stableSort(a ?? '')) !== JSON.stringify(stableSort(b ?? ''));
}

function eventDiff(beforeText, afterText) {
  const before = parseEvent(beforeText);
  const after = parseEvent(afterText);
  const beforeFields = { ...before.data, description: before.body };
  const afterFields = { ...after.data, description: after.body };
  const fields = new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)]);
  return [...fields]
    .filter((field) => valuesDiffer(beforeFields[field], afterFields[field]))
    .map((field) => ({
      field,
      before: beforeFields[field] ?? '',
      after: afterFields[field] ?? '',
    }));
}

function isAutomatedCommit(commit) {
  const login = commit.author?.login || '';
  const name = commit.commit?.author?.name || '';
  const email = commit.commit?.author?.email || '';
  const message = commit.commit?.message || '';
  return (
    login === 'github-actions[bot]' ||
    /capcity event sync/i.test(name) ||
    /github-actions\[bot\]/i.test(email) ||
    /^Sync event listings\b/i.test(message)
  );
}

export async function collectEventChanges(since, until) {
  const commits = await listEventCommits(since, until);
  const changes = [];
  for (const summary of commits) {
    const commit = await getCommit(summary.sha);
    const parentSha = commit.parents?.[0]?.sha;
    const eventFiles = (commit.files || []).filter((file) => file.filename.startsWith('src/content/events/'));
    const fields = [];
    for (const file of eventFiles) {
      const beforeText = parentSha && file.status !== 'added' ? await getTextFile(file.filename, parentSha) : null;
      const afterText = file.status !== 'removed' ? await getTextFile(file.filename, commit.sha) : null;
      const fileFields = eventDiff(beforeText, afterText);
      if (fileFields.length) {
        fields.push({
          file: file.filename,
          title: parseEvent(afterText || beforeText).data.title || file.filename,
          status: file.status,
          fields: fileFields,
        });
      }
    }
    if (!fields.length) continue;
    changes.push({
      sha: commit.sha,
      shortSha: commit.sha.slice(0, 7),
      message: String(commit.commit?.message || '').split('\n')[0],
      author: commit.commit?.author?.name || commit.author?.login || 'Unknown editor',
      email: commit.commit?.author?.email || '',
      timestamp: commit.commit?.author?.date || commit.commit?.committer?.date,
      automated: isAutomatedCommit(commit),
      events: fields,
    });
  }
  return changes;
}
