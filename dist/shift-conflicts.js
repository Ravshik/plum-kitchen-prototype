/* Prevent one employee from having simultaneous open shifts at different locations. */
(function () {
  function openShiftFor(personId) {
    return state.shifts.find(shift => shift.personId === Number(personId) && !shift.exit) || null;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function conflictText(shift) {
    return `${shift.location || 'площадка не указана'} · ${shift.date || 'дата не указана'}, приход ${shift.entry || 'время не указано'}`;
  }

  function showConflictDialog(personId, shift = openShiftFor(personId)) {
    const employee = person(Number(personId));
    if (!employee || !shift) return;

    const modal = document.querySelector('#modal');
    modal.innerHTML = `<div class="modal-head">
      <div><h2>Смена уже открыта</h2><span class="demo-badge">${modeLabel()}</span></div>
      <button class="icon-btn" data-close-conflict aria-label="Закрыть">×</button>
    </div>
    <div class="shift-conflict-dialog">
      <span class="shift-conflict-icon">!</span>
      <div>
        <b>${escapeHtml(employee.name)} уже находится на смене</b>
        <p>Открытая площадка: <strong>${escapeHtml(shift.location || 'Не указана')}</strong></p>
        <small>${escapeHtml(shift.date || 'Дата не указана')} · приход ${escapeHtml(shift.entry || 'время не указано')}</small>
      </div>
    </div>
    <div class="shift-conflict-note">Сначала отметьте уход на площадке «${escapeHtml(shift.location || 'Не указана')}». Новая смена на «${escapeHtml(currentSecurityLocation)}» не создана.</div>
    <div class="modal-actions"><button class="btn primary" data-close-conflict>Понятно</button></div>`;
    modal.classList.remove('hidden');
    document.querySelector('#modal-backdrop').classList.remove('hidden');
    modal.querySelectorAll('[data-close-conflict]').forEach(button => { button.onclick = closeModal; });
  }

  window.showOpenShiftConflict = showConflictDialog;

  const quickOpenBeforeConflictCheck = quickOpenSecurityShift;
  quickOpenSecurityShift = function (personId) {
    const conflict = openShiftFor(personId);
    if (conflict) {
      showConflictDialog(personId, conflict);
      return false;
    }
    return quickOpenBeforeConflictCheck(personId);
  };

  const startShiftBeforeConflictCheck = startShiftModal;
  startShiftModal = function (selectedId = null) {
    const firstAvailable = state.people.find(employee => employee.securityVisible !== false && !openShiftFor(employee.id));
    startShiftBeforeConflictCheck(selectedId || firstAvailable?.id || null);

    const modal = document.querySelector('#modal');
    const select = modal.querySelector('[data-field="personId"]');
    const confirm = modal.querySelector('[data-confirm-modal]');
    if (!select || !confirm) return;

    const personField = select.closest('.field');
    const warning = document.createElement('div');
    warning.className = 'shift-conflict-inline full hidden';
    warning.setAttribute('role', 'alert');
    personField?.insertAdjacentElement('afterend', warning);

    const originalConfirm = confirm.onclick;
    const updateConflict = () => {
      const personId = Number(select.value);
      const conflict = openShiftFor(personId);
      confirm.disabled = Boolean(conflict);
      warning.classList.toggle('hidden', !conflict);
      warning.innerHTML = conflict
        ? `<span>!</span><div><b>Сотрудник уже открыт на другой площадке</b><small>${escapeHtml(conflictText(conflict))}</small><em>Сначала закройте текущую смену.</em></div>`
        : '';
      return conflict;
    };

    select.addEventListener('change', updateConflict);
    confirm.onclick = () => {
      const conflict = updateConflict();
      if (conflict) {
        showConflictDialog(Number(select.value), conflict);
        return;
      }
      originalConfirm();
    };
    updateConflict();
  };

  const securityPageBeforeConflictRows = securityPage;
  securityPage = function () {
    let html = securityPageBeforeConflictRows();
    const conflicts = [];
    const seen = new Set();
    state.shifts.forEach(shift => {
      if (shift.exit || shift.location === currentSecurityLocation || seen.has(shift.personId)) return;
      const employee = person(shift.personId);
      if (!employee || employee.securityVisible === false) return;
      seen.add(shift.personId);
      conflicts.push({ employee, shift });
    });
    if (!conflicts.length) return html;

    const rows = conflicts.map(({ employee, shift }) => `<div class="security-person-row is-open-elsewhere" data-person-card data-person-name="${escapeHtml(employee.name.toLowerCase())}">
      <span class="security-person-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M5 21c0-4 2.7-7 7-7s7 3 7 7"/></svg></span>
      <button class="security-person-name" data-action="security-person-card" data-id="${employee.id}"><b>${escapeHtml(employee.name)}</b><small>${escapeHtml(employee.position || 'Должность не указана')} · на смене</small></button>
      <button class="security-quick-open conflict" data-action="quick-open-security-shift" data-id="${employee.id}" title="${escapeHtml(conflictText(shift))}">Открыт: ${escapeHtml(shift.location || 'другая точка')}</button>
    </div>`).join('');

    html = html.replace('<div class="security-mini-empty">Нет сотрудников без открытой смены</div>', '');
    return html.replace('</div><div class="security-quick-actions">', `${rows}</div><div class="security-quick-actions">`);
  };

  render();
})();
