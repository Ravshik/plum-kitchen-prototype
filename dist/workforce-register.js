/* Persistent employee register and workforce analytics for accounting and chef roles. */
(function () {
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function isoDate(value) {
    const text = String(value || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ruToIso(text);
  }

  function monthKeyFromAdjustment(adjustment) {
    if (adjustment.date) return isoDate(adjustment.date).slice(0, 7);
    const match = String(adjustment.month || '').toLowerCase().match(/^([^\s]+)\s+(\d{4})$/);
    if (!match) return '';
    const index = Math.max(MONTHS.indexOf(match[1]), MONTHS_GENITIVE.indexOf(match[1]));
    return index < 0 ? '' : `${match[2]}-${String(index + 1).padStart(2, '0')}`;
  }

  function monthKeysBetween(from, to) {
    const keys = new Set();
    const cursor = new Date(`${from.slice(0, 7)}-01T12:00:00`);
    const end = new Date(`${to.slice(0, 7)}-01T12:00:00`);
    while (cursor <= end) {
      keys.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  }

  const personWeekBeforePersistentRegister = personWeek;
  personWeek = function (personRecord, locationFilter = 'Все площадки') {
    const row = personWeekBeforePersistentRegister(personRecord, locationFilter);
    if (personRecord.source !== 'accounting' || row.shifts.length) return row;

    const inLocation = locationFilter === 'Все площадки' || personRecord.location === locationFilter;
    const manualAmount = Number(personRecord.manualAmount || 0);
    const fixedAmount = ['Оклад', 'Фиксированная сумма за неделю'].includes(personRecord.payType)
      ? Number(personRecord.rate || 0)
      : 0;
    const base = manualAmount > 0 ? manualAmount : fixedAmount;
    const total = base + Number(row.taxi || 0) + Number(row.bonus || 0) - Number(row.penalty || 0);
    return {
      ...row,
      ok: inLocation,
      base,
      total,
      balance: total - Number(row.paid || 0),
      salaryBase: base,
      salaryIncluded: true,
      salaryPayable: true,
      salaryUnderNorm: false,
      salaryMissingHours: 0,
      registerOnly: true
    };
  };

  const rowStatusBeforePersistentRegister = rowStatus;
  rowStatus = function (row) {
    if (row.errorShifts?.length) return status('Требует исправления', 'bad');
    if (row.registerOnly) return row.balance > 0 ? status('Без табеля · к выплате', 'good') : status('Без табеля охраны', 'warn');
    if (!row.shifts.length) return status('Нет смен в периоде', 'warn');
    return rowStatusBeforePersistentRegister(row);
  };

  const statementTableBeforePersistentRegister = statementTable;
  statementTable = function (rows) {
    const template = document.createElement('template');
    template.innerHTML = statementTableBeforePersistentRegister(rows);
    template.content.querySelectorAll('[data-ledger-row]').forEach((element, index) => {
      const row = rows[index];
      if (!row) return;
      if (!row.shifts.length) element.classList.add('ledger-no-activity');
      if (!row.ok) element.classList.add('ledger-has-error');
    });
    return template.innerHTML;
  };

  timesheetPage = function () {
    const allRows = weekRows();
    const entityRows = currentEntity === 'Все ООО'
      ? allRows
      : allRows.filter(row => row.p.legalEntity === currentEntity || row.shifts.some(shift => shift.legalEntity === currentEntity));
    const rows = currentEmployment === 'Все оформления'
      ? entityRows
      : entityRows.filter(row => employment(row.p) === currentEmployment);
    const needsOnboarding = row => !!window.needsPersonOnboarding?.(row.p);
    const ready = rows.filter(row => row.ok && !needsOnboarding(row));
    const errors = rows.filter(row => needsOnboarding(row) || (row.shifts.length && !row.ok));
    const total = ready.reduce((sum, row) => sum + row.total, 0);
    const balance = ready.reduce((sum, row) => sum + Math.max(0, row.balance), 0);
    const byType = type => ready.filter(row => employment(row.p) === type).reduce((sum, row) => sum + row.total, 0);
    const scope = currentLocation === 'Все площадки'
      ? (currentEntity === 'Все ООО' ? 'Все юрлица' : currentEntity)
      : `${currentLocation} · ${currentEntity}`;
    const overview = accountingOverview(ready, total, balance, errors, byType, scope)
      .replace(`<span>В расчёте</span><b>${ready.length}</b><small>сотрудников</small>`, `<span>Всего в базе</span><b>${rows.length}</b><small>${ready.length} в расчёте</small>`);

    return `<div class="page-title-row"><div>${kitchenBack()}<div class="eyebrow">Кухня · ${currentPeriod}</div><h1 class="page-title">Расчётная ведомость</h1></div><div class="actions"><button class="btn analytics-button" data-action="workforce-analytics" data-analytics-mode="accounting">Статистика персонала</button><button class="btn" data-action="accounting-person">+ Добавить сотрудника</button><button class="btn" data-action="export">⇩ Excel по месяцу</button><button class="btn primary" data-action="open-registers">Сформировать выплату</button></div></div>${weekFilters()}${overview}<div class="panel ledger-panel"><div class="ledger-toolbar"><div class="view-tabs"><button class="view-tab ${currentView === 'statement' ? 'active' : ''}" data-view="statement">Все сотрудники <span class="soft-count">${rows.length}</span></button><button class="view-tab ${currentView === 'attention' ? 'active' : ''}" data-view="attention">Требуют исправления <span class="count">${errors.length}</span></button><button class="view-tab ${currentView === 'registers' ? 'active' : ''}" data-view="registers">Реестры выплат <span class="soft-count">${state.registries.length}</span></button></div><button class="btn primary create-period-btn" data-action="create-payment-period">+ Период выплаты</button></div>${currentView === 'attention' ? errorsTable(errors) : currentView === 'registers' ? registryTable() : statementTable(rows)}<div class="panel-foot"><span>${currentView === 'statement' ? 'В реестре показаны все сотрудники базы; суммы относятся к выбранному периоду' : `Период: ${currentPeriod}`} · ${modeLabel(true)}</span></div></div>`;
  };

  const openAccountingPersonBeforeRegister = openAccountingPersonModal;
  openAccountingPersonModal = function () {
    openAccountingPersonBeforeRegister();
    const modal = document.querySelector('#modal');
    modal.classList.add('accounting-person-modal');
    const confirm = modal.querySelector('[data-confirm-modal]');
    if (confirm) confirm.textContent = 'Добавить в базу';
    const hint = modal.querySelector('.rate-hint');
    if (hint) hint.textContent = 'Сотрудник появится в общем реестре во всех периодах. Для сотрудника без табеля укажите оклад/фиксированную ставку или начисление вручную.';
    const payType = modal.querySelector('[data-field="payType"]');
    const hoursField = modal.querySelector('[data-field="hours"]')?.closest('.field');
    const rateField = modal.querySelector('[data-field="rate"]')?.closest('.field');
    const update = () => {
      if (!payType) return;
      const hourly = payType.value === 'Почасовая';
      hoursField?.classList.toggle('hidden', !hourly);
      if (rateField?.firstChild) rateField.firstChild.nodeValue = hourly ? 'Ставка за час' : payType.value === 'Оклад' ? 'Оклад за период' : 'Фиксированная сумма';
    };
    payType?.addEventListener('change', update);
    update();
  };

  const chefPageBeforeAnalytics = chefPage;
  chefPage = function () {
    const template = document.createElement('template');
    template.innerHTML = chefPageBeforeAnalytics();
    const titleRow = template.content.querySelector('.page-title-row');
    if (titleRow) {
      const actions = document.createElement('div');
      actions.className = 'actions chef-analytics-actions';
      actions.innerHTML = `<span>Объект: <b>${esc(currentSecurityLocation)}</b></span><button class="btn analytics-button" data-action="workforce-analytics" data-analytics-mode="chef">Статистика объекта</button>`;
      titleRow.append(actions);
    }
    return template.innerHTML;
  };

  function analyticsData(filters, mode) {
    const from = filters.from;
    const to = filters.to;
    const monthKeys = monthKeysBetween(from, to);
    const location = mode === 'chef' ? currentSecurityLocation : filters.location;
    const query = filters.query.trim().toLocaleLowerCase('ru-RU');
    const people = state.people.filter(employee => {
      if (filters.employment !== 'Все оформления' && employment(employee) !== filters.employment) return false;
      if (query && !employee.name.toLocaleLowerCase('ru-RU').includes(query)) return false;
      if (mode === 'accounting' && filters.entity !== 'Все ООО' && employee.legalEntity !== filters.entity && !state.shifts.some(shift => shift.personId === employee.id && shift.legalEntity === filters.entity)) return false;
      if (location !== 'Все площадки' && employee.location !== location && !state.shifts.some(shift => shift.personId === employee.id && shift.location === location)) return false;
      return true;
    });
    const personIds = new Set(people.map(employee => employee.id));
    const shifts = state.shifts.filter(shift => {
      const date = isoDate(shift.date);
      if (!personIds.has(shift.personId) || date < from || date > to) return false;
      if (location !== 'Все площадки' && shift.location !== location) return false;
      if (mode === 'accounting' && filters.entity !== 'Все ООО' && shift.legalEntity !== filters.entity) return false;
      return true;
    });
    const workedIds = new Set(shifts.map(shift => shift.personId));
    const adjustments = state.adjustments.filter(item => {
      if (!personIds.has(item.personId) || !monthKeys.has(monthKeyFromAdjustment(item))) return false;
      if (item.date) {
        const date = isoDate(item.date);
        if (date < from || date > to) return false;
      }
      if (location !== 'Все площадки' && item.location !== location) return false;
      return true;
    });

    const employeeRows = people.map(employee => {
      const ownShifts = shifts.filter(shift => shift.personId === employee.id);
      const workByShifts = ownShifts.reduce((sum, shift) => sum + Number(accrued(shift) || 0), 0);
      const manualWork = employee.source === 'accounting' && !ownShifts.length
        ? Number(employee.manualAmount || 0) || (['Оклад', 'Фиксированная сумма за неделю'].includes(employee.payType) ? Number(employee.rate || 0) : 0)
        : 0;
      const ownAdjustments = adjustments.filter(item => item.personId === employee.id);
      const bonus = ownAdjustments.filter(item => ['Премия', 'Анимация'].includes(item.type)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const penalty = ownAdjustments.filter(item => item.type === 'Штраф').reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const taxi = ownShifts.reduce((sum, shift) => sum + Number(shift.taxi || 0), 0);
      const work = workByShifts + manualWork;
      return {
        employee,
        shifts: ownShifts.length,
        days: new Set(ownShifts.map(shift => isoDate(shift.date))).size,
        hours: ownShifts.reduce((sum, shift) => sum + Number(hours(shift) || 0), 0),
        work,
        taxi,
        bonus,
        penalty,
        total: work + taxi + bonus - penalty,
        locations: [...new Set(ownShifts.map(shift => shift.location).filter(Boolean))]
      };
    });

    const dailyMap = new Map();
    shifts.forEach(shift => {
      const date = isoDate(shift.date);
      if (!dailyMap.has(date)) dailyMap.set(date, { date, people: new Set(), shifts: 0, hours: 0, work: 0, taxi: 0, penalty: 0 });
      const day = dailyMap.get(date);
      day.people.add(shift.personId);
      day.shifts += 1;
      day.hours += Number(hours(shift) || 0);
      day.work += Number(accrued(shift) || 0);
      day.taxi += Number(shift.taxi || 0);
    });
    adjustments.filter(item => item.type === 'Штраф' && item.date).forEach(item => {
      const date = isoDate(item.date);
      if (!dailyMap.has(date)) dailyMap.set(date, { date, people: new Set([item.personId]), shifts: 0, hours: 0, work: 0, taxi: 0, penalty: 0 });
      dailyMap.get(date).penalty += Number(item.amount || 0);
    });

    return {
      people,
      shifts,
      workedIds,
      employeeRows,
      dailyRows: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      totals: employeeRows.reduce((result, row) => {
        result.hours += row.hours;
        result.work += row.work;
        result.taxi += row.taxi;
        result.bonus += row.bonus;
        result.penalty += row.penalty;
        result.total += row.total;
        return result;
      }, { hours: 0, work: 0, taxi: 0, bonus: 0, penalty: 0, total: 0 })
    };
  }

  function openAnalytics(mode = 'accounting', incoming = {}) {
    const filters = {
      from: incoming.from || currentPeriodFrom,
      to: incoming.to || currentPeriodTo,
      location: mode === 'chef' ? currentSecurityLocation : (incoming.location || 'Все площадки'),
      entity: incoming.entity || 'Все ООО',
      employment: incoming.employment || 'Все оформления',
      query: incoming.query || ''
    };
    const data = analyticsData(filters, mode);
    const modal = document.querySelector('#modal');
    const locations = ['Все площадки', ...Object.keys(LOCATIONS)];
    const entities = ['Все ООО', ...new Set(Object.values(LOCATIONS).flatMap(item => item.entities || []))];
    const optionList = (items, selected) => items.map(item => `<option ${item === selected ? 'selected' : ''}>${esc(item)}</option>`).join('');
    const dailyRows = data.dailyRows.map(day => `<tr><td><b>${isoToRu(day.date)}</b></td><td>${day.people.size}</td><td>${day.shifts}</td><td>${day.hours.toLocaleString('ru-RU')} ч</td><td>${money(day.work)}</td><td>${money(day.taxi)}</td><td>${day.penalty ? `−${money(day.penalty)}` : '—'}</td><td><b>${money(day.work + day.taxi - day.penalty)}</b></td></tr>`).join('');
    const employeeRows = data.employeeRows.map(row => `<tr class="${row.shifts ? '' : 'analytics-no-shifts'}"><td><b>${esc(row.employee.name)}</b><small>${esc(row.employee.position || '—')} · ${esc(employment(row.employee))}${row.employee.source === 'accounting' ? ' · без табеля' : ''}</small></td><td>${esc(row.locations.join(', ') || row.employee.location || '—')}</td><td>${row.days}</td><td>${row.shifts}</td><td>${row.hours.toLocaleString('ru-RU')} ч</td><td>${money(row.work)}</td><td>${row.taxi ? `+${money(row.taxi)}` : '—'}</td><td>${row.bonus ? `+${money(row.bonus)}` : '—'}</td><td>${row.penalty ? `−${money(row.penalty)}` : '—'}</td><td><b>${money(row.total)}</b></td></tr>`).join('');

    modal.className = 'modal workforce-analytics-modal';
    modal.innerHTML = `<div class="modal-head"><div><h2>${mode === 'chef' ? 'Статистика объекта' : 'Статистика персонала'}</h2><div class="muted">${mode === 'chef' ? `Только объект «${esc(currentSecurityLocation)}»` : 'Все сотрудники и площадки с фильтрами'}</div></div><button class="icon-btn" data-close-analytics>×</button></div>
      <div class="analytics-filters">
        <label>Начало периода<input data-analytics-filter="from" type="date" value="${filters.from}"></label>
        <label>Конец периода<input data-analytics-filter="to" type="date" value="${filters.to}"></label>
        ${mode === 'accounting' ? `<label>Площадка<select data-analytics-filter="location">${optionList(locations, filters.location)}</select></label><label>Юрлицо<select data-analytics-filter="entity">${optionList(entities, filters.entity)}</select></label>` : `<label>Площадка<input value="${esc(currentSecurityLocation)}" disabled></label>`}
        <label>Оформление<select data-analytics-filter="employment">${optionList(['Все оформления', 'ТК', 'СЗ', 'Наличные'], filters.employment)}</select></label>
        <label class="analytics-search">Сотрудник<input data-analytics-filter="query" value="${esc(filters.query)}" placeholder="ФИО"></label>
        <button class="btn primary" data-apply-analytics>Применить</button>
      </div>
      <div class="analytics-metrics">
        <div><span>В базе</span><b>${data.people.length}</b><small>по фильтрам</small></div>
        <div><span>Работали</span><b>${data.workedIds.size}</b><small>уникальных сотрудников</small></div>
        <div><span>Смены</span><b>${data.shifts.length}</b><small>за период</small></div>
        <div><span>Часы</span><b>${data.totals.hours.toLocaleString('ru-RU')}</b><small>отработано</small></div>
        <div><span>Начислено</span><b>${money(data.totals.work)}</b><small>труд</small></div>
        <div><span>Итого</span><b>${money(data.totals.total)}</b><small>с корректировками</small></div>
      </div>
      <section class="analytics-section"><div class="analytics-section-head"><div><h3>По дням</h3><p>Количество людей, смены, часы и суммы за каждый день.</p></div></div><div class="table-wrap"><table class="data-table analytics-table"><thead><tr><th>Дата</th><th>Людей</th><th>Смен</th><th>Часы</th><th>Труд</th><th>Такси</th><th>Штрафы</th><th>Итого дня</th></tr></thead><tbody>${dailyRows || '<tr><td colspan="8" class="analytics-empty">За период смен нет</td></tr>'}</tbody></table></div></section>
      <section class="analytics-section"><div class="analytics-section-head"><div><h3>По сотрудникам</h3><p>Включая сотрудников бухгалтерии без табеля охраны.</p></div><div class="analytics-corrections"><span>Такси ${money(data.totals.taxi)}</span><span>Премии и анимации ${money(data.totals.bonus)}</span><span>Штрафы ${money(data.totals.penalty)}</span></div></div><div class="table-wrap"><table class="data-table analytics-table employee"><thead><tr><th>Сотрудник</th><th>Площадки</th><th>Дней</th><th>Смен</th><th>Часы</th><th>Труд</th><th>Такси</th><th>Премии</th><th>Штрафы</th><th>Итого</th></tr></thead><tbody>${employeeRows || '<tr><td colspan="10" class="analytics-empty">Сотрудники не найдены</td></tr>'}</tbody></table></div></section>
      <div class="analytics-footnote">Премии и анимации без конкретной даты включены в итог сотрудника за соответствующий месяц и не распределяются по дням.</div>
      <div class="modal-actions"><button class="btn primary" data-close-analytics>Закрыть</button></div>`;
    document.querySelector('#modal-backdrop').classList.remove('hidden');
    modal.querySelectorAll('[data-close-analytics]').forEach(button => { button.onclick = closeModal; });
    modal.querySelector('[data-apply-analytics]').onclick = () => {
      const values = {};
      modal.querySelectorAll('[data-analytics-filter]').forEach(input => { values[input.dataset.analyticsFilter] = input.value; });
      if (!values.from || !values.to || values.from > values.to) {
        toast('Проверьте даты периода');
        return;
      }
      openAnalytics(mode, values);
    };
  }

  const actionHandlerBeforeAnalytics = actionHandler;
  actionHandler = function (action, element) {
    if (action === 'workforce-analytics') {
      openAnalytics(element.dataset.analyticsMode || 'accounting');
      return;
    }
    return actionHandlerBeforeAnalytics(action, element);
  };

  window.openWorkforceAnalytics = openAnalytics;
  render();
})();
