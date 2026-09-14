(function () {
  const oldCloseDrawer = closeDrawer;

  function icon(name) {
    const paths = {
      wallet: '<path d="M4 7h16v12H4zM4 7l11-3v3M15 11h5v4h-5z"/>',
      calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
      coins: '<ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7M4 11v4c0 1.4 2.2 2.5 5 2.5 1.1 0 2.2-.2 3-.5M15 11c2.8 0 5 1.1 5 2.5S17.8 16 15 16s-5-1.1-5-2.5S12.2 11 15 11Zm-5 2.5v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4"/>',
      document: '<path d="M7 3h7l4 4v14H7zM14 3v5h5M10 12h5M10 16h5"/>',
      alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M3 9h18M12 9v11M12 9H8.5A2.5 2.5 0 1 1 11 6.5Zm0 0h3.5A2.5 2.5 0 1 0 13 6.5Z"/>',
      car: '<path d="M5 16h14l-1.5-6h-11zM7 10l2-4h6l2 4M6 16v3M18 16v3"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>',
      minus: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
      work: '<path d="M4 8h16v11H4zM9 8V5h6v3M4 12h16M10 12v2h4v-2"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.document}</svg>`;
  }

  function signedMoney(value) {
    const number = Number(value || 0);
    return `${number > 0 ? '+' : number < 0 ? '−' : ''}${money(Math.abs(number))}`;
  }

  function shiftWord(count) {
    if (count % 10 === 1 && count % 100 !== 11) return 'смена';
    if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return 'смены';
    return 'смен';
  }

  function amountRows(row) {
    const period = currentPeriod;
    const taxi = Number(row.taxi || 0);
    const adjustmentRows = row.monthlyAdjustments.map(item => ({
      icon: item.type === 'Анимация' || item.type === 'Премия' ? 'gift' : 'document',
      title: item.type,
      period: `${item.month}${item.location ? ` · ${item.location}` : ''}`,
      status: isClosingPeriod() ? 'Начислено' : 'Запланировано',
      tone: isClosingPeriod() ? 'good' : 'planned',
      amount: Number(item.amount || 0)
    }));
    const penaltyRows = state.adjustments.filter(item => item.personId === row.p.id && item.type === 'Штраф' && (!item.date || inCurrentPeriod(item.date))).map(item => ({
      icon: 'minus',
      title: 'Штраф',
      period: `${item.date || period}${item.location ? ` · ${item.location}` : ''}`,
      status: 'Удержано',
      tone: 'negative',
      amount: -Number(item.amount || 0)
    }));
    return [
      { icon: 'work', title: 'Труд по сменам', period, status: row.base ? 'Начислено' : 'Нет начислений', tone: row.base ? 'good' : 'muted', amount: Number(row.base || 0) },
      ...adjustmentRows,
      { icon: 'car', title: 'Такси', period: taxi ? period : '—', status: taxi ? 'Учтено' : 'Нет начислений', tone: taxi ? 'good' : 'muted', amount: taxi },
      ...(penaltyRows.length ? penaltyRows : [{ icon: 'minus', title: 'Штрафы', period: '—', status: 'Нет удержаний', tone: 'muted', amount: 0 }])
    ];
  }

  function conditionsMarkup(personRecord) {
    const payType = personRecord.payType || 'Почасовая';
    let rate = personRecord.rate ? `${money(personRecord.rate)}/ч` : 'Не указана';
    let extra = '';
    if (personRecord.payType === 'Индивидуальная окладная формула') {
      rate = money(personRecord.salaryBase || 123000);
      extra = `<div><span>Норма часов</span><b>${Number(personRecord.salaryNormHours || 165).toLocaleString('ru-RU')} ч</b></div><div><span>Переработка</span><b>${money(personRecord.salaryOvertimeRate || 750)}/ч</b></div>`;
    } else if (personRecord.payType === 'Оклад') {
      rate = `${money(personRecord.monthlySalary || personRecord.rate || 0)} в месяц`;
    }
    return `<div class="finance-conditions-grid"><div><span>Оформление</span><b>${employment(personRecord)}</b></div><div><span>Тип сотрудника</span><b>${personRecord.type}</b></div><div><span>Тип оплаты</span><b>${payType}</b></div><div><span>Ставка</span><b>${rate}</b></div>${extra}</div>`;
  }

  function historyMarkup(history) {
    if (!history.length) return '<div class="finance-empty">Изменений пока нет</div>';
    return `<div class="finance-history-list">${history.map(item => `<article><span class="history-dot"></span><div><time>${item.at}</time><b>${item.text}</b><small>${item.actor}</small></div></article>`).join('')}</div>`;
  }

  function openFinancialPersonCard(id) {
    const personRecord = person(id);
    const row = personWeek(personRecord);
    const drawer = document.querySelector('#drawer');
    const totalHours = row.shifts.reduce((sum, shift) => sum + (hours(shift) || 0), 0);
    const planned = isClosingPeriod() ? 0 : Number(row.plannedBonus || 0);
    const corrections = Number(row.taxi || 0) + Number(row.bonus || 0) - Number(row.penalty || 0);
    const balance = Number(row.balance || 0);
    const hasIssues = row.errorShifts.length > 0;
    const headerStatus = hasIssues ? 'Требует проверки' : balance > 0 ? 'К выплате' : 'Расчёт закрыт';
    const headerTone = hasIssues ? 'bad' : balance > 0 ? 'warn' : 'good';
    const balanceLabel = balance < 0 ? 'Переплата' : balance > 0 ? 'К выплате' : 'Остаток';
    const balanceValue = money(Math.abs(balance));
    const paymentDisabled = hasIssues || balance <= 0;
    const paymentHint = hasIssues ? 'Сначала исправьте ошибки в сменах' : balance < 0 ? 'Новая выплата недоступна: есть переплата' : 'Расчёт уже закрыт';
    const history = state.audit.filter(item => item.text.includes(personRecord.name));
    const latest = history[0];
    const rows = amountRows(row);

    drawer.classList.remove('security-person-drawer');
    drawer.classList.add('person-drawer', 'person-finance-drawer');
    drawer.innerHTML = `
      <header class="finance-card-head">
        <div>
          <div class="eyebrow">Карточка сотрудника</div>
          <h2>${personRecord.name}</h2>
          <div class="person-identity"><span>${personRecord.position}</span><span>${personRecord.type}</span><span>${employment(personRecord)}</span></div>
          <span class="finance-period">${icon('calendar')}<b>${currentPeriod}</b></span>
        </div>
        <div class="finance-head-actions">${status(headerStatus, headerTone)}<button class="icon-btn" data-close-drawer aria-label="Закрыть">×</button></div>
      </header>

      <section class="finance-summary" aria-label="Финансовое резюме">
        <article>${icon('wallet')}<span>Начислено</span><b>${money(row.total)}</b></article>
        <article>${icon('calendar')}<span>Запланировано</span><b>${money(planned)}</b></article>
        <article>${icon('coins')}<span>Выплачено</span><b>${money(row.paid)}</b></article>
        <article>${icon('document')}<span>Корректировки</span><b class="${corrections < 0 ? 'negative' : corrections > 0 ? 'positive' : ''}">${signedMoney(corrections)}</b></article>
        <article class="finance-balance ${balance < 0 ? 'overpaid' : balance > 0 ? 'due' : 'closed'}">${icon(balance < 0 ? 'alert' : 'wallet')}<span>${balanceLabel}</span><b>${balanceValue}</b></article>
        <article class="finance-hours">${icon('clock')}<span>Отработано</span><b>${row.shifts.length} ${shiftWord(row.shifts.length)} · ${totalHours.toLocaleString('ru-RU')} ч</b></article>
      </section>

      <nav class="finance-tabs" role="tablist" aria-label="Разделы карточки сотрудника">
        ${['accruals:Начисления', 'shifts:Смены', 'conditions:Условия', 'history:История'].map((item, index) => { const [key, label] = item.split(':'); return `<button role="tab" aria-selected="${index === 0}" class="${index === 0 ? 'active' : ''}" data-person-card-tab="${key}">${label}</button>`; }).join('')}
      </nav>

      <div class="finance-tab-panels">
        <section class="finance-tab-panel" data-person-card-panel="accruals">
          <div class="finance-section-head"><div><h3>Начисления</h3><p>Все суммы за выбранный расчётный период</p></div><div class="adjustment-actions"><button class="btn small" data-action="person-adjustment" data-type="Премия" data-id="${id}">+ Премия</button><button class="btn small" data-action="person-adjustment" data-type="Анимация" data-id="${id}">+ Анимация</button><button class="btn small danger" data-action="person-adjustment" data-type="Штраф" data-id="${id}">− Штраф</button></div></div>
          <div class="finance-accrual-table" role="table">
            <div class="finance-accrual-head" role="row"><span>Вид начисления</span><span>Период</span><span>Статус</span><span>Сумма</span></div>
            ${rows.map(item => `<div class="finance-accrual-row" role="row"><span class="finance-accrual-name"><i>${icon(item.icon)}</i><b>${item.title}</b></span><span>${item.period}</span><span><em class="finance-row-status ${item.tone}"><i></i>${item.status}</em></span><strong class="${item.amount < 0 ? 'negative' : item.amount > 0 ? 'positive' : ''}">${signedMoney(item.amount)}</strong></div>`).join('')}
          </div>
          <div class="finance-support-grid">
            <article class="finance-support-card"><header><h3>${icon('settings')}Условия оплаты</h3><button data-person-card-tab-jump="conditions">Изменить условия</button></header>${conditionsMarkup(personRecord)}</article>
            <article class="finance-support-card"><header><h3>${icon('clock')}Последние изменения</h3><button data-person-card-tab-jump="history">Вся история →</button></header>${latest ? `<div class="finance-latest"><span class="history-dot"></span><div><time>${latest.at}</time><b>${latest.text}</b><small>${latest.actor}</small></div></div>` : '<div class="finance-empty small">Изменений пока нет</div>'}</article>
          </div>
        </section>

        <section class="finance-tab-panel hidden" data-person-card-panel="shifts">
          <div class="finance-section-head"><div><h3>Смены</h3><p>${row.shifts.length} ${shiftWord(row.shifts.length)} за период · нажмите на строку для подробностей</p></div></div>
          <div class="finance-shift-list">${row.shifts.length ? row.shifts.slice().sort((a, b) => b.date.localeCompare(a.date, 'ru')).map(shift => `<button data-person-shift-open="${shift.id}"><span><b>${shift.date}</b><small>${shift.location} · ${shift.position}</small></span><span><b>${shift.workStart ? `${shift.workStart}–${shift.workEnd}` : `${shift.entry}–${shift.exit || '…'}`}</b><small>${hours(shift) == null ? 'Время не рассчитано' : `${hours(shift).toLocaleString('ru-RU')} ч`}</small></span><span><b>${money(accrued(shift))}</b>${status(shift.status, tone(shift))}</span><i>›</i></button>`).join('') : '<div class="finance-empty">Смен за выбранный период нет</div>'}</div>
        </section>

        <section class="finance-tab-panel hidden" data-person-card-panel="conditions">
          <div class="finance-section-head"><div><h3>Условия оплаты</h3><p>Действующие условия сотрудника</p></div><button class="btn" data-action="edit-rate" data-id="${id}">Изменить условия</button></div>
          ${conditionsMarkup(personRecord)}
          <div class="finance-note">Изменение условий применяется с указанной даты. Уже закрытые смены сохраняют прежние значения.</div>
        </section>

        <section class="finance-tab-panel hidden" data-person-card-panel="history">
          <div class="finance-section-head"><div><h3>История изменений</h3><p>Кто, когда и что изменил в карточке сотрудника</p></div></div>
          ${historyMarkup(history)}
        </section>
      </div>

      <footer class="finance-card-actions">
        <button class="btn" data-person-card-close>Закрыть</button>
        <button class="btn" data-action="edit-rate" data-id="${id}">Изменить условия</button>
        <button class="btn primary" data-action="person-payment" data-id="${id}" ${paymentDisabled ? `disabled title="${paymentHint}" aria-label="Зафиксировать выплату. ${paymentHint}"` : ''}>Зафиксировать выплату</button>
      </footer>`;

    showDrawer(drawer);
    drawer.scrollTop = 0;
    drawer.querySelectorAll('[data-person-card-tab], [data-person-card-tab-jump]').forEach(button => button.onclick = () => {
      const tab = button.dataset.personCardTab || button.dataset.personCardTabJump;
      drawer.querySelectorAll('[data-person-card-tab]').forEach(item => {
        const active = item.dataset.personCardTab === tab;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
      drawer.querySelectorAll('[data-person-card-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.personCardPanel !== tab));
      drawer.scrollTo({ top: Math.max(0, drawer.querySelector('.finance-tabs').offsetTop - 12), behavior: 'smooth' });
    });
    drawer.querySelectorAll('[data-person-card-close]').forEach(button => button.onclick = closeDrawer);
    drawer.querySelectorAll('[data-person-shift-open]').forEach(button => button.onclick = () => {
      drawer.classList.remove('person-finance-drawer');
      openDrawer(Number(button.dataset.personShiftOpen));
    });
  }

  closeDrawer = function () {
    document.querySelector('#drawer').classList.remove('person-finance-drawer');
    oldCloseDrawer();
  };
  openPersonDrawer = openFinancialPersonCard;
})();
