(() => {
  const root = document.createElement('aside');
  root.id = 'capcity-event-tools';
  root.innerHTML = `
    <div class="capcity-tools-bar">
      <button class="capcity-tools-button" data-action="sync">Sync events now</button>
      <button class="capcity-tools-button secondary" data-action="toggle">Review & reports</button>
    </div>
    <div class="capcity-tools-panel" aria-hidden="true">
      <div class="capcity-tools-head">
        <h2>Event sync</h2>
        <button class="capcity-tools-close" data-action="close" aria-label="Close event tools">&times;</button>
      </div>
      <section class="capcity-tools-section">
        <h3>Latest sync</h3>
        <p data-sync-status>Loading status...</p>
        <p class="capcity-tools-meta" data-last-run></p>
      </section>
      <section class="capcity-tools-section">
        <h3>Weekly review</h3>
        <p data-review-status>No active review.</p>
        <div class="capcity-tools-actions">
          <button class="capcity-tools-button secondary" data-action="begin-review">Begin weekly review</button>
          <button class="capcity-tools-button secondary" data-action="export-review">Export PDF & finish review</button>
        </div>
      </section>
      <section class="capcity-tools-section">
        <h3>Flags</h3>
        <p class="capcity-tools-meta" data-flag-count></p>
        <div class="capcity-tools-bucket" data-bucket="new"></div>
        <div class="capcity-tools-bucket" data-bucket="standing"></div>
        <div class="capcity-tools-bucket" data-bucket="completed"></div>
        <div class="capcity-tools-bucket" data-bucket="wontfix"></div>
      </section>
      <section class="capcity-tools-section">
        <p class="capcity-tools-message" data-message></p>
      </section>
    </div>
  `;

  const panel = root.querySelector('.capcity-tools-panel');
  const message = root.querySelector('[data-message]');
  const buttons = [...root.querySelectorAll('.capcity-tools-bar button, .capcity-tools-actions button')];
  let status = null;
  let flagIndex = new Map();

  const formatDate = (value) => value
    ? new Date(value).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' })
    : 'Not run yet';

  function ageLabel(acknowledgedAt, reviewsSpanned) {
    if (!acknowledgedAt) return 'Unresolved';
    const days = Math.max(0, Math.round((Date.now() - new Date(acknowledgedAt)) / 86400000));
    const reviews = reviewsSpanned ? `, through ${reviewsSpanned} review${reviewsSpanned === 1 ? '' : 's'}` : '';
    return `Unresolved ${days} day${days === 1 ? '' : 's'}${reviews}`;
  }

  async function token() {
    const user = window.netlifyIdentity?.currentUser();
    if (!user) throw new Error('Sign in to the admin before using event tools.');
    return user.jwt();
  }

  async function api(action, options = {}) {
    const authorization = await token();
    const response = await fetch(`/api/event-admin/${action}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${authorization}`,
        ...(options.headers || {}),
      },
    });
    if (response.headers.get('content-type')?.includes('application/pdf')) {
      if (!response.ok) throw new Error('The PDF report could not be generated.');
      return response;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed with ${response.status}.`);
    return payload;
  }

  function setBusy(busy) {
    buttons.forEach((button) => {
      if (!['toggle', 'close'].includes(button.dataset.action)) button.disabled = busy;
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function flagHeader(flag) {
    return `${escapeHtml(flag.title || flag.eventKey || 'Event')} - ${escapeHtml(flag.label || flag.field || 'review')}`;
  }

  function bucketHtml(title, items, render) {
    if (!items.length) return '';
    return `<h4 class="capcity-tools-bucket-title">${escapeHtml(title)} (${items.length})</h4>
      <ul class="capcity-tools-flags">${items.map(render).join('')}</ul>`;
  }

  function renderFlags() {
    flagIndex = new Map();
    const flags = status?.flags || { new: [], standing: [], completed: [] };
    const wontFix = status?.wontFix || [];
    const remember = (flag) => { if (flag.key) flagIndex.set(flag.key, flag); return flag; };

    root.querySelector('[data-flag-count]').textContent = `${flags.new.length} new · ${flags.standing.length} standing · ${flags.completed.length} resolved`
      + (wontFix.length ? ` · ${wontFix.length} won't fix` : '')
      + '. Publishing is never blocked.';

    root.querySelector('[data-bucket="new"]').innerHTML = bucketHtml('New', flags.new, (flag) => {
      remember(flag);
      return `<li class="capcity-tools-flag" data-severity="${escapeHtml(flag.severity || 'info')}">
        <strong>${flagHeader(flag)}</strong>
        <span>${escapeHtml(flag.message || 'Source conflict')}</span>
        <div class="capcity-tools-flag-actions">
          <button class="capcity-tools-ack" data-action="acknowledge-flag" data-key="${escapeHtml(flag.key)}">Acknowledge</button>
          <button class="capcity-tools-ack danger" data-action="wont-fix-flag" data-key="${escapeHtml(flag.key)}">Won't fix</button>
        </div>
      </li>`;
    });

    root.querySelector('[data-bucket="standing"]').innerHTML = bucketHtml('Standing', flags.standing, (flag) => {
      remember(flag);
      return `<li class="capcity-tools-flag" data-bucket="standing" data-severity="warning">
        <strong>${flagHeader(flag)}</strong>
        <span>${escapeHtml(flag.message || 'Source conflict')}</span>
        <span class="capcity-tools-age">⚠ ${escapeHtml(ageLabel(flag.acknowledgedAt, flag.reviewsSpanned))}</span>
        <div class="capcity-tools-flag-actions">
          <button class="capcity-tools-ack danger" data-action="wont-fix-flag" data-key="${escapeHtml(flag.key)}">Won't fix</button>
          <button class="capcity-tools-ack" data-action="reset-flag" data-key="${escapeHtml(flag.key)}">Undo</button>
        </div>
      </li>`;
    });

    root.querySelector('[data-bucket="completed"]').innerHTML = bucketHtml('Resolved', flags.completed, (flag) => `
      <li class="capcity-tools-flag" data-bucket="completed">
        <strong>${flagHeader(flag)}</strong>
        <span class="capcity-tools-resolved">✓ Self-corrected — clears after the next exported review</span>
      </li>`);

    root.querySelector('[data-bucket="wontfix"]').innerHTML = bucketHtml("Won't fix", wontFix, (flag) => {
      remember(flag);
      return `<li class="capcity-tools-flag" data-bucket="wontfix">
        <strong>${flagHeader(flag)}</strong>
        <span>${escapeHtml(flag.message || '')}</span>
        <div class="capcity-tools-flag-actions">
          <button class="capcity-tools-ack" data-action="reset-flag" data-key="${escapeHtml(flag.key)}">Restore</button>
        </div>
      </li>`;
    });
  }

  function render(nextStatus) {
    status = nextStatus;
    const run = status.sync;
    root.querySelector('[data-sync-status]').textContent = run
      ? `${run.status}${run.conclusion ? ` / ${run.conclusion}` : ''}`
      : 'No workflow run found.';
    root.querySelector('[data-last-run]').textContent = status.lastRun
      ? `Data sync completed ${formatDate(status.lastRun.at)}. Purplepass: ${status.lastRun.purplepassEvents}; Facebook: ${status.lastRun.facebookEvents}.`
      : `Workflow activity: ${formatDate(run?.updatedAt)}`;
    root.querySelector('[data-review-status]').textContent = status.review
      ? `Review opened ${formatDate(status.review.startedAt)} by ${status.review.reviewer}. Make corrections in the event editor, then export the PDF.`
      : 'No active review. Begin one before making this week’s corrections.';
    root.querySelector('[data-action="begin-review"]').disabled = Boolean(status.review);
    root.querySelector('[data-action="export-review"]').disabled = !status.review;
    renderFlags();
  }

  async function refresh() {
    try {
      setBusy(true);
      render(await api('status'));
      message.textContent = '';
    } catch (error) {
      message.textContent = error.message;
    } finally {
      setBusy(false);
      if (status) {
        root.querySelector('[data-action="begin-review"]').disabled = Boolean(status.review);
        root.querySelector('[data-action="export-review"]').disabled = !status.review;
      }
    }
  }

  async function flagAction(action, flag) {
    setBusy(true);
    message.textContent = '';
    try {
      await api(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag }),
      });
      await refresh();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action) {
    setBusy(true);
    message.textContent = '';
    try {
      if (action === 'sync') {
        const result = await api('sync', { method: 'POST' });
        message.textContent = result.message;
        panel.classList.add('open');
        panel.setAttribute('aria-hidden', 'false');
        setTimeout(refresh, 5000);
      }
      if (action === 'begin-review') {
        const result = await api('begin-review', { method: 'POST' });
        message.textContent = result.resumed ? 'Existing review resumed.' : 'Weekly review started. Make corrections, then export the PDF.';
        await refresh();
      }
      if (action === 'export-review') {
        const response = await api('export-review', { method: 'POST' });
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || 'capcity-event-review.pdf';
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        message.textContent = 'PDF downloaded and weekly review finished.';
        await refresh();
      }
    } catch (error) {
      message.textContent = error.message;
    } finally {
      setBusy(false);
    }
  }

  root.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    if (action === 'toggle') {
      panel.classList.toggle('open');
      panel.setAttribute('aria-hidden', String(!panel.classList.contains('open')));
      if (panel.classList.contains('open')) refresh();
      return;
    }
    if (action === 'close') {
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      return;
    }
    if (['acknowledge-flag', 'wont-fix-flag', 'reset-flag'].includes(action)) {
      const key = trigger.dataset.key;
      flagAction(action, flagIndex.get(key) || { key });
      return;
    }
    runAction(action);
  });

  function mount() {
    if (!document.body.contains(root)) document.body.appendChild(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
