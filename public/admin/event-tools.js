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
        <h3>Current flags</h3>
        <p class="capcity-tools-meta" data-flag-count></p>
        <ul class="capcity-tools-flags" data-flags></ul>
      </section>
      <section class="capcity-tools-section">
        <p class="capcity-tools-message" data-message></p>
      </section>
    </div>
  `;

  const panel = root.querySelector('.capcity-tools-panel');
  const message = root.querySelector('[data-message]');
  const buttons = [...root.querySelectorAll('button')];
  let status = null;

  const formatDate = (value) => value
    ? new Date(value).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' })
    : 'Not run yet';

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

  function renderFlags(flags = []) {
    root.querySelector('[data-flag-count]').textContent = flags.length
      ? `${flags.length} item${flags.length === 1 ? '' : 's'} to check. Publishing is not blocked.`
      : 'No current flags.';
    root.querySelector('[data-flags]').innerHTML = flags.slice(0, 30).map((flag) => `
      <li class="capcity-tools-flag" data-severity="${flag.severity || 'info'}">
        <strong>${escapeHtml(flag.title || flag.eventKey || 'Event')} - ${escapeHtml(flag.label || flag.field || 'review')}</strong>
        <span>${escapeHtml(flag.message || 'Source conflict')}</span>
        ${flag.id ? `<button class="capcity-tools-ack" data-action="acknowledge-flag" data-flag-id="${escapeHtml(flag.id)}">Mark reviewed</button>` : ''}
      </li>
    `).join('');
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
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
    renderFlags(status.flags);
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

  async function runAction(action, flagId = '') {
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
      if (action === 'acknowledge-flag') {
        if (!flagId) throw new Error('Could not identify that flag.');
        await api('acknowledge-flag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: flagId }),
        });
        message.textContent = 'Flag marked as reviewed.';
        await refresh();
      }
    } catch (error) {
      message.textContent = error.message;
    } finally {
      setBusy(false);
    }
  }

  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
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
    runAction(action, event.target.closest('[data-flag-id]')?.dataset.flagId || '');
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
