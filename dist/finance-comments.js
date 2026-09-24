(function financeCommentsModule() {
  let portal;
  let activeTarget;
  let scheduled = false;

  function adjustmentDetails(adjustments) {
    return adjustments.map(item => ({
      heading: [item.date || item.month || 'Период не указан', item.location].filter(Boolean).join(' · '),
      comment: item.reason || item.comment || 'Комментарий не указан',
      amount: Number(item.amount || 0),
      sign: item.type === 'Штраф' ? -1 : 1,
      type: item.type
    }));
  }

  function taxiDetails(personId) {
    const month = currentAccountingMonthKey();
    const shifts = state.shifts
      .filter(shift => shift.personId === personId && monthKeyFromRuDate(shift.date) === month && Number(shift.taxi || 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date, 'ru'));
    const items = shifts.map(shift => ({
      heading: [shift.date, shift.location].filter(Boolean).join(' · '),
      comment: shift.taxiComment || shift.taxiReason || 'Комментарий не указан',
      amount: Number(shift.taxi || 0),
      sign: 1,
      type: 'Такси'
    }));
    const shiftTotal = items.reduce((sum, item) => sum + item.amount, 0);
    const total = taxiAmount(personId);
    const remainder = Math.max(0, total - shiftTotal);
    if (remainder > .01) {
      const expense = state.taxiExpenses.find(item => item.personId === personId && item.accountingMonth === month);
      items.push({
        heading: expense?.date || expense?.period || periodMonth(),
        comment: expense?.comment || expense?.reason || 'Сумма введена за месяц без разбивки по дням',
        amount: remainder,
        sign: 1,
        type: 'Такси'
      });
    }
    return items;
  }

  function penaltyDetails(personId, locationFilter = 'Все площадки') {
    return adjustmentDetails(state.adjustments.filter(item => item.personId === personId && item.type === 'Штраф' && (!item.date || inCurrentPeriod(item.date)) && (locationFilter === 'Все площадки' || item.location === locationFilter)));
  }

  function setPayload(target, title, items) {
    if (!target) return;
    if (!items.length) {
      target.removeAttribute('data-finance-comment');
      target.classList.remove('finance-comment-target');
      return;
    }
    target.dataset.financeComment = encodeURIComponent(JSON.stringify({ title, items }));
    target.classList.add('finance-comment-target');
    if (!target.hasAttribute('tabindex') && !target.matches('input,button,a')) target.tabIndex = 0;
  }

  function enhanceLedger() {
    document.querySelectorAll('[data-ledger-row]').forEach(rowElement => {
      const personId = Number(rowElement.querySelector('[data-pay-person]')?.dataset.payPerson);
      if (!personId) return;
      const record = person(personId);
      if (!record) return;
      const row = personWeek(record, currentLocation);
      const details = rowElement.querySelectorAll('.amount-detail');
      setPayload(rowElement.querySelector('[data-taxi-person]')?.closest('.inline-money'), 'Такси по дням', taxiDetails(personId));
      setPayload(details[0], 'Премии и анимации', adjustmentDetails(row.monthlyAdjustments));
      setPayload(details[1], 'Штрафы', penaltyDetails(personId, currentLocation));
    });
  }

  function enhancePersonCard() {
    const drawer = document.querySelector('.person-finance-drawer');
    if (!drawer) return;
    const personId = Number(drawer.querySelector('[data-action="person-adjustment"]')?.dataset.id);
    if (!personId) return;
    const record = person(personId);
    if (!record) return;
    const row = personWeek(record);
    const amountRows = [...drawer.querySelectorAll('.finance-accrual-row')];
    let cursor = 1;
    row.monthlyAdjustments.forEach(adjustment => {
      setPayload(amountRows[cursor]?.querySelector('strong'), `${adjustment.type}: комментарий`, adjustmentDetails([adjustment]));
      cursor += 1;
    });
    setPayload(amountRows[cursor]?.querySelector('strong'), 'Такси по дням', taxiDetails(personId));
    cursor += 1;
    const penalties = state.adjustments.filter(item => item.personId === personId && item.type === 'Штраф' && (!item.date || inCurrentPeriod(item.date)));
    penalties.forEach(penalty => {
      setPayload(amountRows[cursor]?.querySelector('strong'), 'Штраф: комментарий', adjustmentDetails([penalty]));
      cursor += 1;
    });
  }

  function enhanceChefRows() {
    document.querySelectorAll('[data-chef-period-total]').forEach(element => {
      const personId = Number(element.dataset.chefPeriodTotal);
      const record = person(personId);
      if (!record) return;
      const row = personWeek(record);
      const items = [
        { heading: 'Труд по сменам', comment: `${row.shifts.length} смен · ${currentPeriod}`, amount: row.base, sign: 1, type: 'Труд' },
        ...taxiDetails(personId),
        ...adjustmentDetails(row.monthlyAdjustments),
        ...penaltyDetails(personId)
      ];
      setPayload(element, 'Итого сотруднику за период', items);
    });
  }

  function enhance() {
    scheduled = false;
    enhanceLedger();
    enhancePersonCard();
    enhanceChefRows();
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function ensurePortal() {
    if (portal) return portal;
    portal = document.createElement('aside');
    portal.className = 'finance-tooltip-portal';
    portal.setAttribute('role', 'tooltip');
    document.body.appendChild(portal);
    return portal;
  }

  function show(target) {
    if (!target?.dataset.financeComment) return;
    activeTarget = target;
    let payload;
    try { payload = JSON.parse(decodeURIComponent(target.dataset.financeComment)); } catch { return; }
    const tooltip = ensurePortal();
    tooltip.replaceChildren();
    const title = document.createElement('h4');
    title.textContent = payload.title;
    tooltip.appendChild(title);
    const list = document.createElement('div');
    list.className = 'finance-tooltip-list';
    let total = 0;
    payload.items.forEach(item => {
      total += Number(item.amount || 0) * Number(item.sign || 1);
      const line = document.createElement('div');
      line.className = 'finance-tooltip-item';
      const copy = document.createElement('div');
      const heading = document.createElement('b');
      heading.textContent = item.heading || item.type || '';
      const comment = document.createElement('span');
      comment.textContent = item.comment || 'Комментарий не указан';
      copy.append(heading, comment);
      const amount = document.createElement('strong');
      amount.textContent = `${Number(item.sign || 1) < 0 ? '−' : '+'}${money(Math.abs(Number(item.amount || 0)))}`;
      line.append(copy, amount);
      list.appendChild(line);
    });
    tooltip.appendChild(list);
    if (payload.items.length > 1) {
      const totalLine = document.createElement('div');
      totalLine.className = 'finance-tooltip-total';
      const label = document.createElement('b');
      label.textContent = 'Итого';
      const value = document.createElement('strong');
      value.textContent = `${total < 0 ? '−' : '+'}${money(Math.abs(total))}`;
      totalLine.append(label, value);
      tooltip.appendChild(totalLine);
    }
    tooltip.style.visibility = 'hidden';
    tooltip.classList.add('visible');
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - tooltipRect.width - 12, Math.max(12, targetRect.left + targetRect.width / 2 - tooltipRect.width / 2));
    const above = targetRect.top - tooltipRect.height - 10;
    const top = above >= 12 ? above : Math.min(window.innerHeight - tooltipRect.height - 12, targetRect.bottom + 10);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(12, top)}px`;
    tooltip.style.visibility = 'visible';
  }

  function hide(target) {
    if (target && target !== activeTarget) return;
    activeTarget = null;
    portal?.classList.remove('visible');
  }

  const originalChefPage = chefPage;
  chefPage = function chefPageWithAccountingTotals() {
    const template = document.createElement('template');
    template.innerHTML = originalChefPage();
    const panels = [...template.content.querySelectorAll('.panel')];
    const panel = panels.find(item => item.querySelector('.section-title')?.textContent.includes('Смены, закрытые охраной'));
    const table = panel?.querySelector('table');
    if (!table) return template.innerHTML;
    const head = table.querySelector('thead tr');
    const headerCells = head.querySelectorAll('th');
    if (headerCells[6]) headerCells[6].textContent = 'Труд за смену';
    const correctionHead = document.createElement('th');
    correctionHead.textContent = 'Корректировки';
    const totalHead = document.createElement('th');
    totalHead.textContent = 'Итого за период';
    headerCells[6]?.after(correctionHead, totalHead);
    const closed = state.shifts.filter(shift => shift.exit);
    table.querySelectorAll('tbody tr').forEach((tr, index) => {
      const shift = closed[index];
      if (!shift) return;
      const row = personWeek(person(shift.personId));
      const corrections = Number(row.taxi || 0) + Number(row.bonus || 0) - Number(row.penalty || 0);
      const correctionCell = document.createElement('td');
      correctionCell.innerHTML = `<b class="${corrections < 0 ? 'negative' : corrections > 0 ? 'positive' : ''}">${corrections > 0 ? '+' : corrections < 0 ? '−' : ''}${money(Math.abs(corrections))}</b>`;
      const totalCell = document.createElement('td');
      totalCell.innerHTML = `<b data-chef-period-total="${shift.personId}">${money(row.total)}</b>`;
      tr.children[6]?.after(correctionCell, totalCell);
    });
    return template.innerHTML;
  };

  const originalChefCalloutModal = openChefCalloutModal;
  openChefCalloutModal = function chefCalloutWithTaxiComment(shift, action) {
    originalChefCalloutModal(shift, action);
    const modal = document.querySelector('#modal');
    const taxiInput = modal.querySelector('[data-field="taxi"]');
    if (!taxiInput) return;
    const fieldElement = document.createElement('label');
    fieldElement.className = 'field';
    fieldElement.textContent = 'Комментарий к такси';
    const commentInput = document.createElement('input');
    commentInput.type = 'text';
    commentInput.value = shift.taxiComment || '';
    commentInput.placeholder = 'Например: после позднего окончания смены';
    fieldElement.appendChild(commentInput);
    taxiInput.closest('.field')?.after(fieldElement);
    const confirm = modal.querySelector('[data-confirm-modal]');
    const originalConfirm = confirm.onclick;
    confirm.onclick = () => {
      const previous = shift.taxiComment || '';
      shift.taxiComment = commentInput.value.trim();
      originalConfirm();
      if (!modal.classList.contains('hidden')) shift.taxiComment = previous;
    };
  };

  document.addEventListener('pointerover', event => {
    const target = event.target.closest('[data-finance-comment]');
    if (target && !target.contains(event.relatedTarget)) show(target);
  });
  document.addEventListener('pointerout', event => {
    const target = event.target.closest('[data-finance-comment]');
    if (target && !target.contains(event.relatedTarget)) hide(target);
  });
  document.addEventListener('focusin', event => show(event.target.closest('[data-finance-comment]')));
  document.addEventListener('focusout', event => hide(event.target.closest('[data-finance-comment]')));
  window.addEventListener('scroll', () => hide(), true);
  window.addEventListener('resize', () => hide());

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.querySelector('#page-root'), { childList: true, subtree: true });
  observer.observe(document.querySelector('#drawer'), { childList: true, subtree: true });
  scheduleEnhance();
})();
