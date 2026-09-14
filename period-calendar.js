(function () {
  const MONTHS = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
  ];
  const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toIso(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseIso(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function addDays(date, amount) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12, 0, 0, 0);
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12, 0, 0, 0);
  }

  function weekStart(date) {
    return addDays(date, -((date.getDay() + 6) % 7));
  }

  function monthEnd(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12, 0, 0, 0);
  }

  function formatDate(value) {
    if (!value) return 'Выберите дату';
    return parseIso(value).toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric'
    }).replace(' г.', '');
  }

  function calendarCells(month, year) {
    const first = new Date(year, month, 1, 12, 0, 0, 0);
    const offset = (first.getDay() + 6) % 7;
    const visibleStart = addDays(first, -offset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(visibleStart, index);
      return {
        date,
        iso: toIso(date),
        current: date.getMonth() === month,
        weekday: index % 7
      };
    });
  }

  function datesBetween(from, to) {
    if (!from || !to) return [];
    const result = [];
    let cursor = parseIso(from);
    const finish = parseIso(to);
    while (cursor <= finish) {
      result.push(toIso(cursor));
      cursor = addDays(cursor, 1);
    }
    return result;
  }

  function toRu(value) {
    if (!value) return '';
    const date = parseIso(value);
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
  }

  function inputDate(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value;
    const match = String(value || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!match) return '';
    const candidate = `${match[3]}-${pad(match[2])}-${pad(match[1])}`;
    const parsed = parseIso(candidate);
    return toIso(parsed) === candidate ? candidate : '';
  }

  let datePopover = null;

  function closeDatePopover() {
    if (datePopover) datePopover.remove();
    datePopover = null;
  }

  function openDatePopover(input) {
    closeDatePopover();
    const selected = inputDate(input.value);
    const initial = selected ? parseIso(selected) : new Date();
    let visible = new Date(initial.getFullYear(), initial.getMonth(), 1, 12, 0, 0, 0);
    const label = [...input.closest('.field').childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent.trim()).find(Boolean) || 'Дата';

    const popover = document.createElement('section');
    popover.className = 'plum-date-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', `Календарь: ${label}`);
    popover.onclick = event => event.stopPropagation();
    document.body.appendChild(popover);
    datePopover = popover;

    function place() {
      const fieldRect = input.getBoundingClientRect();
      const popupRect = popover.getBoundingClientRect();
      const gap = 8;
      let top = fieldRect.bottom + gap;
      if (top + popupRect.height > window.innerHeight - 10) top = fieldRect.top - popupRect.height - gap;
      top = Math.max(10, Math.min(top, window.innerHeight - popupRect.height - 10));
      const left = Math.max(10, Math.min(fieldRect.left, window.innerWidth - popupRect.width - 10));
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    }

    function choose(iso) {
      input.value = toRu(iso);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.focus();
      closeDatePopover();
    }

    function draw() {
      const active = inputDate(input.value);
      const cells = calendarCells(visible.getMonth(), visible.getFullYear());
      const currentYear = visible.getFullYear();
      const years = Array.from({ length: 25 }, (_, index) => currentYear - 12 + index);
      const todayIso = toIso(new Date());

      popover.innerHTML = `
        <div class="plum-popover-head">
          <span><small>${label}</small><b>${active ? toRu(active) : 'Выберите дату'}</b></span>
          <button type="button" class="icon-btn" data-close-date aria-label="Закрыть календарь">×</button>
        </div>
        <div class="plum-calendar">
          <div class="plum-calendar-nav">
            <div class="plum-month-nav">
              <button type="button" class="plum-round-btn" data-popover-month-step="-1" aria-label="Предыдущий месяц">‹</button>
              <label class="plum-select-wrap" aria-label="Месяц">
                <select data-popover-month>${MONTHS.map((name, index) => `<option value="${index}" ${index === visible.getMonth() ? 'selected' : ''}>${name[0].toUpperCase() + name.slice(1)}</option>`).join('')}</select>
              </label>
              <button type="button" class="plum-round-btn" data-popover-month-step="1" aria-label="Следующий месяц">›</button>
            </div>
            <label class="plum-select-wrap plum-year-select" aria-label="Год">
              <select data-popover-year>${years.map(year => `<option value="${year}" ${year === visible.getFullYear() ? 'selected' : ''}>${year}</option>`).join('')}</select>
            </label>
          </div>
          <div class="plum-weekdays">${WEEKDAYS.map((day, index) => `<span class="${index >= 5 ? 'weekend' : ''}">${day}</span>`).join('')}</div>
          <div class="plum-days">${cells.map(cell => {
            const classes = ['plum-day'];
            if (!cell.current) classes.push('outside');
            if (cell.weekday >= 5) classes.push('weekend');
            if (cell.iso === todayIso) classes.push('today');
            if (cell.iso === active) classes.push('selected', 'range-start', 'range-end');
            return `<button type="button" class="${classes.join(' ')}" data-popover-day="${cell.iso}" aria-label="${formatDate(cell.iso)}" aria-pressed="${cell.iso === active}">${cell.date.getDate()}</button>`;
          }).join('')}</div>
          <div class="plum-date-quick-actions">
            <button type="button" class="plum-date-link" data-clear-date>Очистить</button>
            <button type="button" class="plum-date-link" data-today-date>Сегодня</button>
          </div>
        </div>`;

      popover.querySelector('[data-close-date]').onclick = closeDatePopover;
      popover.querySelectorAll('[data-popover-month-step]').forEach(button => button.onclick = () => {
        visible = addMonths(visible, Number(button.dataset.popoverMonthStep));
        draw();
      });
      popover.querySelector('[data-popover-month]').onchange = event => {
        visible = new Date(visible.getFullYear(), Number(event.target.value), 1, 12);
        draw();
      };
      popover.querySelector('[data-popover-year]').onchange = event => {
        visible = new Date(Number(event.target.value), visible.getMonth(), 1, 12);
        draw();
      };
      popover.querySelectorAll('[data-popover-day]').forEach(button => button.onclick = () => choose(button.dataset.popoverDay));
      popover.querySelector('[data-today-date]').onclick = () => choose(todayIso);
      popover.querySelector('[data-clear-date]').onclick = () => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        closeDatePopover();
      };
      place();
    }

    draw();
  }

  function openPeriodCalendar() {
    const modal = document.querySelector('#modal');
    const backdrop = document.querySelector('#modal-backdrop');
    let rangeStart = currentPeriodFrom || '';
    let rangeEnd = currentPeriodTo || '';
    const initial = rangeStart ? parseIso(rangeStart) : new Date();
    let visible = new Date(initial.getFullYear(), initial.getMonth(), 1, 12, 0, 0, 0);

    modal.classList.add('period-calendar-modal');
    backdrop.classList.remove('hidden');
    modal.classList.remove('hidden');

    function setRange(from, to) {
      rangeStart = toIso(from);
      rangeEnd = toIso(to);
      visible = new Date(from.getFullYear(), from.getMonth(), 1, 12, 0, 0, 0);
      draw();
    }

    function moveWeek(direction) {
      const reference = rangeStart ? parseIso(direction < 0 ? rangeStart : (rangeEnd || rangeStart)) : new Date();
      const start = addDays(weekStart(reference), direction * 7);
      setRange(start, addDays(start, 6));
    }

    function moveSelectedMonth(direction) {
      const reference = rangeStart ? parseIso(direction < 0 ? rangeStart : (rangeEnd || rangeStart)) : new Date();
      const start = addMonths(new Date(reference.getFullYear(), reference.getMonth(), 1, 12), direction);
      setRange(start, monthEnd(start));
    }

    function closeCalendar() {
      modal.classList.remove('period-calendar-modal');
      backdrop.onclick = closeModal;
      closeModal();
    }

    function dayMarkup(cell, selected) {
      const today = toIso(new Date());
      const isSelected = selected.has(cell.iso);
      const previousSelected = selected.has(toIso(addDays(cell.date, -1)));
      const nextSelected = selected.has(toIso(addDays(cell.date, 1)));
      const classes = ['plum-day'];
      if (!cell.current) classes.push('outside');
      if (cell.weekday >= 5) classes.push('weekend');
      if (cell.iso === today) classes.push('today');
      if (isSelected) classes.push('selected');
      if (cell.iso === rangeStart) classes.push('range-start');
      if (cell.iso === rangeEnd) classes.push('range-end');
      if (isSelected && previousSelected && cell.weekday !== 0) classes.push('join-left');
      if (isSelected && nextSelected && cell.weekday !== 6) classes.push('join-right');
      return `<button type="button" class="${classes.join(' ')}" data-calendar-day="${cell.iso}" aria-label="${formatDate(cell.iso)}" aria-pressed="${isSelected}">${cell.date.getDate()}</button>`;
    }

    function draw() {
      const cells = calendarCells(visible.getMonth(), visible.getFullYear());
      const selected = new Set(datesBetween(rangeStart, rangeEnd || rangeStart));
      const currentWeek = rangeStart && rangeEnd && datesBetween(rangeStart, rangeEnd).length === 7 &&
        toIso(weekStart(parseIso(rangeStart))) === rangeStart;
      const currentMonth = rangeStart && rangeEnd && parseIso(rangeStart).getDate() === 1 &&
        rangeEnd === toIso(monthEnd(parseIso(rangeStart)));
      const years = Array.from({ length: 21 }, (_, index) => new Date().getFullYear() - 10 + index);

      modal.innerHTML = `
        <div class="modal-head plum-modal-head">
          <div>
            <h2>Выбрать расчётный период</h2>
            <span class="demo-badge">${modeLabel()}</span>
          </div>
          <button class="icon-btn" type="button" data-close-calendar aria-label="Закрыть">×</button>
        </div>

        <div class="period-range-summary" aria-live="polite">
          <div class="period-range-date ${rangeStart ? 'filled' : ''}">
            <span>Начало периода</span><b>${formatDate(rangeStart)}</b>
          </div>
          <span class="period-range-arrow">→</span>
          <div class="period-range-date ${rangeEnd ? 'filled' : ''}">
            <span>Конец периода</span><b>${formatDate(rangeEnd)}</b>
          </div>
        </div>

        <div class="plum-calendar">
          <div class="plum-calendar-nav">
            <div class="plum-month-nav">
              <button type="button" class="plum-round-btn" data-view-month="-1" aria-label="Предыдущий месяц">‹</button>
              <label class="plum-select-wrap" aria-label="Месяц">
                <select data-calendar-month>${MONTHS.map((name, index) => `<option value="${index}" ${index === visible.getMonth() ? 'selected' : ''}>${name[0].toUpperCase() + name.slice(1)}</option>`).join('')}</select>
              </label>
              <button type="button" class="plum-round-btn" data-view-month="1" aria-label="Следующий месяц">›</button>
            </div>
            <label class="plum-select-wrap plum-year-select" aria-label="Год">
              <select data-calendar-year>${years.map(year => `<option value="${year}" ${year === visible.getFullYear() ? 'selected' : ''}>${year}</option>`).join('')}</select>
            </label>
          </div>

          <div class="plum-weekdays">${WEEKDAYS.map((day, index) => `<span class="${index >= 5 ? 'weekend' : ''}">${day}</span>`).join('')}</div>
          <div class="plum-days">${cells.map(cell => dayMarkup(cell, selected)).join('')}</div>

          <div class="plum-shifter">
            <div class="plum-shifter-row">
              <button type="button" class="plum-round-btn" data-shift-week="-1" aria-label="Предыдущая неделя">‹</button>
              <button type="button" class="plum-wide-btn ${currentWeek ? 'active' : ''}" data-current-week>Неделя</button>
              <button type="button" class="plum-round-btn" data-shift-week="1" aria-label="Следующая неделя">›</button>
            </div>
            <div class="plum-shifter-row with-clear">
              <button type="button" class="plum-round-btn" data-shift-month="-1" aria-label="Предыдущий месяц">‹</button>
              <button type="button" class="plum-wide-btn ${currentMonth ? 'active' : ''}" data-current-month>Месяц</button>
              <button type="button" class="plum-round-btn" data-shift-month="1" aria-label="Следующий месяц">›</button>
              <button type="button" class="plum-round-btn plum-clear" data-clear-range aria-label="Очистить выбор" title="Очистить">⌁</button>
            </div>
          </div>
        </div>

        <div class="period-calendar-hint">${rangeStart && !rangeEnd ? 'Теперь выберите дату окончания периода.' : 'Выберите первый и последний день. Можно быстро выбрать неделю или месяц.'}</div>
        <div class="modal-actions period-calendar-actions">
          <button class="btn" type="button" data-close-calendar>Отмена</button>
          <button class="btn primary" type="button" data-apply-range ${!rangeStart || !rangeEnd ? 'disabled' : ''}>Применить</button>
        </div>`;

      modal.querySelectorAll('[data-close-calendar]').forEach(button => button.onclick = closeCalendar);
      modal.querySelectorAll('[data-view-month]').forEach(button => button.onclick = () => {
        visible = addMonths(visible, Number(button.dataset.viewMonth));
        draw();
      });
      modal.querySelector('[data-calendar-month]').onchange = event => {
        visible = new Date(visible.getFullYear(), Number(event.target.value), 1, 12);
        draw();
      };
      modal.querySelector('[data-calendar-year]').onchange = event => {
        visible = new Date(Number(event.target.value), visible.getMonth(), 1, 12);
        draw();
      };
      modal.querySelectorAll('[data-calendar-day]').forEach(button => button.onclick = () => {
        const picked = button.dataset.calendarDay;
        if (!rangeStart || rangeEnd) {
          rangeStart = picked;
          rangeEnd = '';
        } else if (picked < rangeStart) {
          rangeEnd = rangeStart;
          rangeStart = picked;
        } else {
          rangeEnd = picked;
        }
        draw();
      });
      modal.querySelector('[data-current-week]').onclick = () => {
        const start = weekStart(new Date());
        setRange(start, addDays(start, 6));
      };
      modal.querySelectorAll('[data-shift-week]').forEach(button => button.onclick = () => moveWeek(Number(button.dataset.shiftWeek)));
      modal.querySelector('[data-current-month]').onclick = () => setRange(visible, monthEnd(visible));
      modal.querySelectorAll('[data-shift-month]').forEach(button => button.onclick = () => moveSelectedMonth(Number(button.dataset.shiftMonth)));
      modal.querySelector('[data-clear-range]').onclick = () => {
        rangeStart = '';
        rangeEnd = '';
        draw();
      };
      const applyButton = modal.querySelector('[data-apply-range]');
      if (applyButton) applyButton.onclick = () => {
        currentPeriodFrom = rangeStart;
        currentPeriodTo = rangeEnd;
        currentPeriod = calcPeriodLabel(rangeStart, rangeEnd);
        closeCalendar();
        save();
        render();
        toast('Расчётный период выбран');
      };
    }

    backdrop.onclick = closeCalendar;
    draw();
  }

  const bindActionBeforePeriodCalendar = window.bindAction;
  window.bindAction = function (element) {
    if (element.dataset.action !== 'choose-calc-period') {
      bindActionBeforePeriodCalendar(element);
      return;
    }
    element.onclick = openPeriodCalendar;
  };

  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-date-picker], [data-plum-date]');
    if (opener) {
      const input = opener.matches('[data-plum-date]') ? opener : opener.closest('.plum-date-field')?.querySelector('[data-plum-date]');
      if (input) {
        event.preventDefault();
        openDatePopover(input);
      }
      return;
    }
    if (datePopover && !datePopover.contains(event.target)) closeDatePopover();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && datePopover) {
      event.stopPropagation();
      closeDatePopover();
    }
  });

  window.addEventListener('resize', closeDatePopover);

  render();
})();
