(function () {
  const COUNTRY_CODES = 'RU BY KZ KG TJ UZ AM AZ MD TM GE UA RS TR AF AL DZ AD AO AG AR AU AT BH BD BB BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CR HR CU CY CZ CD DK DJ DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT CI JM JP JO KE KI KP KR KW LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RW KN LC VC WS SM ST SA SN SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TZ TH TL TG TO TT TN AE GB US UY VA VE VN YE ZM ZW'.split(' ');
  const REGION_NAMES = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['ru'], { type: 'region' }) : null;
  const COUNTRIES = COUNTRY_CODES.map(code => REGION_NAMES ? REGION_NAMES.of(code) : code).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru'));
  const DOCUMENT_EXAMPLES = {
    'Россия': '45 08 123456',
    'Беларусь': 'AB1234567',
    'Казахстан': 'N12345678',
    'Кыргызстан': 'ID1234567',
    'Киргизия': 'ID1234567',
    'Таджикистан': 'A12345678',
    'Узбекистан': 'AA1234567',
    'Армения': 'AN1234567',
    'Азербайджан': 'C01234567',
    'Молдова': 'B1234567',
    'Туркменистан': 'A12345678',
    'Грузия': '12AB34567',
    'Украина': 'AA123456'
  };

  function escapeIdentity(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  const COMMON_FIRST_NAMES = new Set(['иван', 'анна', 'дмитрий', 'елена', 'сергей', 'михаил', 'лев', 'татьяна', 'александр', 'алексей', 'мария', 'наталья', 'ольга']);

  function splitIdentityName(values = {}) {
    if (values.lastName != null || values.firstName != null || values.middleName != null) {
      return {
        lastName: String(values.lastName || '').trim(),
        firstName: String(values.firstName || '').trim(),
        middleName: String(values.middleName || '').trim(),
        noMiddleName: !!values.noMiddleName
      };
    }
    const parts = String(values.name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 3) return { lastName: parts[0], firstName: parts[1], middleName: parts.slice(2).join(' '), noMiddleName: false };
    if (parts.length === 2 && COMMON_FIRST_NAMES.has(parts[0].toLocaleLowerCase('ru-RU'))) return { lastName: parts[1], firstName: parts[0], middleName: '', noMiddleName: false };
    return { lastName: parts[0] || '', firstName: parts[1] || '', middleName: '', noMiddleName: false };
  }

  function composeIdentityName(values = {}) {
    return [values.lastName, values.firstName, values.middleName].map(value => String(value || '').trim()).filter(Boolean).join(' ');
  }

  function countryOptions(selected) {
    const current = selected || 'Россия';
    const countries = COUNTRIES.includes(current) ? COUNTRIES : [current, ...COUNTRIES];
    return countries.map(country => `<option value="${escapeIdentity(country)}"></option>`).join('');
  }

  function canonicalCountry(value) {
    const normalized = String(value || '').trim().toLocaleLowerCase('ru-RU');
    return COUNTRIES.find(country => country.toLocaleLowerCase('ru-RU') === normalized) || '';
  }

  function documentExample(country) {
    const resolved = canonicalCountry(country) || country;
    return DOCUMENT_EXAMPLES[resolved] || 'Например: серия и номер без лишнего текста';
  }

  function normalizeDocument(value) {
    return String(value || '').toLocaleUpperCase('ru-RU').replace(/[^0-9A-ZА-ЯЁ]/g, '').replace(/Ё/g, 'Е');
  }

  function normalizeBirthDate(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isoToRu(raw);
    return raw;
  }

  function phoneDigits(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    if (digits && !digits.startsWith('7')) digits = `7${digits}`;
    return digits.slice(0, 11);
  }

  function formatRussianPhone(value, keepPrefix = true) {
    const digits = phoneDigits(value);
    const local = digits.startsWith('7') ? digits.slice(1) : digits;
    if (!local && !keepPrefix) return '';
    let result = '+7 (';
    result += local.slice(0, 3);
    if (local.length >= 3) result += ') ';
    result += local.slice(3, 6);
    if (local.length > 6) result += `-${local.slice(6, 8)}`;
    if (local.length > 8) result += `-${local.slice(8, 10)}`;
    return result;
  }

  function validBirthDate(value) {
    const match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return false;
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
    return date.getFullYear() === Number(match[3]) &&
      date.getMonth() === Number(match[2]) - 1 &&
      date.getDate() === Number(match[1]) &&
      Number(match[3]) >= 1900 && date <= new Date();
  }

  function ensureIdentityState() {
    state.personIdentityHistory = state.personIdentityHistory || [];
    state.people.forEach(personRecord => {
      if (personRecord.scudRegistered == null) personRecord.scudRegistered = false;
      if (personRecord.birthDate == null) personRecord.birthDate = '';
    });
  }

  function exactDocumentDuplicate(country, passport, excludeId = null) {
    const normalized = normalizeDocument(passport);
    if (!country || normalized.length < 5) return null;
    return state.people.find(personRecord => personRecord.id !== excludeId && personRecord.citizenship === country && normalizeDocument(personRecord.passport) === normalized) || null;
  }

  function probableDuplicate(values, excludeId = null) {
    const name = normalizedPersonName(values.name);
    const phone = normalizedPhone(values.phone);
    const birthDate = normalizeBirthDate(values.birthDate);
    return state.people.find(personRecord => {
      if (personRecord.id === excludeId) return false;
      const sameName = name && normalizedPersonName(personRecord.name) === name;
      const samePhone = phone.length >= 10 && normalizedPhone(personRecord.phone) === phone;
      const sameBirthDate = birthDate && normalizeBirthDate(personRecord.birthDate) === birthDate;
      return (sameName && sameBirthDate) || (sameName && samePhone) || (samePhone && sameBirthDate);
    }) || null;
  }

  function identityActor() {
    return currentRole === 'Охрана' ? `Охрана · ${currentSecurityLocation}` : currentRole || 'Бухгалтер';
  }

  function addIdentityHistory(personRecord, title, changes, actor = identityActor()) {
    ensureIdentityState();
    const entry = {
      id: nextId(),
      personId: personRecord.id,
      personName: personRecord.name,
      at: new Date().toLocaleString('ru-RU'),
      actor,
      title,
      changes
    };
    state.personIdentityHistory.unshift(entry);
    state.audit.unshift({ at: entry.at, actor, text: `${personRecord.name}: ${title.toLowerCase()} · ${changes.join('; ')}` });
  }

  function identityFields(values = {}) {
    const country = values.citizenship || 'Россия';
    const nameParts = splitIdentityName(values);
    return field('Фамилия', 'lastName', nameParts.lastName) +
      field('Имя', 'firstName', nameParts.firstName) +
      `<div class="field identity-middle-name-field"><div class="identity-field-head"><label for="identity-middle-name">Отчество</label><label class="identity-no-middle"><input data-field="noMiddleName" data-no-middle-name type="checkbox" ${nameParts.noMiddleName ? 'checked' : ''}><span>Нет отчества</span></label></div><input id="identity-middle-name" data-field="middleName" value="${escapeIdentity(nameParts.middleName)}" autocomplete="off" ${nameParts.noMiddleName ? 'disabled placeholder="Отчество отсутствует"' : 'placeholder="Введите отчество"'}><small class="identity-required-hint" data-middle-name-hint>Введите отчество или отметьте «Нет отчества»</small></div>` +
      `<label class="field identity-phone-field">Телефон<input data-field="phone" data-identity-phone value="${escapeIdentity(formatRussianPhone(values.phone || '', true))}" inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__" maxlength="18"><small>Формат: +7 (999) 999-99-99</small></label>` +
      field('Дата рождения', 'birthDate', values.birthDate || '', 'date') +
      `<label class="field identity-country-field">Гражданство<input data-field="citizenship" data-identity-country value="${escapeIdentity(country)}" list="identity-country-options" placeholder="Начните вводить страну" autocomplete="off"><datalist id="identity-country-options">${countryOptions(country)}</datalist></label>` +
      `<label class="field full identity-document-field">Серия и номер документа<input data-field="passport" data-identity-document value="${escapeIdentity(values.passport || '')}" placeholder="${escapeIdentity(documentExample(country))}" autocomplete="off"></label>` +
      selectField('Должность', 'position', options(KITCHEN_POSITIONS, values.position || KITCHEN_POSITIONS[0]), true) +
      `<div class="identity-check-grid full"><label class="check-field"><input data-field="patent" type="checkbox" ${values.patent ? 'checked' : ''}><span><b>Патент есть</b><small>Необязательное поле</small></span></label><label class="check-field"><input data-field="scudRegistered" type="checkbox" ${values.scudRegistered ? 'checked' : ''}><span><b>Зарегистрирован в СКУД</b><small>Есть пропуск в системе доступа</small></span></label></div>` +
      `<div class="person-duplicate-warning hidden" data-person-duplicate-warning role="alert"><span class="person-duplicate-icon">!</span><span><b data-identity-warning-title>Совпадение данных</b><small data-duplicate-person></small><em data-identity-warning-copy></em></span></div>` +
      `<label class="check-field full identity-different-person hidden" data-different-person><input data-field="differentPerson" type="checkbox"><span><b>Это другой человек</b><small>Подтвердите только после проверки документа</small></span></label>`;
  }

  function attachIdentityMatching(modal, excludeId = null) {
    const countryInput = modal.querySelector('[data-identity-country]');
    const documentInput = modal.querySelector('[data-identity-document]');
    const middleNameInput = modal.querySelector('[data-field="middleName"]');
    const noMiddleNameInput = modal.querySelector('[data-no-middle-name]');
    const phoneInput = modal.querySelector('[data-identity-phone]');
    const confirmButton = modal.querySelector('[data-confirm-modal]');
    const example = modal.querySelector('[data-document-example]');
    const warning = modal.querySelector('[data-person-duplicate-warning]');
    const differentPerson = modal.querySelector('[data-different-person]');
    const tracked = ['lastName', 'firstName', 'middleName', 'phone', 'birthDate', 'citizenship', 'passport'];

    const values = () => Object.fromEntries(tracked.map(name => {
      const value = modal.querySelector(`[data-field="${name}"]`)?.value || '';
      return [name, name === 'citizenship' ? (canonicalCountry(value) || value.trim()) : value];
    }));
    const matchingValues = () => {
      const current = values();
      current.name = composeIdentityName(current);
      return current;
    };
    const refreshExample = () => {
      const sample = documentExample(countryInput.value);
      documentInput.placeholder = sample;
      if (example) example.textContent = `Пример для страны: ${sample}`;
    };
    const check = () => {
      const middleNameReady = !!noMiddleNameInput?.checked || !!middleNameInput?.value.trim();
      modal.querySelector('.identity-middle-name-field')?.classList.toggle('identity-required-missing', !middleNameReady);
      if (confirmButton) {
        confirmButton.disabled = !middleNameReady;
        confirmButton.title = middleNameReady ? '' : 'Введите отчество или отметьте «Нет отчества»';
      }
      const current = matchingValues();
      const exact = exactDocumentDuplicate(current.citizenship, current.passport, excludeId);
      const probable = exact ? null : probableDuplicate(current, excludeId);
      const match = exact || probable;
      warning.classList.toggle('hidden', !match);
      warning.classList.toggle('probable', !!probable);
      differentPerson.classList.toggle('hidden', !probable);
      documentInput.classList.toggle('duplicate-input', !!exact);
      documentInput.setAttribute('aria-invalid', exact ? 'true' : 'false');
      if (match) {
        warning.querySelector('[data-identity-warning-title]').textContent = exact ? 'Документ уже зарегистрирован' : 'Возможно, сотрудник уже есть';
        warning.querySelector('[data-duplicate-person]').textContent = `${match.name} · ${match.phone || 'номер не указан'}${match.birthDate ? ` · ${match.birthDate}` : ''}`;
        warning.querySelector('[data-identity-warning-copy]').textContent = exact ? 'Новая карточка с этим документом создана не будет.' : 'Откройте найденную карточку или подтвердите, что это другой человек.';
      }
      return { exact, probable, current };
    };
    countryInput.addEventListener('input', () => { refreshExample(); check(); });
    countryInput.addEventListener('change', () => {
      const resolved = canonicalCountry(countryInput.value);
      if (resolved) countryInput.value = resolved;
      refreshExample();
      check();
    });
    const syncMiddleName = () => {
      const hasNoMiddleName = !!noMiddleNameInput?.checked;
      if (hasNoMiddleName && middleNameInput) middleNameInput.value = '';
      if (middleNameInput) {
        middleNameInput.disabled = hasNoMiddleName;
        middleNameInput.placeholder = hasNoMiddleName ? 'Отчество отсутствует' : 'Введите отчество';
      }
      modal.querySelector('.identity-middle-name-field')?.classList.toggle('without-middle-name', hasNoMiddleName);
      check();
    };
    noMiddleNameInput?.addEventListener('change', syncMiddleName);
    const syncPhone = () => {
      phoneInput.value = formatRussianPhone(phoneInput.value, true);
      phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length);
      check();
    };
    phoneInput?.addEventListener('input', syncPhone);
    phoneInput?.addEventListener('focus', syncPhone);
    tracked.forEach(name => modal.querySelector(`[data-field="${name}"]`)?.addEventListener('input', check));
    syncMiddleName();
    refreshExample();
    check();
    return check;
  }

  function validateIdentity(values, excludeId, checkMatching) {
    if (!String(values.lastName || '').trim()) { toast('Введите фамилию'); return false; }
    if (!String(values.firstName || '').trim()) { toast('Введите имя'); return false; }
    values.lastName = values.lastName.trim();
    values.firstName = values.firstName.trim();
    values.noMiddleName = !!values.noMiddleName;
    values.middleName = values.noMiddleName ? '' : String(values.middleName || '').trim();
    if (!values.noMiddleName && !values.middleName) { toast('Введите отчество или отметьте «Нет отчества»'); return false; }
    values.name = composeIdentityName(values);
    values.phone = formatRussianPhone(values.phone, true);
    const digits = phoneDigits(values.phone);
    if (digits.length !== 11 || !digits.startsWith('7')) { toast('Введите телефон полностью: +7 (999) 999-99-99'); return false; }
    values.birthDate = normalizeBirthDate(values.birthDate);
    if (!validBirthDate(values.birthDate)) { toast('Введите корректную дату рождения в формате ДД.ММ.ГГГГ'); return false; }
    const resolvedCountry = canonicalCountry(values.citizenship);
    if (!resolvedCountry) { toast('Выберите страну из подсказок'); return false; }
    values.citizenship = resolvedCountry;
    if (normalizeDocument(values.passport).length < 5) { toast('Укажите серию и номер документа'); return false; }
    const result = checkMatching();
    if (result.exact) { toast(`Документ уже принадлежит сотруднику: ${result.exact.name}`); return false; }
    if (result.probable && !values.differentPerson) { toast('Проверьте возможное совпадение сотрудников'); return false; }
    return true;
  }

  openRegisterPersonModal = function () {
    let checkMatching;
    openModal('Новый сотрудник', identityFields({ citizenship: 'Россия' }) + `<div class="field full rate-hint">Регистрация выполняется постом ${currentSecurityLocation}. Точное совпадение документа блокирует дубль, а похожие данные требуют подтверждения.</div>`, 'Зарегистрировать', values => {
      if (!validateIdentity(values, null, checkMatching)) return false;
      const personRecord = {
        id: nextId(),
        name: values.name,
        lastName: values.lastName,
        firstName: values.firstName,
        middleName: values.middleName,
        noMiddleName: values.noMiddleName,
        phone: values.phone.trim(),
        birthDate: normalizeBirthDate(values.birthDate),
        citizenship: values.citizenship,
        passport: values.passport.trim(),
        position: values.position,
        type: 'Штатный',
        engagement: 'Наличные',
        rate: null,
        patent: values.patent,
        scudRegistered: values.scudRegistered,
        source: 'security',
        securityVisible: true,
        registeredAtLocation: currentSecurityLocation
      };
      state.people.push(personRecord);
      addIdentityHistory(personRecord, 'Карточка сотрудника создана', [
        `гражданство: ${personRecord.citizenship}`,
        `документ: ${personRecord.passport}`,
        `СКУД: ${personRecord.scudRegistered ? 'зарегистрирован' : 'не зарегистрирован'}`
      ]);
    });
    const modal = document.querySelector('#modal');
    checkMatching = attachIdentityMatching(modal);
    modal.querySelector('[data-field="lastName"]')?.focus();
  };

  function identityChangeList(before, after) {
    const labels = { lastName: 'Фамилия', firstName: 'Имя', middleName: 'Отчество', noMiddleName: 'Отчество отсутствует', phone: 'Телефон', birthDate: 'Дата рождения', citizenship: 'Гражданство', passport: 'Документ', position: 'Должность', patent: 'Патент', scudRegistered: 'СКУД' };
    return Object.keys(labels).filter(key => String(before[key] ?? '') !== String(after[key] ?? '')).map(key => {
      const display = value => typeof value === 'boolean' ? (value ? 'да' : 'нет') : (value || 'не указано');
      return `${labels[key]}: ${display(before[key])} → ${display(after[key])}`;
    });
  }

  function openIdentityEditor(id) {
    const personRecord = person(id);
    if (!personRecord) { toast('Сотрудник не найден'); return; }
    const existingName = splitIdentityName(personRecord);
    let editorBody;
    try {
      editorBody = identityFields({
        lastName: existingName.lastName,
        firstName: existingName.firstName,
        middleName: existingName.middleName,
        noMiddleName: existingName.noMiddleName,
        phone: personRecord.phone || '',
        birthDate: personRecord.birthDate || '',
        citizenship: personRecord.citizenship || 'Россия',
        passport: personRecord.passport || '',
        position: personRecord.position || KITCHEN_POSITIONS[0],
        patent: !!personRecord.patent,
        scudRegistered: !!personRecord.scudRegistered
      }) + `<div class="field full rate-hint">Все изменения сохраняются в отдельном журнале с датой и автором.</div>`;
    } catch (error) {
      window.__identityEditorError = String(error && error.message ? error.message : error);
      toast('Не удалось открыть редактор данных');
      return;
    }
    closeDrawer();
    let checkMatching;
    openModal('Данные сотрудника', editorBody, 'Сохранить изменения', values => {
      if (!validateIdentity(values, personRecord.id, checkMatching)) return false;
      const before = { lastName: existingName.lastName, firstName: existingName.firstName, middleName: existingName.middleName, noMiddleName: existingName.noMiddleName, phone: personRecord.phone, birthDate: personRecord.birthDate, citizenship: personRecord.citizenship, passport: personRecord.passport, position: personRecord.position, patent: !!personRecord.patent, scudRegistered: !!personRecord.scudRegistered };
      const after = { lastName: values.lastName, firstName: values.firstName, middleName: values.middleName, noMiddleName: !!values.noMiddleName, phone: values.phone.trim(), birthDate: normalizeBirthDate(values.birthDate), citizenship: values.citizenship, passport: values.passport.trim(), position: values.position, patent: !!values.patent, scudRegistered: !!values.scudRegistered };
      const changes = identityChangeList(before, after);
      if (!changes.length) { toast('Изменений нет'); return false; }
      Object.assign(personRecord, after, { name: composeIdentityName(after) });
      addIdentityHistory(personRecord, 'Изменены персональные данные', changes);
    });
    const identityModal = document.querySelector('#modal');
    if (currentRole === 'Охрана') {
      ['lastName', 'firstName', 'middleName'].forEach(fieldName => {
        const input = identityModal.querySelector(`[data-field="${fieldName}"]`);
        if (input) { input.readOnly = true; input.title = 'ФИО после регистрации изменяет бухгалтерия'; }
      });
      const noMiddleName = identityModal.querySelector('[data-no-middle-name]');
      if (noMiddleName) { noMiddleName.disabled = true; noMiddleName.title = 'ФИО после регистрации изменяет бухгалтерия'; }
      identityModal.classList.add('security-name-locked');
    }
    checkMatching = attachIdentityMatching(identityModal, personRecord.id);
  }

  function identityHistoryMarkup(records) {
    if (!records.length) return '<div class="identity-history-empty">Изменений данных пока нет</div>';
    return records.map(record => `<article class="identity-history-row"><span class="identity-history-dot"></span><div><header><b>${escapeIdentity(record.personName)}</b><time>${escapeIdentity(record.at)}</time></header><strong>${escapeIdentity(record.title)}</strong><ul>${record.changes.map(change => `<li>${escapeIdentity(change)}</li>`).join('')}</ul><small>${escapeIdentity(record.actor)}</small></div></article>`).join('');
  }

  function openIdentityHistory() {
    ensureIdentityState();
    const modal = document.querySelector('#modal');
    modal.innerHTML = `<div class="modal-head"><div><h2>История данных сотрудников</h2><div class="muted">Кто, когда и какие данные изменил</div></div><button class="icon-btn" data-close-modal>×</button></div><div class="identity-history-list">${identityHistoryMarkup(state.personIdentityHistory)}</div><div class="modal-actions"><button class="btn primary" data-close-modal>Закрыть</button></div>`;
    modal.classList.add('identity-history-modal');
    modal.classList.remove('hidden');
    document.querySelector('#modal-backdrop').classList.remove('hidden');
    modal.querySelectorAll('[data-close-modal]').forEach(button => button.onclick = () => { modal.classList.remove('identity-history-modal'); closeModal(); });
  }

  const baseBindAction = bindAction;
  bindAction = function (element) {
    if (element.dataset.action === 'edit-person-data') { element.onclick = () => openIdentityEditor(Number(element.dataset.id)); return; }
    if (element.dataset.action === 'person-identity-history') { element.onclick = openIdentityHistory; return; }
    baseBindAction(element);
  };

  const baseSecurityPersonDrawer = openSecurityPersonDrawer;
  openSecurityPersonDrawer = function (id) {
    baseSecurityPersonDrawer(id);
    const personRecord = person(id);
    const drawer = document.querySelector('#drawer');
    const section = drawer.querySelector('.security-person-data');
    if (!section) return;
    const heading = section.querySelector('.section-heading');
    heading.querySelectorAll('.tag').forEach(tag => tag.remove());
    heading.insertAdjacentHTML('beforeend', `<div class="identity-card-actions"><span class="tag ${personRecord.patent ? 'green' : ''}">${personRecord.patent ? 'Патент есть' : 'Патент не указан'}</span><span class="tag ${personRecord.scudRegistered ? 'green' : ''}">${personRecord.scudRegistered ? 'СКУД зарегистрирован' : 'Нет в СКУД'}</span><button class="btn small" data-action="edit-person-data" data-id="${id}">Редактировать</button></div>`);
    section.querySelector('.security-data-grid').innerHTML = `<span><small>Телефон</small><b>${escapeIdentity(personRecord.phone || 'Не указан')}</b></span><span><small>Дата рождения</small><b>${escapeIdentity(personRecord.birthDate || 'Не указана')}</b></span><span><small>Гражданство</small><b>${escapeIdentity(personRecord.citizenship || 'Не указано')}</b></span><span><small>СКУД</small><b>${personRecord.scudRegistered ? 'Зарегистрирован' : 'Не зарегистрирован'}</b></span><span class="wide"><small>Серия и номер документа</small><b>${escapeIdentity(personRecord.passport || 'Не указаны')}</b></span>`;
    const records = (state.personIdentityHistory || []).filter(record => record.personId === id).slice(0, 3);
    section.insertAdjacentHTML('afterend', `<section class="drawer-section identity-card-history"><div class="section-heading"><div><h3>Изменения данных</h3><span class="section-caption">Последние действия с карточкой</span></div><button class="btn small" data-action="person-identity-history">Вся история</button></div>${identityHistoryMarkup(records)}</section>`);
    drawer.querySelector('[data-action="edit-person-data"]').onclick = () => openIdentityEditor(id);
    drawer.querySelector('[data-action="person-identity-history"]').onclick = openIdentityHistory;
  };

  const basePersonDrawer = openPersonDrawer;
  openPersonDrawer = function (id) {
    basePersonDrawer(id);
    const personRecord = person(id);
    const drawer = document.querySelector('#drawer');
    const conditions = drawer.querySelector('[data-person-card-panel="conditions"]');
    if (!conditions) return;
    const head = conditions.querySelector('.finance-section-head');
    head.insertAdjacentHTML('beforeend', `<button class="btn" data-action="edit-person-data" data-id="${id}">Редактировать данные</button>`);
    head.insertAdjacentHTML('afterend', `<div class="finance-identity-grid"><div><span>Дата рождения</span><b>${escapeIdentity(personRecord.birthDate || 'Не указана')}</b></div><div><span>Гражданство</span><b>${escapeIdentity(personRecord.citizenship || 'Не указано')}</b></div><div><span>Документ</span><b>${escapeIdentity(personRecord.passport || 'Не указан')}</b></div><div><span>СКУД</span><b>${personRecord.scudRegistered ? 'Зарегистрирован' : 'Не зарегистрирован'}</b></div></div>`);
    drawer.querySelector('[data-action="edit-person-data"]').onclick = () => openIdentityEditor(id);
  };

  const baseSecurityPage = securityPage;
  securityPage = function () {
    return baseSecurityPage().replace('<button class="btn" data-action="register-person">+ Новый сотрудник</button>', '<button class="btn" data-action="person-identity-history">История данных</button><button class="btn" data-action="register-person">+ Новый сотрудник</button>');
  };

  document.addEventListener('click', event => {
    const editButton = event.target.closest('[data-action="edit-person-data"]');
    if (editButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openIdentityEditor(Number(editButton.dataset.id));
      return;
    }
    const historyButton = event.target.closest('[data-action="person-identity-history"]');
    if (historyButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openIdentityHistory();
    }
  }, true);

  ensureIdentityState();
  save();
  render();
})();
