/* Configurable monthly salary rules for TK employees. */
(function () {
  const FORMULA_PAY_TYPE = 'Индивидуальная окладная формула';
  const SALARY_PAY_TYPE = 'Оклад';

  function dateKey(value) {
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) return ruToIso(text);
    return '';
  }

  function shiftDateKey(shift) {
    return dateKey(shift?.date);
  }

  function previousDate(value) {
    const parsed = new Date(`${value}T12:00:00`);
    parsed.setDate(parsed.getDate() - 1);
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  function assignmentContains(assignment, date) {
    return assignment.from <= date && (!assignment.to || date <= assignment.to);
  }

  function rateAssignmentFor(personRecord, position, dateValue) {
    const date = dateKey(dateValue);
    if (!date) return null;
    return (personRecord.rateAssignments || [])
      .filter(item => item.position === position && assignmentContains(item, date))
      .sort((a, b) => b.from.localeCompare(a.from))[0] || null;
  }

  function hasRateSchedule(personRecord, position) {
    return (personRecord.rateAssignments || []).some(item => item.position === position);
  }

  function assignmentRate(assignment) {
    if (!assignment) return null;
    if (assignment.payType === 'Почасовая') return Number(assignment.rate) || null;
    if (assignment.payType === SALARY_PAY_TYPE) return Number(assignment.monthlySalary) || null;
    if (assignment.payType === FORMULA_PAY_TYPE) return Number(assignment.salaryOvertimeRate) || null;
    return Number(assignment.rate) || null;
  }

  const rateOfBeforeAssignments = rateOf;
  rateOf = function (shift) {
    if (Number(shift?.rate) > 0) return Number(shift.rate);
    const personRecord = person(shift.personId);
    const assignment = rateAssignmentFor(personRecord, shift.position, shiftDateKey(shift));
    if (assignment) return assignmentRate(assignment);
    if (hasRateSchedule(personRecord, shift.position)) return null;
    return rateOfBeforeAssignments(shift);
  };

  const rateForNewShiftBeforeAssignments = rateForNewShift;
  rateForNewShift = function (personRecord, position, location) {
    const assignment = rateAssignmentFor(personRecord, position, today());
    if (assignment) {
      const rate = assignmentRate(assignment);
      return {
        rate,
        rateReview: assignment.payType === 'Почасовая' ? !(rate > 0) : false
      };
    }
    if (hasRateSchedule(personRecord, position)) {
      return { rate: baseRate(position, location), rateReview: true };
    }
    return rateForNewShiftBeforeAssignments(personRecord, position, location);
  };

  function snapshotExistingShiftRates(personRecord) {
    state.shifts
      .filter(shift => shift.personId === personRecord.id && shift.type !== 'Вызывной' && !(Number(shift.rate) > 0))
      .forEach(shift => {
        const savedRate = rateOf(shift);
        if (savedRate > 0) shift.rate = Number(savedRate);
      });
  }

  function currentAssignmentText(personRecord) {
    const assignments = (personRecord.rateAssignments || [])
      .filter(item => item.position === personRecord.position)
      .sort((a, b) => b.from.localeCompare(a.from));
    if (!assignments.length) return 'Периоды ставок ещё не заданы. Первая запись сохранит текущие смены со старой ставкой.';
    const latest = assignments[0];
    return `Последнее назначение: ${isoToRu(latest.from)}–${latest.to ? isoToRu(latest.to) : 'бессрочно'}, ${money(assignmentRate(latest))}${latest.payType === 'Почасовая' ? '/ч' : ''}.`;
  }

  function buildRateAssignment(personRecord, data) {
    const from = dateKey(data.from);
    const indefinite = !!data.indefinite;
    const to = indefinite ? null : dateKey(data.to);
    if (!from) {
      toast('Укажите дату начала действия ставки');
      return null;
    }
    if (!indefinite && !to) {
      toast('Укажите дату окончания или выберите «Бессрочно»');
      return null;
    }
    if (to && to < from) {
      toast('Дата окончания не может быть раньше даты начала');
      return null;
    }

    const position = personRecord.position;
    const existing = (personRecord.rateAssignments || []).map(item => ({ ...item }));
    const futureOverlap = existing.find(item => {
      if (item.position !== position || item.from === from) return false;
      const endsAfterStart = !item.to || item.to >= from;
      const newEndsAfterExistingStart = !to || to >= item.from;
      return item.from > from && endsAfterStart && newEndsAfterExistingStart;
    });
    if (futureOverlap) {
      toast(`Период пересекается с назначением от ${isoToRu(futureOverlap.from)}`);
      return null;
    }

    snapshotExistingShiftRates(personRecord);
    const samePosition = existing.filter(item => item.position === position);
    if (!samePosition.length && Number(personRecord.rate) > 0) {
      const historicalDates = state.shifts
        .filter(shift => shift.personId === personRecord.id && shift.position === position)
        .map(shiftDateKey)
        .filter(Boolean)
        .sort();
      const legacyFrom = historicalDates[0] || dateKey(today());
      if (legacyFrom < from) {
        existing.push({
          id: nextId(),
          position,
          engagement: employment(personRecord),
          payType: personRecord.payType || 'Почасовая',
          rate: Number(personRecord.rate),
          monthlySalary: Number(personRecord.monthlySalary || 0),
          salaryBase: Number(personRecord.salaryBase || 0),
          salaryNormHours: Number(personRecord.salaryNormHours || 0),
          salaryOvertimeRate: Number(personRecord.salaryOvertimeRate || 0),
          from: legacyFrom,
          to: previousDate(from),
          migrated: true
        });
      }
    }

    const updated = existing
      .filter(item => !(item.position === position && item.from === from))
      .map(item => {
        if (item.position === position && item.from < from && (!item.to || item.to >= from)) {
          return { ...item, to: previousDate(from) };
        }
        return item;
      });

    const assignment = {
      id: nextId(),
      position,
      engagement: data.engagement,
      payType: data.payType,
      rate: Number(data.rate || 0),
      monthlySalary: Number(data.monthlySalary || 0),
      salaryBase: Number(data.salaryBase || 0),
      salaryNormHours: Number(data.payType === SALARY_PAY_TYPE ? data.monthlyNormHours : data.salaryNormHours || 0),
      salaryOvertimeRate: Number(data.salaryOvertimeRate || 0),
      from,
      to,
      indefinite,
      createdAt: new Date().toLocaleString('ru-RU'),
      createdBy: 'Бухгалтер'
    };
    personRecord.rateAssignments = [...updated, assignment].sort((a, b) => a.from.localeCompare(b.from));
    return assignment;
  }

  function applyAssignmentToShifts(personRecord, assignment) {
    state.shifts
      .filter(shift => {
        const date = shiftDateKey(shift);
        return shift.personId === personRecord.id &&
          shift.type !== 'Вызывной' &&
          shift.position === assignment.position &&
          date && assignmentContains(assignment, date);
      })
      .forEach(shift => {
        if (assignment.payType === 'Почасовая') shift.rate = Number(assignment.rate);
        shift.engagement = assignment.engagement;
        shift.rateReview = false;
        if (shift.exit) reconcileShift(shift);
      });
  }

  function isSalaryEmployee(personRecord) {
    return employment(personRecord) === 'ТК' && [FORMULA_PAY_TYPE, SALARY_PAY_TYPE].includes(personRecord.payType);
  }

  function salaryShiftAmount(shift, personRecord = person(shift.personId)) {
    if (!isSalaryEmployee(personRecord) || shift.type === 'Вызывной') return null;
    const shiftKey = shiftDateKey(shift).slice(0, 7);
    const ordered = state.shifts
      .filter(item => item.personId === personRecord.id && item.type !== 'Вызывной' && shiftDateKey(item).startsWith(shiftKey) && hours(item) != null)
      .slice()
      .sort((a, b) => shiftDateKey(a).localeCompare(shiftDateKey(b)) || a.id - b.id);
    const index = ordered.findIndex(item => item.id === shift.id);
    if (index < 0) return 0;
    const norm = Number(personRecord.salaryNormHours || 165);
    const base = Number(personRecord.payType === FORMULA_PAY_TYPE ? personRecord.salaryBase || personRecord.monthlySalary || personRecord.rate || 0 : personRecord.monthlySalary || personRecord.rate || 0);
    const overtimeRate = personRecord.payType === FORMULA_PAY_TYPE ? Number(personRecord.salaryOvertimeRate || 750) : 0;
    const before = ordered.slice(0, index).reduce((sum, item) => sum + (hours(item) || 0), 0);
    const worked = hours(shift) || 0;
    const regularHours = Math.min(worked, Math.max(0, norm - before));
    const overtimeHours = Math.max(0, worked - regularHours);
    return (norm > 0 ? base / norm * regularHours : 0) + overtimeHours * overtimeRate;
  }

  const accruedBeforeSalaryFormula = accrued;
  accrued = function (shift) {
    const calculated = salaryShiftAmount(shift);
    return calculated == null ? accruedBeforeSalaryFormula(shift) : calculated;
  };

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
    const salaryBase = Number(personRecord.payType === FORMULA_PAY_TYPE ? personRecord.salaryBase || personRecord.monthlySalary || personRecord.rate || 0 : personRecord.monthlySalary || personRecord.rate || 0);
    const normHours = Number(personRecord.salaryNormHours || 165);
    const overtimeRate = Number(personRecord.salaryOvertimeRate || 750);
    const overtimeHours = Math.max(0, monthHours - normHours);
    const proportionalHours = Math.min(monthHours, normHours);
    const proportionalBase = normHours > 0 ? salaryBase / normHours * proportionalHours : 0;
    const base = Math.round(proportionalBase + (personRecord.payType === FORMULA_PAY_TYPE ? overtimeHours * overtimeRate : 0));
    const payable = isClosingPeriod();
    const total = base + row.taxi + row.bonus - row.penalty;

    return {
      ...row,
      ok: salaryShifts.length > 0 && salaryErrors.length === 0,
      errorShifts: salaryErrors,
      base,
      total,
      balance: total - row.paid,
      salaryBase,
      salaryNormHours: normHours,
      salaryOvertimeRate: overtimeRate,
      salaryMonthHours: monthHours,
      salaryOvertimeHours: overtimeHours,
      salaryHourlyValue: normHours > 0 ? salaryBase / normHours : 0,
      salaryUnderNorm: monthHours < normHours,
      salaryMissingHours: Math.max(0, normHours - monthHours),
      salaryIncluded: true,
      salaryPayable: payable
    };
  };

  window.salaryRateLabel = function (personRecord) {
    if (employment(personRecord) !== 'ТК') return null;

    if (personRecord.payType === FORMULA_PAY_TYPE) {
      const base = Number(personRecord.salaryBase || 123000);
      const norm = Number(personRecord.salaryNormHours || 165);
      const overtime = Number(personRecord.salaryOvertimeRate || 750);
      const hourly = norm > 0 ? base / norm : 0;
      return `<b>${money(base)}</b><div class="subline salary-rate-note">${money(hourly)}/ч до ${norm} ч · сверх +${money(overtime)}/ч</div>`;
    }

    if (personRecord.payType === SALARY_PAY_TYPE) {
      const base = Number(personRecord.monthlySalary || personRecord.rate || 0);
      const norm = Number(personRecord.salaryNormHours || 165);
      const hourly = norm > 0 ? base / norm : 0;
      return `<b>${money(base)}</b><div class="subline salary-rate-note">${money(hourly)}/ч · норма ${norm} ч</div>`;
    }

    return null;
  };

  const rowStatusBeforeSalaryFormula = rowStatus;
  rowStatus = function (row) {
    if (isSalaryEmployee(row.p) && row.salaryUnderNorm) return status(`Начислено ${row.salaryMonthHours.toLocaleString('ru-RU')} из ${row.salaryNormHours} ч`, 'warn');
    if (isSalaryEmployee(row.p) && !row.salaryPayable) return status('Накоплено · выплата в конце месяца', 'warn');
    return rowStatusBeforeSalaryFormula(row);
  };

  const openRegistersBeforeSalaryFormula = openRegistersModal;
  openRegistersModal = function () {
    const weekRowsBeforeRegistry = weekRows;
    weekRows = function () {
      return weekRowsBeforeRegistry().map(row => row.salaryPayable === false ? { ...row, ok: false } : row);
    };
    try {
      return openRegistersBeforeSalaryFormula();
    } finally {
      weekRows = weekRowsBeforeRegistry;
    }
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
    const validityBlock = `<section class="rate-validity" data-rate-validity>
        <div class="rate-validity-head"><b>Период действия ставки</b><span>Для должности «${personRecord.position}»</span></div>
        ${field('Действует с', 'from', today())}
        ${field('Действует до', 'to', '')}
        <label class="check-field rate-indefinite"><input data-field="indefinite" type="checkbox" checked><span><b>Бессрочно</b><small>Ставка действует, пока не появится новое назначение</small></span></label>
        <div class="rate-validity-note">${currentAssignmentText(personRecord)}<br>Смены до начала периода сохранят прежнюю ставку.</div>
      </section>`;

    openModal(
      'Оформление и ставка',
      field('Сотрудник', 'display', personRecord.name) +
      selectField('Оформление', 'engagement', options(['Наличные', 'СЗ', 'ТК'], employment(personRecord))) +
      selectField('Тип оплаты', 'payType', options(['Почасовая', SALARY_PAY_TYPE, FORMULA_PAY_TYPE], currentPayType)) +
      `<label class="field ${currentPayType === 'Почасовая' ? '' : 'hidden'}" data-hourly-rate>Ставка за час<div class="salary-input"><input data-field="rate" type="number" min="0" step="1" value="${personRecord.rate || ''}"><span>₽/ч</span></div></label>` +
      `<section class="salary-config full ${currentPayType === SALARY_PAY_TYPE ? '' : 'hidden'}" data-regular-salary>
        <div class="salary-config-head"><b>Ежемесячный оклад</b><span>Растёт по закрытым сменам, выплачивается в конце месяца</span></div>
        <div class="salary-config-grid">
          ${salaryField('Оклад за месяц', 'monthlySalary', monthlySalary || 123000, '₽')}
          ${salaryField('Норма часов', 'monthlyNormHours', normHours, 'ч')}
        </div>
        <div class="salary-formula-preview">До нормы: оклад ÷ <b data-regular-norm>${normHours}</b> × отработанные часы. Сверх нормы доплата не начисляется.</div>
      </section>` +
      `<section class="salary-config full ${currentPayType === FORMULA_PAY_TYPE ? '' : 'hidden'}" data-salary-formula>
        <div class="salary-config-head"><b>Индивидуальная окладная формула</b><span>Значения можно менять для каждого сотрудника</span></div>
        <div class="salary-config-grid">
          ${salaryField('Оклад', 'salaryBase', salaryBase, '₽')}
          ${salaryField('Норма часов', 'salaryNormHours', normHours, 'ч')}
          ${salaryField('Переработка', 'salaryOvertimeRate', overtimeRate, '₽/ч')}
        </div>
        <div class="salary-formula-preview">До <b data-formula-norm>${normHours}</b> ч: <b data-formula-base>${money(salaryBase)}</b> ÷ <b data-formula-norm>${normHours}</b> × фактические часы. Сверх нормы: полный оклад + переработка × <b data-formula-overtime>${money(overtimeRate)}</b>.</div>
        <div class="salary-period-note">Начисление растёт после каждой закрытой смены. Выплата оклада доступна в периоде, включающем последнюю неделю месяца.</div>
      </section>` +
      (chefRate ? '<div class="field full rate-hint">Для наличного вызывного ставку устанавливает шеф отдельно в каждой закрытой смене.</div>' : '') +
      validityBlock,
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
        if (selectedType === SALARY_PAY_TYPE && (!(Number(data.monthlySalary) > 0) || !(Number(data.monthlyNormHours) > 0))) {
          toast('Введите оклад за месяц и норму часов');
          return false;
        }
        if (selectedType === FORMULA_PAY_TYPE && (!(Number(data.salaryBase) > 0) || !(Number(data.salaryNormHours) > 0) || !(Number(data.salaryOvertimeRate) > 0))) {
          toast('Заполните оклад, норму часов и ставку переработки');
          return false;
        }

        const assignment = buildRateAssignment(personRecord, data);
        if (!assignment) return false;

        const todayKey = dateKey(today());
        if (assignmentContains(assignment, todayKey)) {
          personRecord.engagement = data.engagement;
          personRecord.payType = selectedType;
          if (selectedType === 'Почасовая' && !chefRate) personRecord.rate = Number(data.rate);
          if (selectedType === SALARY_PAY_TYPE) {
            personRecord.monthlySalary = Number(data.monthlySalary);
            personRecord.salaryNormHours = Number(data.monthlyNormHours);
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
        }

        applyAssignmentToShifts(personRecord, assignment);
        const conditions = selectedType === FORMULA_PAY_TYPE
          ? `${money(assignment.salaryBase)} до ${assignment.salaryNormHours} ч, переработка ${money(assignment.salaryOvertimeRate)}/ч`
          : selectedType === SALARY_PAY_TYPE
            ? `${money(assignment.monthlySalary)} в месяц, норма ${assignment.salaryNormHours} ч`
            : `${money(assignment.rate)}/ч`;
        const validity = `${isoToRu(assignment.from)}–${assignment.to ? isoToRu(assignment.to) : 'бессрочно'}`;
        state.audit.unshift({
          at: new Date().toLocaleString('ru-RU'),
          actor: 'Бухгалтер',
          text: `Для ${personRecord.name} назначены условия: ${personRecord.position} · ${data.engagement} · ${selectedType} · ${conditions} · период ${validity}`
        });
      }
    );

    const modal = document.querySelector('#modal');
    modal.classList.add('salary-settings-modal');
    modal.querySelector('[data-field="display"]')?.closest('.field')?.classList.add('salary-employee-field');
    modal.querySelector('[data-field="engagement"]')?.closest('.field')?.classList.add('salary-engagement-field');
    modal.querySelector('[data-field="payType"]')?.closest('.field')?.classList.add('salary-paytype-field');
    const modalActions = modal.querySelector('.modal-actions');
    modalActions?.insertAdjacentHTML('afterbegin', '<button class="salary-reset-btn" type="button" data-reset-salary>↻&nbsp;&nbsp;Сбросить</button>');
    const engagementSelect = modal.querySelector('[data-field="engagement"]');
    const payTypeSelect = modal.querySelector('[data-field="payType"]');
    const updatePreview = () => {
      const base = Number(modal.querySelector('[data-field="salaryBase"]')?.value || 0);
      const norm = Number(modal.querySelector('[data-field="salaryNormHours"]')?.value || 0);
      const regularNorm = Number(modal.querySelector('[data-field="monthlyNormHours"]')?.value || 0);
      const overtime = Number(modal.querySelector('[data-field="salaryOvertimeRate"]')?.value || 0);
      const baseNode = modal.querySelector('[data-formula-base]');
      const normNodes = modal.querySelectorAll('[data-formula-norm]');
      const regularNormNode = modal.querySelector('[data-regular-norm]');
      const overtimeNode = modal.querySelector('[data-formula-overtime]');
      if (baseNode) baseNode.textContent = money(base);
      normNodes.forEach(node => node.textContent = norm.toLocaleString('ru-RU'));
      if (regularNormNode) regularNormNode.textContent = regularNorm.toLocaleString('ru-RU');
      if (overtimeNode) overtimeNode.textContent = money(overtime);
    };
    engagementSelect.onchange = () => updateSalaryFields(modal);
    payTypeSelect.onchange = () => updateSalaryFields(modal);
    const indefiniteInput = modal.querySelector('[data-field="indefinite"]');
    const toInput = modal.querySelector('[data-field="to"]');
    const toField = toInput?.closest('.field');
    const updateValidity = () => {
      const indefinite = !!indefiniteInput?.checked;
      if (toInput) {
        toInput.disabled = indefinite;
        if (indefinite) toInput.value = '';
      }
      toField?.classList.toggle('disabled', indefinite);
      toField?.querySelector('[data-date-picker]')?.toggleAttribute('disabled', indefinite);
    };
    if (indefiniteInput) indefiniteInput.onchange = updateValidity;
    modal.querySelectorAll('[data-salary-formula] input,[data-regular-salary] input').forEach(input => input.oninput = updatePreview);
    modal.querySelector('[data-reset-salary]').onclick = () => {
      const defaults = { salaryBase: 123000, salaryNormHours: 165, salaryOvertimeRate: 750 };
      Object.entries(defaults).forEach(([name, value]) => {
        const input = modal.querySelector(`[data-field="${name}"]`);
        if (input) input.value = value;
      });
      updatePreview();
    };
    updateSalaryFields(modal);
    updateValidity();
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
