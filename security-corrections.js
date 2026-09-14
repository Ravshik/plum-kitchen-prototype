(function () {
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function correctionCard(shift) {
    const employee = person(shift.personId);
    return `<article class="security-correction-row">
      <span class="security-correction-person">
        <b>${escapeHtml(employee?.name || 'Сотрудник')}</b>
        <small>${escapeHtml(shift.date)} · ${escapeHtml(shift.entry)}–${escapeHtml(shift.exit || 'не отмечен')}</small>
        <span>${escapeHtml(shift.correctionReason || 'Проверьте отметки прихода и ухода')}</span>
      </span>
      <button class="btn small" data-action="correct-shift" data-id="${shift.id}">Исправить</button>
    </article>`;
  }

  const securityPageBeforeCorrections = window.securityPage;
  window.securityPage = function () {
    const requests = state.shifts.filter(shift =>
      shift.location === currentSecurityLocation && shift.correctionRequested
    );
    const issueCount = state.shifts.filter(shift =>
      shift.location === currentSecurityLocation &&
      (shift.status === 'Нет ухода' || shift.correctionRequested)
    ).length;
    let html = securityPageBeforeCorrections();

    html = html.replace(
      /(<div class="security-metric correction">[\s\S]*?<small>Нужна корректировка<\/small><b>)\d+(<\/b>)/,
      `$1${issueCount}$2`
    );

    if (!requests.length) return html;

    const block = `<section class="panel security-correction-panel">
      <div class="security-correction-head">
        <span class="security-correction-icon">
          <svg viewBox="0 0 24 24"><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4M12 17h.01"/></svg>
        </span>
        <span>
          <small>Запрос от бухгалтерии</small>
          <h2>${requests.length === 1 ? 'Исправьте смену' : 'Исправьте смены'}</h2>
        </span>
        <b class="security-correction-count">${requests.length}</b>
      </div>
      <p class="security-correction-copy">После сохранения исправления запрос исчезнет, а бухгалтерия увидит обновлённые данные.</p>
      <div class="security-correction-list">${requests.map(correctionCard).join('')}</div>
    </section>`;

    return html.replace(
      '<aside class="security-side-stack">',
      `<aside class="security-side-stack">${block}`
    );
  };

  render();
})();
