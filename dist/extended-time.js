/* Calendar dates + ordinary 24-hour time for overnight shifts. */
(function () {
  const hoursBeforeDatedShifts = hours;
  const renderBeforeDatedShifts = render;

  function parseRuDate(value) {
    const match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
    if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(match[3]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[1])) return null;
    return date;
  }

  function formatRuDate(date) {
    return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`;
  }

  function addDays(value, count) {
    const date = parseRuDate(value);
    if (!date) return value;
    date.setUTCDate(date.getUTCDate() + count);
    return formatRuDate(date);
  }

  function dayNumber(value) {
    const date = parseRuDate(value);
    return date ? Math.floor(date.getTime() / 86400000) : null;
  }

  function dateTimeMinutes(date, time) {
    const day = dayNumber(date);
    const clock = minutes(time);
    return day == null || clock == null ? null : day * 1440 + clock;
  }

  function durationMinutes(entryDate, entryTime, exitDate, exitTime) {
    const start = dateTimeMinutes(entryDate, entryTime);
    const end = dateTimeMinutes(exitDate, exitTime);
    return start == null || end == null ? null : end - start;
  }

  function nowTime() {
    const date = new Date();
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function roundedClock(value) {
    const rounded = Math.round(minutes(value) / 30) * 30;
    return {
      time: `${String(Math.floor((rounded % 1440) / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`,
      dayOffset: Math.floor(rounded / 1440)
    };
  }

  function dateField(label, name, value, full = false) {
    return `<label class="field plum-date-field ${full ? 'full' : ''}">${label}
      <input data-field="${name}" type="text" value="${value}" data-plum-date data-date-format="ru" inputmode="numeric" placeholder="ДД.ММ.ГГГГ" autocomplete="off">
      <button type="button" class="date-picker-trigger" data-date-picker aria-label="Выбрать дату: ${label}" title="Открыть календарь"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg></button>
    </label>`;
  }

  function timeField(label, name, value) {
    return `<label class="field">${label}<input data-field="${name}" type="time" value="${value}" step="60"></label>`;
  }

  function dateTimeBlock(prefix, title, date, time, editable = true) {
    if (!editable) {
      return `<section class="shift-datetime-summary full">
        <span class="shift-datetime-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3v4M17 3v4M3 10h18"/><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M12 13v4l3 2"/></svg></span>
        <span><small>${title}</small><b>${date}, ${time}</b></span>
      </section>`;
    }
    return `<section class="shift-datetime-group full">
      <div class="shift-datetime-title"><b>${title}</b><span>${prefix === 'entry' ? 'Начало смены' : 'Окончание смены'}</span></div>
      <div class="shift-datetime-inputs">
        ${dateField('Дата', `${prefix}Date`, date)}
        ${timeField('Время', `${prefix}Time`, time)}
      </div>
    </section>`;
  }

  function legacyExitPoint(shift) {
    if (!shift.exit) return { date: today(), time: nowTime() };
    const parts = String(shift.exit).split(':').map(Number);
    if (parts[0] >= 24) {
      return {
        date: addDays(shift.date, Math.floor(parts[0] / 24)),
        time: `${String(parts[0] % 24).padStart(2, '0')}:${String(parts[1] || 0).padStart(2, '0')}`
      };
    }
    const inferredNextDay = minutes(shift.exit) < minutes(shift.entry);
    return { date: shift.exitDate || addDays(shift.date, inferredNextDay ? 1 : 0), time: shift.exit };
  }

  function defaultExitPoint(shift) {
    if (shift.exit) return legacyExitPoint(shift);
    const todayValue = today();
    const exitDate = dayNumber(todayValue) >= dayNumber(shift.date) ? todayValue : shift.date;
    return { date: exitDate, time: nowTime() };
  }

  function applyRoundedTimes(shift) {
    const start = roundedClock(shift.entry);
    const end = roundedClock(shift.exit);
    shift.workStart = start.time;
    shift.workEnd = end.time;
    shift.workStartDate = addDays(shift.date, start.dayOffset);
    shift.workEndDate = addDays(shift.exitDate, end.dayOffset);
  }

  function validateInterval(entryDate, entryTime, exitDate, exitTime) {
    if (!parseRuDate(entryDate) || !parseRuDate(exitDate) || minutes(entryTime) == null || minutes(exitTime) == null) {
      toast('Заполните даты и время прихода и ухода');
      return null;
    }
    const duration = durationMinutes(entryDate, entryTime, exitDate, exitTime);
    if (!(duration > 0)) {
      toast('Уход должен быть позже прихода');
      return null;
    }
    return duration;
  }

  function durationText(value) {
    const totalMinutes = Math.round(value);
    const days = Math.floor(totalMinutes / 1440);
    const remainder = totalMinutes % 1440;
    const hoursValue = Math.floor(remainder / 60);
    const minuteValue = remainder % 60;
    const clock = `${hoursValue} ч${minuteValue ? ` ${minuteValue} мин` : ''}`;
    return days ? `${days} дн. ${clock}` : clock;
  }

  function bindIntervalControls(modal, initialEntryDate) {
    const entryDate = modal.querySelector('[data-field="entryDate"]');
    const entryTime = modal.querySelector('[data-field="entryTime"]');
    const exitDate = modal.querySelector('[data-field="exitDate"]');
    const exitTime = modal.querySelector('[data-field="exitTime"]');
    const output = modal.querySelector('[data-shift-duration]');
    const warning = modal.querySelector('[data-shift-duration-warning]');

    const values = () => ({
      entryDate: entryDate?.value || initialEntryDate,
      entryTime: entryTime?.value || modal.dataset.entryTime,
      exitDate: exitDate?.value,
      exitTime: exitTime?.value
    });
    const update = () => {
      const value = values();
      const duration = durationMinutes(value.entryDate, value.entryTime, value.exitDate, value.exitTime);
      const invalid = duration == null || duration <= 0;
      output.classList.toggle('invalid', invalid);
      output.innerHTML = invalid
        ? '<span>Проверьте дату и время ухода</span><b>Уход должен быть позже прихода</b>'
        : `<span>Продолжительность смены</span><b>${durationText(duration)}</b>`;
      warning.classList.toggle('hidden', invalid || duration <= 1440);
    };

    modal.dataset.entryTime = entryTime?.value || modal.dataset.entryTime;
    [entryDate, entryTime, exitDate, exitTime].filter(Boolean).forEach(input => {
      input.addEventListener('input', update);
      input.addEventListener('change', update);
    });
    modal.querySelectorAll('[data-exit-day]').forEach(button => {
      button.onclick = () => {
        const baseDate = entryDate?.value || initialEntryDate;
        exitDate.value = addDays(baseDate, Number(button.dataset.exitDay));
        exitDate.dispatchEvent(new Event('input', { bubbles: true }));
      };
    });
    update();
  }

  function intervalFooter() {
    return `<div class="shift-day-presets full" role="group" aria-label="Быстрый выбор даты ухода">
        <span>Дата ухода:</span>
        <button type="button" class="btn small" data-exit-day="0">В тот же день</button>
        <button type="button" class="btn small" data-exit-day="1">На следующий день</button>
      </div>
      <div class="shift-duration-card full" data-shift-duration></div>
      <div class="shift-duration-warning full hidden" data-shift-duration-warning>Смена длиннее 24 часов. Проверьте даты перед сохранением.</div>`;
  }

  function openEndShiftModal(shift) {
    const exitPoint = defaultExitPoint(shift);
    openModal(
      'Отметить уход',
      field('Сотрудник', 'display', person(shift.personId).name) +
        dateTimeBlock('entry', 'Приход', shift.date, shift.entry, false) +
        dateTimeBlock('exit', 'Уход', exitPoint.date, exitPoint.time) +
        intervalFooter(),
      'Закрыть смену',
      data => {
        const duration = validateInterval(shift.date, shift.entry, data.exitDate, data.exitTime);
        if (duration == null) return false;
        shift.exitDate = data.exitDate;
        shift.exit = data.exitTime;
        applyRoundedTimes(shift);
        shift.status = shift.type === 'Вызывной' ? 'Ожидает ставку шефа' : shift.rateReview ? 'Требует проверки ставки' : rateOf(shift) ? 'Готово' : 'Нет ставки';
        state.audit.unshift({
          at: `${shift.exitDate} ${shift.exit}`,
          actor: 'Охрана',
          text: `Закрыта смена ${person(shift.personId).name}: ${shift.date} ${shift.entry} — ${shift.exitDate} ${shift.exit}; ${durationText(duration)}`
        });
      }
    );
    const modal = document.querySelector('#modal');
    modal.classList.add('shift-datetime-modal');
    modal.dataset.entryTime = shift.entry;
    bindIntervalControls(modal, shift.date);
  }

  function openCorrectionModal(shift) {
    const exitPoint = legacyExitPoint(shift);
    openModal(
      'Исправить вход и выход',
      dateTimeBlock('entry', 'Приход', shift.date, shift.entry) +
        dateTimeBlock('exit', 'Уход', exitPoint.date, exitPoint.time) +
        intervalFooter() +
        field('Причина исправления', 'reason', shift.correctionReason || '', 'text', true),
      'Сохранить исправление',
      data => {
        const duration = validateInterval(data.entryDate, data.entryTime, data.exitDate, data.exitTime);
        if (duration == null) return false;
        if (!data.reason.trim()) {
          toast('Укажите причину исправления');
          return false;
        }
        shift.date = data.entryDate;
        shift.entry = data.entryTime;
        shift.exitDate = data.exitDate;
        shift.exit = data.exitTime;
        applyRoundedTimes(shift);
        shift.correctionRequested = false;
        shift.correctionReason = '';
        shift.correctionRequestedAt = '';
        reconcileShift(shift);
        state.audit.unshift({
          at: new Date().toLocaleString('ru-RU'),
          actor: `Охрана · ${shift.location}`,
          text: `Исправлена смена ${person(shift.personId).name}: ${shift.date} ${shift.entry} — ${shift.exitDate} ${shift.exit}; ${durationText(duration)}; причина: ${data.reason}`
        });
      }
    );
    const modal = document.querySelector('#modal');
    modal.classList.add('shift-datetime-modal', 'shift-correction-modal');
    bindIntervalControls(modal, shift.date);
  }

  hours = function (shift) {
    if (!shift.workStart || !shift.workEnd) return null;
    const startDate = shift.workStartDate || shift.date;
    const endDate = shift.workEndDate || shift.exitDate;
    if (startDate && endDate) {
      const total = durationMinutes(startDate, shift.workStart, endDate, shift.workEnd);
      return total >= 0 ? total / 60 : null;
    }
    return hoursBeforeDatedShifts(shift);
  };

  window.shiftIntervalText = function (shift, short = false) {
    const exitPoint = legacyExitPoint(shift);
    if (!shift.exit) return `${shift.date}, ${shift.entry} — смена открыта`;
    if (short && exitPoint.date === shift.date) return `${shift.date} · ${shift.entry}–${exitPoint.time}`;
    return `${shift.date}, ${shift.entry} → ${exitPoint.date}, ${exitPoint.time}`;
  };

  window.shiftTimeRangeText = function (shift) {
    const exitPoint = legacyExitPoint(shift);
    if (!shift.exit) return `${shift.entry} — смена открыта`;
    return exitPoint.date === shift.date
      ? `${shift.entry}–${exitPoint.time}`
      : `${shift.entry} → ${exitPoint.date}, ${exitPoint.time}`;
  };

  function decorateRenderedIntervals() {
    document.querySelectorAll('.security-recent-row [data-action="correct-shift"]').forEach(button => {
      const shift = state.shifts.find(item => item.id === Number(button.dataset.id));
      const label = button.closest('.security-recent-row')?.querySelector('small');
      if (shift && label) label.textContent = window.shiftIntervalText(shift, true);
    });
    document.querySelectorAll('.security-open-card [data-action="end-shift"]').forEach(button => {
      const shift = state.shifts.find(item => item.id === Number(button.dataset.id));
      const label = button.closest('.security-open-card')?.querySelector('small');
      if (shift && label) label.textContent = `${shift.position} · приход ${shift.date}, ${shift.entry}`;
    });
    document.querySelectorAll('.security-history-row [data-action="correct-shift"]').forEach(button => {
      const shift = state.shifts.find(item => item.id === Number(button.dataset.id));
      const label = button.closest('.security-history-row')?.querySelector('.security-history-time b');
      if (shift && label) label.textContent = window.shiftTimeRangeText(shift);
    });
  }

  const bindActionBeforeDatedShifts = bindAction;
  bindAction = function (element) {
    const action = element.dataset.action;
    if (!['end-shift', 'correct-shift'].includes(action)) {
      bindActionBeforeDatedShifts(element);
      return;
    }
    element.onclick = () => {
      const shift = state.shifts.find(item => item.id === Number(element.dataset.id));
      if (!shift) return;
      if (action === 'correct-shift' && currentRole === 'Охрана' && shift.location !== currentSecurityLocation) {
        toast('Охрана может исправлять время только на своей площадке');
        return;
      }
      if (action === 'correct-shift' && document.querySelector('#drawer').classList.contains('security-person-drawer')) closeDrawer();
      if (action === 'end-shift') openEndShiftModal(shift);
      else openCorrectionModal(shift);
    };
  };

  render = function () {
    renderBeforeDatedShifts();
    decorateRenderedIntervals();
  };

  render();
})();
