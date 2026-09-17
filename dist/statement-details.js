/* Final-period accounting and visible work dates in the statement. */
(function () {
  isClosingPeriod = function () {
    const parts = String(currentPeriodTo || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return false;
    const [year, month, day] = parts;
    const lastDay = new Date(year, month, 0, 12).getDate();
    return day >= lastDay - 6;
  };

  const basePersonWeek = personWeek;
  personWeek = function (...args) {
    const row = basePersonWeek(...args);
    row.bonus = Number(row.plannedBonus || 0);
    row.total = Number(row.base || 0) + Number(row.taxi || 0) + row.bonus - Number(row.penalty || 0);
    row.balance = row.total - Number(row.paid || 0);
    return row;
  };

  const baseWeekFilters = weekFilters;
  weekFilters = function () {
    return baseWeekFilters()
      .replace('Премии и анимации видны в ведомости как запланированные и будут начислены в последнюю неделю месяца.', 'Премии и анимации сразу включаются в итог выбранного периода.')
      .replace('Премии и анимации этого месяца включены в начисление выбранного периода.', 'Премии и анимации сразу включаются в итог выбранного периода.');
  };

  function workDatesCell(shifts) {
    const ordered = (shifts || []).slice().sort((a, b) => ruToIso(a.date).localeCompare(ruToIso(b.date)) || a.id - b.id);
    if (!ordered.length) return '<span class="dash">—</span>';

    return `<div class="work-shift-list">${ordered.map(shift => {
      const worked = hours(shift);
      const time = window.shiftTimeRangeText
        ? window.shiftTimeRangeText(shift)
        : shift.workStart && shift.workEnd ? `${shift.workStart}–${shift.workEnd}` : `${shift.entry}–${shift.exit || '…'}`;
      return `<button type="button" class="work-shift-item" data-shift="${shift.id}" title="Открыть смену"><b>${shift.date}</b><small>${time}${worked == null ? '' : ` · ${worked.toLocaleString('ru-RU')} ч`}</small></button>`;
    }).join('')}</div>`;
  }

  statementTable = function (rows) {
    if (!rows.length) {
      return empty('Готовых расчётов пока нет', 'Сотрудники появятся после закрытия смен, назначения ставок и исправления ошибок.');
    }

    const periods = (state.paymentPeriods || []).filter(period => paymentPeriodInCurrentMonth(period) && (!period.locked || period.visible));
    const periodHeads = periods.map(period => `<th class="payment-period-head ${period.locked ? 'locked' : ''}">
      <span>${period.type}</span>
      <small>${period.from === period.to ? period.from : `${period.from.slice(0, 5)}–${period.to}`}</small>
      ${period.locked
        ? '<i title="Период закрыт">✓ только просмотр</i>'
        : `<button data-action="close-payment-period" data-id="${period.id}" title="Закрыть период">Закрыть</button>`}
    </th>`).join('');

    return `<div class="ledger-help">
      <span><b>Начислено</b> = труд</span>
      <span><b>Итого</b> = начислено + такси + премии и анимации − штрафы</span>
      <span>Суммы вводятся во всех открытых периодах прямо в строках</span>
    </div>
    <div class="table-wrap statement-scroll">
      <table class="data-table ledger-table accounting-model">
        <thead><tr>
          <th><input type="checkbox" data-check-all aria-label="Выбрать всех"></th>
          <th>Должность</th>
          <th>ФИО</th>
          <th>Даты работы</th>
          <th>Ставка</th>
          <th>Начислено</th>
          <th>Такси</th>
          <th>Премии и анимации</th>
          <th>Штрафы</th>
          <th>Итого</th>
          ${periodHeads}
          <th>Итого выплачено</th>
          <th>К выплате</th>
          <th>Статус</th>
        </tr></thead>
        <tbody>${rows.map(row => `<tr class="${row.salaryUnderNorm ? 'salary-under-norm' : ''}" data-ledger-row data-person-name="${row.p.name.toLowerCase()}">
          <td><input type="checkbox" data-pay-person="${row.p.id}" ${row.balance <= 0 || row.salaryPayable === false ? 'disabled' : ''}></td>
          <td><b>${row.p.position}</b><div class="subline">${employment(row.p)} · ${row.p.type}</div></td>
          <td><button class="person-link" data-person="${row.p.id}">${row.p.name}</button>${row.p.source === 'accounting' ? '<div class="subline">Без табеля охраны</div>' : ''}</td>
          <td class="work-dates-cell">${workDatesCell(row.shifts)}</td>
          <td>${typeof salaryRateLabel === 'function' && salaryRateLabel(row.p) ? salaryRateLabel(row.p) : row.p.payType === 'Оклад' ? 'Оклад' : row.p.payType === 'Фиксированная сумма за неделю' ? 'За неделю' : row.p.type === 'Вызывной' && employment(row.p) === 'Наличные' ? 'По сменам' : money(row.p.rate)}</td>
          <td><b>${money(row.base)}</b>${row.salaryUnderNorm ? `<div class="salary-progress"><span style="--salary-progress:${Math.min(100, row.salaryMonthHours / row.salaryNormHours * 100)}%"></span></div><div class="subline">${row.salaryMonthHours.toLocaleString('ru-RU')} из ${row.salaryNormHours} ч · не хватает ${row.salaryMissingHours.toLocaleString('ru-RU')} ч</div>` : ''}</td>
          <td><label class="inline-money"><input type="number" min="0" step="100" value="${row.taxi || ''}" placeholder="0" data-taxi-person="${row.p.id}"><span>₽</span></label></td>
          <td><button class="amount-detail ${row.bonus ? 'positive' : ''}" data-person="${row.p.id}">${row.bonus ? `+${money(row.bonus)}` : '—'}</button></td>
          <td><button class="amount-detail ${row.penalty ? 'negative' : ''}" data-person="${row.p.id}">${row.penalty ? `−${money(row.penalty)}` : '—'}</button></td>
          <td><b>${money(row.total)}</b></td>
          ${periods.map(period => {
            const amount = paymentAmount(row.p.id, period.id);
            return `<td class="payment-cell ${period.locked ? 'locked' : ''}">${period.locked
              ? `<b title="Закрытый период">${money(amount)}</b>`
              : `<label class="inline-money payment-input"><input type="number" min="0" step="100" value="${amount || ''}" placeholder="0" data-payment-person="${row.p.id}" data-payment-period="${period.id}"><span>₽</span></label>`}</td>`;
          }).join('')}
          <td><b>${money(row.paid)}</b></td>
          <td><b class="${row.balance < 0 ? 'negative' : row.balance === 0 ? 'positive' : ''}">${money(row.balance)}</b></td>
          <td>${rowStatus(row)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  };

  render();
})();
