/* Configurable monthly salary rules for TK employees. */
(function () {
  const FORMULA_PAY_TYPE = 'Индивидуальная окладная формула';
  const SALARY_PAY_TYPE = 'Оклад';

  function isSalaryEmployee(personRecord) {
    return employment(personRecord) === 'ТК' && [FORMULA_PAY_TYPE, SALARY_PAY_TYPE].includes(personRecord.payType);
  }

  function monthShifts(personId, locationFilter) {
    const monthKey = String(currentPeriodTo || currentPeriodFrom).slice(0, 7);
    return state.shifts.filter(shift => {
      const sameMonth = ruToIso(shift.date).startsWith(`${monthKey}-`);
      const sameLocation = locationFilter === 'Все площадки' || shift.location === locationFilter;
      return shift.personId === personId && sameMonth && sameLocation;
    });
  }

  const personWeekBeforeSalaryFormula = personWeek;
  personWeek = function (personRecord, locationFilter = 'Все площадки') {
    const row = personWeekBeforeSalaryFormula(personRecord, locationFilter);
    if (!isSalaryEmployee(personRecord)) return row;

    const salaryShifts = monthShifts(personRecord.id, locationFilter);
    const salaryErrors = salaryShifts.filter(hasError);
    const monthHours = salaryShifts.reduce((sum, shift) => sum + (hours(shift) || 0), 0);
    const salaryBase = Number(personRecord.salaryBase || personRecord.monthlySalary || personRecord.rate || 0);
    const normHours = Number(personRecord.salaryNormHours || 165);
    const overtimeRate = Number(personRecord.salaryOvertimeRate || 750);
    const overtimeHours = Math.max(0, monthHours - normHours);
    const included = isClosingPeriod();
    const base = included
      ? salaryBase + (personRecord.payType === FORMULA_PAY_TYPE ? overtimeHours * overtimeRate : 0)
      : 0;
    const total = base + row.taxi + row.bonus - row.penalty;

    return {
      ...row,
      ok: included ? salaryShifts.length > 0 && salaryErrors.length === 0 : row.ok,
      errorShifts: included ? salaryErrors : row.errorShifts,
      base,
      total,
      balance: total - row.paid,
      salaryBase,
      salaryNormHours: normHours,
      salaryOvertimeRate: overtimeRate,
      salaryMonthHours: monthHours,
      salaryOvertimeHours: overtimeHours,
      salaryIncluded: included
    };
  };

  window.salaryRateLabel = function (personRecord) {
    if (employment(personRecord) !== 'ТК') return null;

    if (personRecord.payType === FORMULA_PAY_TYPE) {
      const base = Number(personRecord.salaryBase || 123000);
      const norm = Number(personRecord.salaryNormHours || 165);
      const overtime = Number(personRecord.salaryOvertimeRate || 750);
      return `<b>${money(base)}</b><div class="subline salary-rate-note">до ${norm} ч · сверх +${money(overtime)}/ч</div>`;
    }

    if (personRecord.payType === SALARY_PAY_TYPE) {
      return `<b>${money(Number(personRecord.monthlySalary || personRecord.rate || 0))}</b><div class="subline salary-rate-note">оклад за месяц</div>`;
    }

    return null;
  };

  const rowStatusBeforeSalaryFormula = rowStatus;
  rowStatus = function (row) {
    if (isSalaryEmployee(row.p) && !isClosingPeriod()) return status('Оклад в конце месяца', 'warn');
    return rowStatusBeforeSalaryFormula(row);
  };

  function salaryField(label, name, value, note = '') {
    return `<label class="field">${label}<div class="salary-input"><input data-field="${name}" type="number" min="0" step="1" value="${value}"><span>${note}</span></div></label>`;
  }

  function updateSalaryFields(modal) {
    const engagement = modal.querySelector('[data-field="engagement"]')?.value;
    const payType = modal.querySelector('[data-field="payType"]')?.value;
    const hourly = modal.querySelector('[data-hourly-rate]');
    const regularSalary = modal.querySelector('[data-regular-salary]');
    const formula = modal.querySelector('[data-salary-formula]');
    const formulaOption = modal.querySelector('[data-field="payType"] option[value="' + FORMULA_PAY_TYPE + '"]');

    if (formulaOption) formulaOption.disabled = engagement !== 'ТК';
    if (engagement !== 'ТК' && payType === FORMULA_PAY_TYPE) {
      modal.querySelector('[data-field="payType"]').value = 'Почасовая';
    }

    const activeType = modal.querySelector('[data-field="payType"]')?.value;
    hourly?.classList.toggle('hidden', activeType !== 'Почасовая');
    regularSalary?.classList.toggle('hidden', activeType !== SALARY_PAY_TYPE);
    formula?.classList.toggle('hidden', activeType !== FORMULA_PAY_TYPE);
    modal.classList.toggle('salary-wide-layout', [SALARY_PAY_TYPE, FORMULA_PAY_TYPE].includes(activeType));
  }

  function openSalarySettings(personRecord) {
    const chefRate = personRecord.type === 'Вызывной' && employment(personRecord) === 'Наличные';
    const currentPayType = [FORMULA_PAY_TYPE, SALARY_PAY_TYPE, 'Почасовая'].includes(personRecord.payType)
      ? personRecord.payType
      : 'Почасовая';
    const salaryBase = Number(personRecord.salaryBase || 123000);
    const normHours = Number(personRecord.salaryNormHours || 165);
    const overtimeRate = Number(personRecord.salaryOvertimeRate || 750);
    const monthlySalary = Number(personRecord.monthlySalary || personRecord.rate || 0);

    openModal(
      'Оформление и ставка',
      field('Сотрудник', 'display', personRecord.name) +
      selectField('Оформление', 'engagement', options(['Наличные', 'СЗ', 'ТК'], employment(personRecord))) +
      selectField('Тип оплаты', 'payType', options(['Почасовая', SALARY_PAY_TYPE, FORMULA_PAY_TYPE], currentPayType)) +
      `<label class="field ${currentPayType === 'Почасовая' ? '' : 'hidden'}" data-hourly-rate>Ставка за час<div class="salary-input"><input data-field="rate" type="number" min="0" step="1" value="${personRecord.rate || ''}"><span>₽/ч</span></div></label>` +
      `<section class="salary-config full ${currentPayType === SALARY_PAY_TYPE ? '' : 'hidden'}" data-regular-salary>
        <div class="salary-config-head"><b>Ежемесячный оклад</b><span>Начисляется в последнюю неделю месяца</span></div>
        <div class="salary-config-grid">${salaryField('Оклад за месяц', 'monthlySalary', monthlySalary || 123000, '₽')}</div>
      </section>` +
      `<section class="salary-config full ${currentPayType === FORMULA_PAY_TYPE ? '' : 'hidden'}" data-salary-formula>
        <div class="salary-config-head"><b>Индивидуальная окладная формула</b><span>Значения можно менять для каждого сотрудника</span></div>
        <div class="salary-config-grid">
          ${salaryField('Оклад', 'salaryBase', salaryBase, '₽')}
          ${salaryField('Норма часов', 'salaryNormHours', normHours, 'ч')}
          ${salaryField('Переработка', 'salaryOvertimeRate', overtimeRate, '₽/ч')}
        </div>
        <div class="salary-formula-preview">Если часы ≤ <b data-formula-norm>${normHours}</b>, начислить <b data-formula-base>${money(salaryBase)}</b>; если больше — оклад + переработка × <b data-formula-overtime>${money(overtimeRate)}</b>.</div>
        <div class="salary-period-note">Часы берутся за весь календарный месяц. Начисление появляется один раз — в периоде, включающем последнюю неделю месяца.</div>
      </section>` +
      (chefRate ? '<div class="field full rate-hint">Для наличного вызывного ставку устанавливает шеф отдельно в каждой закрытой смене.</div>' : '') +
      field('Действует с', 'from', today()),
      'Сохранить условия',
      data => {
        const selectedType = data.payType;
        if (selectedType === FORMULA_PAY_TYPE && data.engagement !== 'ТК') {
          toast('Индивидуальная окладная формула доступна только для ТК');
          return false;
        }
        if (selectedType === 'Почасовая' && !chefRate && !(Number(data.rate) > 0)) {
          toast('Введите ставку за час');
          return false;
        }
        if (selectedType === SALARY_PAY_TYPE && !(Number(data.monthlySalary) > 0)) {
          toast('Введите оклад за месяц');
          return false;
        }
        if (selectedType === FORMULA_PAY_TYPE && (!(Number(data.salaryBase) > 0) || !(Number(data.salaryNormHours) > 0) || !(Number(data.salaryOvertimeRate) > 0))) {
          toast('Заполните оклад, норму часов и ставку переработки');
          return false;
        }

        personRecord.engagement = data.engagement;
        personRecord.payType = selectedType;
        if (selectedType === 'Почасовая' && !chefRate) personRecord.rate = Number(data.rate);
        if (selectedType === SALARY_PAY_TYPE) {
          personRecord.monthlySalary = Number(data.monthlySalary);
          personRecord.rate = Number(data.monthlySalary);
        }
        if (selectedType === FORMULA_PAY_TYPE) {
          personRecord.salaryBase = Number(data.salaryBase);
          personRecord.salaryNormHours = Number(data.salaryNormHours);
          personRecord.salaryOvertimeRate = Number(data.salaryOvertimeRate);
          personRecord.rate = Number(data.salaryOvertimeRate);
        }

        personRecord.rateConfirmed = true;
        personRecord.ratePosition = personRecord.position;
        personRecord.rateConfirmedAt = new Date().toLocaleString('ru-RU');
        personRecord.rateConfirmedBy = 'Бухгалтер';
        state.shifts
          .filter(shift => shift.personId === personRecord.id && shift.type !== 'Вызывной' && shift.rateReview && shift.position === personRecord.position)
          .forEach(shift => {
            if (selectedType === 'Почасовая') shift.rate = Number(personRecord.rate);
            shift.rateReview = false;
            if (shift.exit && ['Требует проверки', 'Требует проверки ставки'].includes(shift.status)) shift.status = 'Готово';
          });

        state.shifts.filter(shift => shift.personId === personRecord.id && shift.exit).forEach(reconcileShift);
        const conditions = selectedType === FORMULA_PAY_TYPE
          ? `${money(personRecord.salaryBase)} до ${personRecord.salaryNormHours} ч, переработка ${money(personRecord.salaryOvertimeRate)}/ч`
          : selectedType === SALARY_PAY_TYPE
            ? `${money(personRecord.monthlySalary)} в месяц`
            : `${money(personRecord.rate)}/ч`;
        state.audit.unshift({
          at: new Date().toLocaleString('ru-RU'),
          actor: 'Бухгалтер',
          text: `Оформление изменено на ${data.engagement} · ${selectedType} · ${conditions} для ${personRecord.name}`
        });
      }
    );

    const modal = document.querySelector('#modal');
    modal.classList.add('salary-settings-modal');
    modal.querySelector('[data-field="display"]')?.closest('.field')?.classList.add('salary-employee-field');
    modal.querySelector('[data-field="engagement"]')?.closest('.field')?.classList.add('salary-engagement-field');
    modal.querySelector('[data-field="payType"]')?.closest('.field')?.classList.add('salary-paytype-field');
    modal.querySelector('[data-field="from"]')?.closest('.field')?.classList.add('salary-from-field');
    const modalActions = modal.querySelector('.modal-actions');
    modalActions?.insertAdjacentHTML('afterbegin', '<button class="salary-reset-btn" type="button" data-reset-salary>↻&nbsp;&nbsp;Сбросить</button>');
    const engagementSelect = modal.querySelector('[data-field="engagement"]');
    const payTypeSelect = modal.querySelector('[data-field="payType"]');
    const updatePreview = () => {
      const base = Number(modal.querySelector('[data-field="salaryBase"]')?.value || 0);
      const norm = Number(modal.querySelector('[data-field="salaryNormHours"]')?.value || 0);
      const overtime = Number(modal.querySelector('[data-field="salaryOvertimeRate"]')?.value || 0);
      const baseNode = modal.querySelector('[data-formula-base]');
      const normNode = modal.querySelector('[data-formula-norm]');
      const overtimeNode = modal.querySelector('[data-formula-overtime]');
      if (baseNode) baseNode.textContent = money(base);
      if (normNode) normNode.textContent = norm.toLocaleString('ru-RU');
      if (overtimeNode) overtimeNode.textContent = money(overtime);
    };
    engagementSelect.onchange = () => updateSalaryFields(modal);
    payTypeSelect.onchange = () => updateSalaryFields(modal);
    modal.querySelectorAll('[data-salary-formula] input').forEach(input => input.oninput = updatePreview);
    modal.querySelector('[data-reset-salary]').onclick = () => {
      const defaults = { salaryBase: 123000, salaryNormHours: 165, salaryOvertimeRate: 750 };
      Object.entries(defaults).forEach(([name, value]) => {
        const input = modal.querySelector(`[data-field="${name}"]`);
        if (input) input.value = value;
      });
      updatePreview();
    };
    updateSalaryFields(modal);
  }

  const openModalBeforeSalaryLayout = openModal;
  openModal = function (...args) {
    const modal = document.querySelector('#modal');
    modal.classList.remove('salary-settings-modal', 'salary-wide-layout');
    return openModalBeforeSalaryLayout(...args);
  };

  const bindActionBeforeSalaryFormula = bindAction;
  bindAction = function (element) {
    if (element.dataset.action !== 'edit-rate') {
      bindActionBeforeSalaryFormula(element);
      return;
    }
    element.onclick = () => {
      const personRecord = person(Number(element.dataset.id));
      if (!document.querySelector('#drawer').classList.contains('hidden')) closeDrawer();
      openSalarySettings(personRecord);
    };
  };

  const openPersonDrawerBeforeSalaryFormula = openPersonDrawer;
  openPersonDrawer = function (id) {
    openPersonDrawerBeforeSalaryFormula(id);
    const personRecord = person(id);
    if (!isSalaryEmployee(personRecord)) return;

    const drawer = document.querySelector('#drawer');
    const row = personWeek(personRecord);
    const terms = drawer.querySelector('.current-terms');
    if (terms) {
      const details = personRecord.payType === FORMULA_PAY_TYPE
        ? `<div class="drawer-salary-formula"><span><small>Оклад</small><b>${money(row.salaryBase)}</b></span><span><small>Норма</small><b>${row.salaryNormHours} ч</b></span><span><small>Переработка</small><b>${money(row.salaryOvertimeRate)}/ч</b></span><span><small>Часы за месяц</small><b>${row.salaryMonthHours.toLocaleString('ru-RU')} ч</b></span></div>`
        : `<div class="drawer-salary-formula"><span><small>Оклад за месяц</small><b>${money(row.salaryBase)}</b></span><span><small>Начисление</small><b>${row.salaryIncluded ? 'Включено в период' : 'В конце месяца'}</b></span></div>`;
      terms.insertAdjacentHTML('afterend', details);
      const rateTitle = terms.querySelector('span:last-child small');
      const rateValue = terms.querySelector('span:last-child b');
      if (rateTitle) rateTitle.textContent = 'Тип оплаты';
      if (rateValue) rateValue.textContent = personRecord.payType === FORMULA_PAY_TYPE ? 'Индивидуальный оклад' : 'Оклад';
    }
    drawer.querySelectorAll('.person-shift-card .shift-money b').forEach(value => value.textContent = 'В окладе');
  };

  render();
})();
