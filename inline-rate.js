window.errorsTable = function (rows) {
  if (!rows.length) return empty('Ошибок нет', 'Все сотрудники с закрытыми и проверенными сменами доступны в расчёте.');

  const issueDetails = shift => {
    if (!shift.exit) return { problem: 'Не отмечен уход', tone: 'bad', required: 'Охране указать время ухода', action: 'Открыть смену' };
    if (!rateOf(shift)) return { problem: 'Не указана ставка', tone: 'bad', required: 'Назначить ставку', action: 'Открыть смену' };
    if (shift.rateReview) return { problem: 'Ставка ожидает подтверждения', tone: 'warn', required: 'Бухгалтерии подтвердить ставку', action: 'Проверить ставку' };
    if (String(shift.status).includes('Расхождение')) return { problem: shift.status, tone: 'bad', required: 'Сверить начисление и выплату', action: 'Проверить смену' };
    return { problem: 'Ожидает проверки', tone: 'warn', required: 'Проверить время и начисление', action: 'Проверить смену' };
  };

  return `<div class="table-wrap attention-table-wrap"><table class="data-table compact inline-rate-table attention-table">
    <thead><tr>
      <th>Сотрудник</th>
      <th>Дата и время</th>
      <th>Площадка</th>
      <th>ООО</th>
      <th>Проблема</th>
      <th>Что требуется</th>
      <th>Начислено</th>
      <th>Ставка</th>
      <th></th>
    </tr></thead>
    <tbody>${rows.map(row => row.errorShifts.map(shift => {
      const canSetRate = !!shift.exit && (!rateOf(shift) || shift.rateReview);
      const issue = issueDetails(shift);
      const workTime = shift.workStart && shift.workEnd ? `${shift.workStart}–${shift.workEnd}` : `${shift.entry || '—'}–${shift.exit || '…'}`;
      return `<tr>
        <td><button class="person-link" data-person="${row.p.id}">${row.p.name}</button><div class="subline">${shift.position}</div></td>
        <td><b>${shift.date}</b><div class="subline">${workTime}${hours(shift) == null ? '' : ` · ${hours(shift).toLocaleString('ru-RU')} ч`}</div></td>
        <td>${shift.location}</td>
        <td>${shift.legalEntity}</td>
        <td>${status(issue.problem, issue.tone)}</td>
        <td><b class="attention-required">${issue.required}</b></td>
        <td><b>${money(accrued(shift))}</b></td>
        <td>${canSetRate ? `<div class="inline-rate-editor"><label><input type="number" min="1" step="1" value="${rateOf(shift) || ''}" data-inline-rate="${shift.id}" placeholder="Ставка"><span>₽/ч</span></label><button class="btn small primary" data-action="save-inline-rate" data-id="${shift.id}">Подтвердить</button></div>` : `<b>${money(rateOf(shift))}</b>`}</td>
        <td><button class="btn small" data-shift="${shift.id}">${issue.action}</button></td>
      </tr>`;
    }).join('')).join('')}</tbody>
  </table></div>`;
};

const bindActionBeforeInlineRate = window.bindAction;
window.bindAction = function (el) {
  if (el.dataset.action !== 'save-inline-rate') {
    bindActionBeforeInlineRate(el);
    return;
  }

  el.onclick = () => {
    const shift = state.shifts.find(item => item.id === Number(el.dataset.id));
    const input = document.querySelector(`[data-inline-rate="${el.dataset.id}"]`);
    const rate = Number(input?.value);
    if (!shift || !(rate > 0)) {
      toast('Введите ставку больше нуля');
      input?.focus();
      return;
    }
    const employee = confirmEmployeeRate(shift, rate);
    shift.status = shift.paid != null ? (shift.type === 'Вызывной' ? 'Закрыт подотчётом' : 'Проверено') : 'Готово';
    state.audit.unshift({
      at: new Date().toLocaleString('ru-RU'),
      actor: 'Бухгалтер',
      text: `Подтверждена постоянная ставка ${money(rate)} для ${employee.name} · должность ${shift.position}; применяется к следующим сменам автоматически`
    });
    save();
    render();
    toast(`Ставка ${money(rate)} сохранена для следующих смен`);
  };
};

render();
