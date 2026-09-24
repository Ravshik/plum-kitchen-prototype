(function () {
  const ONBOARDING_STEPS = new Set(['position', 'employment', 'tk-settings']);

  function personStep(employee) {
    if (!employee) return '';
    if (['rate', 'position', 'employment', 'tk-settings'].includes(employee.onboardingStep)) return employee.onboardingStep;
    const legacyPending = employee.source === 'security' && employee.registeredAtLocation && !employee.rateConfirmed && !(Number(employee.rate) > 0);
    return employee.needsAccountingReview || legacyPending ? 'rate' : '';
  }

  function needsPersonOnboarding(employee) {
    return !!personStep(employee);
  }

  window.needsPersonOnboarding = needsPersonOnboarding;

  const weekRowsBeforePersonOnboarding = weekRows;
  weekRows = function () {
    const rows = weekRowsBeforePersonOnboarding();
    const existing = new Set(rows.map(row => row.p.id));
    state.people.forEach(employee => {
      const inLocation = currentLocation === 'Все площадки' || employee.registeredAtLocation === currentLocation || employee.location === currentLocation;
      if (needsPersonOnboarding(employee) && inLocation && !existing.has(employee.id)) rows.push(personWeek(employee, currentLocation));
    });
    return rows;
  };

  function stepOf(shift) {
    if (ONBOARDING_STEPS.has(shift.onboardingStep)) return shift.onboardingStep;
    if (shift.exit && (!rateOf(shift) || shift.rateReview)) return 'rate';
    return '';
  }

  function employeeForShift(shift) {
    return person(shift.personId);
  }

  function markPending(shift, step) {
    shift.onboardingStep = step;
    shift.status = 'Требует оформления сотрудника';
  }

  function markPersonPending(employee, step) {
    employee.needsAccountingReview = true;
    employee.onboardingStep = step;
  }

  function readyStatus(shift) {
    if (shift.paid != null) return shift.type === 'Вызывной' ? 'Закрыт подотчётом' : 'Проверено';
    return 'Готово';
  }

  function finishSimpleOnboarding(shift, engagement) {
    const employee = employeeForShift(shift);
    const confirmedRate = rateOf(shift);
    const pendingShifts = state.shifts.filter(candidate => candidate.personId === employee.id && candidate.position === shift.position && (candidate.rateReview || ONBOARDING_STEPS.has(candidate.onboardingStep)));
    shift.engagement = engagement;
    employee.engagement = engagement;
    confirmEmployeeRate(shift, confirmedRate);

    pendingShifts.forEach(candidate => {
      candidate.rate = confirmedRate;
      candidate.rateReview = false;
      candidate.engagement = engagement;
      delete candidate.onboardingStep;
      if (candidate.exit) candidate.status = readyStatus(candidate);
    });
    delete shift.onboardingStep;
    shift.status = readyStatus(shift);
    state.audit.unshift({
      at: new Date().toLocaleString('ru-RU'),
      actor: 'Бухгалтер',
      text: `${employee.name}: оформление завершено · ${shift.position} · ${engagement} · ставка ${money(confirmedRate)}/ч`
    });
  }

  function finishTkOnboarding(shift) {
    const employee = employeeForShift(shift);
    const fallbackRate = rateOf(shift);
    employee.engagement = 'ТК';
    employee.rateConfirmed = true;
    employee.ratePosition = shift.position;
    employee.rateConfirmedAt = new Date().toLocaleString('ru-RU');
    employee.rateConfirmedBy = 'Бухгалтер';

    state.shifts.forEach(candidate => {
      if (candidate.personId !== employee.id || candidate.position !== shift.position) return;
      if (candidate.rateReview || ONBOARDING_STEPS.has(candidate.onboardingStep)) {
        if (!rateOf(candidate)) candidate.rate = fallbackRate;
        candidate.rateReview = false;
        candidate.engagement = 'ТК';
        delete candidate.onboardingStep;
        if (candidate.exit) candidate.status = readyStatus(candidate);
      }
    });
    shift.engagement = 'ТК';
    delete shift.onboardingStep;
    shift.status = readyStatus(shift);
    state.audit.unshift({
      at: new Date().toLocaleString('ru-RU'),
      actor: 'Бухгалтер',
      text: `${employee.name}: оформление ТК завершено · ${shift.position}`
    });
  }

  function finishPersonSimpleOnboarding(employee, engagement) {
    const confirmedRate = Number(employee.rate);
    employee.engagement = engagement;
    employee.rateConfirmed = true;
    employee.ratePosition = employee.position;
    employee.rateConfirmedAt = new Date().toLocaleString('ru-RU');
    employee.rateConfirmedBy = 'Бухгалтер';
    employee.needsAccountingReview = false;
    delete employee.onboardingStep;
    state.shifts.forEach(shift => {
      if (shift.personId !== employee.id || shift.position !== employee.position || !shift.rateReview) return;
      shift.rate = confirmedRate;
      shift.rateReview = false;
      shift.engagement = engagement;
      if (shift.exit) shift.status = readyStatus(shift);
    });
    state.audit.unshift({
      at: new Date().toLocaleString('ru-RU'),
      actor: 'Бухгалтер',
      text: `${employee.name}: карточка нового сотрудника подтверждена · ${employee.position} · ${engagement} · ставка ${money(confirmedRate)}/ч`
    });
  }

  function finishPersonTkOnboarding(employee, pendingShiftIds) {
    employee.engagement = 'ТК';
    employee.rateConfirmed = true;
    employee.ratePosition = employee.position;
    employee.rateConfirmedAt = new Date().toLocaleString('ru-RU');
    employee.rateConfirmedBy = 'Бухгалтер';
    employee.needsAccountingReview = false;
    delete employee.onboardingStep;
    state.shifts.forEach(shift => {
      if (!pendingShiftIds.includes(shift.id)) return;
      if (!rateOf(shift)) shift.rate = Number(employee.rate || 0);
      shift.rateReview = false;
      shift.engagement = 'ТК';
      if (shift.exit) shift.status = readyStatus(shift);
    });
    state.audit.unshift({
      at: new Date().toLocaleString('ru-RU'),
      actor: 'Бухгалтер',
      text: `${employee.name}: карточка нового сотрудника подтверждена по ТК · ${employee.position}`
    });
  }

  function openTkOnboarding(shift) {
    const employee = employeeForShift(shift);
    employee.engagement = 'ТК';
    shift.engagement = 'ТК';
    markPending(shift, 'tk-settings');
    save();
    render();

    if (typeof window.openSalarySettings !== 'function') {
      toast('Не удалось открыть настройки ТК');
      return;
    }

    window.openSalarySettings(employee, () => finishTkOnboarding(shift));
    const modal = document.querySelector('#modal');
    const title = modal.querySelector('.modal-head h2');
    if (title) title.textContent = 'Условия оформления по ТК';
    const engagementSelect = modal.querySelector('[data-field="engagement"]');
    if (engagementSelect) {
      engagementSelect.value = 'ТК';
      engagementSelect.disabled = true;
      engagementSelect.closest('.field')?.classList.add('onboarding-locked-field');
    }
    modal.querySelector('.form-grid')?.insertAdjacentHTML(
      'afterbegin',
      '<div class="onboarding-modal-note full"><b>Последний шаг</b><span>Выберите тип оплаты и период действия условий. После сохранения сотрудник станет доступен для расчёта.</span></div>'
    );
  }

  function decorateTkModal() {
    const modal = document.querySelector('#modal');
    const title = modal.querySelector('.modal-head h2');
    if (title) title.textContent = 'Условия оформления по ТК';
    const engagementSelect = modal.querySelector('[data-field="engagement"]');
    if (engagementSelect) {
      engagementSelect.value = 'ТК';
      engagementSelect.disabled = true;
      engagementSelect.closest('.field')?.classList.add('onboarding-locked-field');
    }
    modal.querySelector('.form-grid')?.insertAdjacentHTML(
      'afterbegin',
      '<div class="onboarding-modal-note full"><b>Последний шаг</b><span>Выберите тип оплаты и период действия условий. После сохранения сотрудник станет доступен для расчёта.</span></div>'
    );
  }

  function openPersonTkOnboarding(employee) {
    const pendingShiftIds = state.shifts
      .filter(shift => shift.personId === employee.id && shift.position === employee.position && (shift.rateReview || ONBOARDING_STEPS.has(shift.onboardingStep)))
      .map(shift => shift.id);
    employee.engagement = 'ТК';
    markPersonPending(employee, 'tk-settings');
    save();
    render();
    if (typeof window.openSalarySettings !== 'function') {
      toast('Не удалось открыть настройки ТК');
      return;
    }
    window.openSalarySettings(employee, () => finishPersonTkOnboarding(employee, pendingShiftIds));
    decorateTkModal();
  }

  function issueFor(shift) {
    const step = stepOf(shift);
    if (step === 'rate') return { problem: 'Новый сотрудник: ставка', tone: 'warn', required: 'Шаг 1 из 3 · подтвердить ставку', action: 'Открыть смену' };
    if (step === 'position') return { problem: 'Не подтверждена должность', tone: 'warn', required: 'Шаг 2 из 3 · выбрать должность', action: 'Открыть смену' };
    if (step === 'employment') return { problem: 'Не выбрано оформление', tone: 'warn', required: 'Шаг 3 из 3 · выбрать статус', action: 'Открыть смену' };
    if (step === 'tk-settings') return { problem: 'Не заполнены условия ТК', tone: 'warn', required: 'Сохранить настройки ТК', action: 'Открыть смену' };
    if (!shift.exit) return { problem: 'Не отмечен уход', tone: 'bad', required: 'Охране указать время ухода', action: 'Открыть смену' };
    if (String(shift.status).includes('Расхождение')) return { problem: shift.status, tone: 'bad', required: 'Сверить начисление и выплату', action: 'Проверить смену' };
    return { problem: 'Ожидает проверки', tone: 'warn', required: 'Проверить время и начисление', action: 'Проверить смену' };
  }

  function onboardingControl(shift) {
    const step = stepOf(shift);
    if (step === 'rate') {
      return `<div class="inline-rate-editor onboarding-rate"><label><input type="number" min="1" step="1" value="${rateOf(shift) || ''}" data-onboarding-rate="${shift.id}" placeholder="Ставка"><span>₽/ч</span></label><button class="btn small primary" data-action="onboarding-rate" data-id="${shift.id}">Подтвердить</button></div>`;
    }
    if (step === 'position') {
      return `<div class="onboarding-inline-control"><select data-onboarding-position="${shift.id}">${options(KITCHEN_POSITIONS, shift.position)}</select><button class="btn small primary" data-action="onboarding-position" data-id="${shift.id}">Подтвердить</button></div>`;
    }
    if (step === 'employment') {
      return `<div class="onboarding-employment" role="group" aria-label="Статус оформления"><button class="btn small" data-action="onboarding-employment" data-id="${shift.id}" data-value="ТК">ТК</button><button class="btn small" data-action="onboarding-employment" data-id="${shift.id}" data-value="СЗ">СЗ</button><button class="btn small" data-action="onboarding-employment" data-id="${shift.id}" data-value="Наличные">Наличные</button></div>`;
    }
    if (step === 'tk-settings') {
      return `<button class="btn small primary onboarding-tk-button" data-action="open-tk-onboarding" data-id="${shift.id}">Настроить ТК</button>`;
    }
    return `<b>${money(rateOf(shift))}</b>`;
  }

  function personIssue(employee) {
    const step = personStep(employee);
    if (step === 'rate') return { problem: 'Новый сотрудник', required: 'Шаг 1 из 3 · указать ставку' };
    if (step === 'position') return { problem: 'Не подтверждена должность', required: 'Шаг 2 из 3 · выбрать должность' };
    if (step === 'employment') return { problem: 'Не выбрано оформление', required: 'Шаг 3 из 3 · выбрать статус' };
    return { problem: 'Не заполнены условия ТК', required: 'Сохранить настройки ТК' };
  }

  function personOnboardingControl(employee) {
    const step = personStep(employee);
    if (step === 'rate') {
      return `<div class="inline-rate-editor onboarding-rate"><label><input type="number" min="1" step="1" value="${Number(employee.rate) || ''}" data-person-onboarding-rate="${employee.id}" placeholder="Ставка"><span>₽/ч</span></label><button class="btn small primary" data-action="onboarding-person-rate" data-person-id="${employee.id}">Подтвердить</button></div>`;
    }
    if (step === 'position') {
      return `<div class="onboarding-inline-control"><select data-person-onboarding-position="${employee.id}">${options(KITCHEN_POSITIONS, employee.position)}</select><button class="btn small primary" data-action="onboarding-person-position" data-person-id="${employee.id}">Подтвердить</button></div>`;
    }
    if (step === 'employment') {
      return `<div class="onboarding-employment" role="group" aria-label="Статус оформления"><button class="btn small" data-action="onboarding-person-employment" data-person-id="${employee.id}" data-value="ТК">ТК</button><button class="btn small" data-action="onboarding-person-employment" data-person-id="${employee.id}" data-value="СЗ">СЗ</button><button class="btn small" data-action="onboarding-person-employment" data-person-id="${employee.id}" data-value="Наличные">Наличные</button></div>`;
    }
    return `<button class="btn small primary onboarding-tk-button" data-action="open-person-tk-onboarding" data-person-id="${employee.id}">Настроить ТК</button>`;
  }

  function personOnboardingRow(employee) {
    const issue = personIssue(employee);
    const registeredAt = employee.registeredAt || 'Сегодня';
    return `<tr data-person-onboarding-row="${employee.id}" class="person-onboarding-row">
      <td><button class="person-link" data-person="${employee.id}">${employee.name}</button><div class="subline">${employee.position || 'Должность не указана'}</div></td>
      <td><b>${registeredAt}</b><div class="subline">Карточка создана охраной</div></td>
      <td>${employee.registeredAtLocation || '—'}</td>
      <td>—</td>
      <td>${status(issue.problem, 'warn')}</td>
      <td><b class="attention-required">${issue.required}</b></td>
      <td><b>—</b></td>
      <td class="onboarding-control-cell">${personOnboardingControl(employee)}</td>
      <td><button class="btn small" data-person="${employee.id}">Карточка</button></td>
    </tr>`;
  }

  const hasErrorBeforeOnboarding = hasError;
  hasError = function (shift) {
    return !!stepOf(shift) || hasErrorBeforeOnboarding(shift);
  };

  window.errorsTable = function (rows) {
    if (!rows.length) return empty('Ошибок нет', 'Все сотрудники с закрытыми и проверенными сменами доступны в расчёте.');

    return `<div class="table-wrap attention-table-wrap"><table class="data-table compact inline-rate-table attention-table onboarding-table">
      <thead><tr>
        <th>Сотрудник</th>
        <th>Дата и время</th>
        <th>Площадка</th>
        <th>ООО</th>
        <th>Проблема</th>
        <th>Что требуется</th>
        <th>Начислено</th>
        <th>Оформление сотрудника</th>
        <th></th>
      </tr></thead>
      <tbody>${rows.map(row => {
        const personPending = needsPersonOnboarding(row.p);
        const personRow = personPending ? personOnboardingRow(row.p) : '';
        const shiftRows = row.errorShifts.filter(shift => !personPending || !stepOf(shift)).map(shift => {
        const issue = issueFor(shift);
        const workTime = shift.workStart && shift.workEnd ? `${shift.workStart}–${shift.workEnd}` : `${shift.entry || '—'}–${shift.exit || '…'}`;
        return `<tr data-onboarding-row="${shift.id}">
          <td><button class="person-link" data-person="${row.p.id}">${row.p.name}</button><div class="subline">${shift.position}</div></td>
          <td><b>${shift.date}</b><div class="subline">${workTime}${hours(shift) == null ? '' : ` · ${hours(shift).toLocaleString('ru-RU')} ч`}</div></td>
          <td>${shift.location}</td>
          <td>${shift.legalEntity}</td>
          <td>${status(issue.problem, issue.tone)}</td>
          <td><b class="attention-required">${issue.required}</b></td>
          <td><b>${money(accrued(shift))}</b></td>
          <td class="onboarding-control-cell">${onboardingControl(shift)}</td>
          <td><button class="btn small" data-shift="${shift.id}">${issue.action}</button></td>
        </tr>`;
        }).join('');
        return personRow + shiftRows;
      }).join('')}</tbody>
    </table></div>`;
  };

  const bindActionBeforeOnboarding = window.bindAction;
  window.bindAction = function (element) {
    const action = element.dataset.action;
    const personActions = ['onboarding-person-rate', 'onboarding-person-position', 'onboarding-person-employment', 'open-person-tk-onboarding'];
    if (!['onboarding-rate', 'onboarding-position', 'onboarding-employment', 'open-tk-onboarding', ...personActions].includes(action)) {
      bindActionBeforeOnboarding(element);
      return;
    }

    element.onclick = () => {
      if (personActions.includes(action)) {
        const employee = person(Number(element.dataset.personId));
        if (!employee) return;
        if (action === 'onboarding-person-rate') {
          const input = document.querySelector(`[data-person-onboarding-rate="${employee.id}"]`);
          const rate = Number(input?.value);
          if (!(rate > 0)) { toast('Введите ставку больше нуля'); input?.focus(); return; }
          employee.rate = rate;
          employee.rateConfirmed = false;
          markPersonPending(employee, 'position');
          state.audit.unshift({ at: new Date().toLocaleString('ru-RU'), actor: 'Бухгалтер', text: `${employee.name}: ставка ${money(rate)}/ч подтверждена, ожидается выбор должности` });
          save(); render(); toast('Ставка подтверждена · выберите должность'); return;
        }
        if (action === 'onboarding-person-position') {
          const position = document.querySelector(`[data-person-onboarding-position="${employee.id}"]`)?.value;
          if (!position) { toast('Выберите должность'); return; }
          employee.position = position;
          markPersonPending(employee, 'employment');
          state.audit.unshift({ at: new Date().toLocaleString('ru-RU'), actor: 'Бухгалтер', text: `${employee.name}: подтверждена должность ${position}, ожидается выбор оформления` });
          save(); render(); toast('Должность подтверждена · выберите оформление'); return;
        }
        if (action === 'onboarding-person-employment') {
          const engagement = element.dataset.value;
          if (engagement === 'ТК') { openPersonTkOnboarding(employee); return; }
          finishPersonSimpleOnboarding(employee, engagement);
          save(); render(); toast(`Сотрудник оформлен: ${engagement}`); return;
        }
        openPersonTkOnboarding(employee);
        return;
      }

      const shift = state.shifts.find(item => item.id === Number(element.dataset.id));
      if (!shift) return;
      const employee = employeeForShift(shift);

      if (action === 'onboarding-rate') {
        const input = document.querySelector(`[data-onboarding-rate="${shift.id}"]`);
        const rate = Number(input?.value);
        if (!(rate > 0)) {
          toast('Введите ставку больше нуля');
          input?.focus();
          return;
        }
        shift.rate = rate;
        shift.rateReview = false;
        employee.rate = rate;
        employee.rateConfirmed = false;
        markPending(shift, 'position');
        state.audit.unshift({ at: new Date().toLocaleString('ru-RU'), actor: 'Бухгалтер', text: `${employee.name}: ставка ${money(rate)}/ч подтверждена, ожидается выбор должности` });
        save();
        render();
        toast('Ставка подтверждена · выберите должность');
        return;
      }

      if (action === 'onboarding-position') {
        const select = document.querySelector(`[data-onboarding-position="${shift.id}"]`);
        const position = select?.value;
        if (!position) {
          toast('Выберите должность');
          return;
        }
        shift.position = position;
        employee.position = position;
        markPending(shift, 'employment');
        state.audit.unshift({ at: new Date().toLocaleString('ru-RU'), actor: 'Бухгалтер', text: `${employee.name}: подтверждена должность ${position}, ожидается выбор оформления` });
        save();
        render();
        toast('Должность подтверждена · выберите оформление');
        return;
      }

      if (action === 'onboarding-employment') {
        const engagement = element.dataset.value;
        if (engagement === 'ТК') {
          openTkOnboarding(shift);
          return;
        }
        finishSimpleOnboarding(shift, engagement);
        save();
        render();
        toast(`Сотрудник оформлен: ${engagement}`);
        return;
      }

      openTkOnboarding(shift);
    };
  };

  render();
})();
