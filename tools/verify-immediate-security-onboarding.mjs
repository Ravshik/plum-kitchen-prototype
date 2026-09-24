import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
});
await page.goto('http://127.0.0.1:4191/?v=79', { waitUntil: 'networkidle' });

await page.evaluate(() => {
  state = clone(EMPTY_STATE);
  state.nextId = 100;
  state.people = [];
  state.shifts = [];
  state.audit = [];
  currentRole = 'Охрана';
  currentPage = 'security';
  currentSecurityLocation = 'Березка';
  render();
});

await page.locator('[data-action="register-person"]').first().click();
await page.locator('#modal [data-field="lastName"]').fill('Новый');
await page.locator('#modal [data-field="firstName"]').fill('Сотрудник');
await page.locator('#modal [data-field="middleName"]').fill('Тестович');
await page.locator('#modal [data-field="phone"]').fill('9991112233');
await page.locator('#modal [data-field="birthDate"]').fill('01.01.1990');
await page.locator('#modal [data-field="passport"]').fill('45 01 123456');
await page.locator('#modal [data-confirm-modal]').click();

const registered = await page.evaluate(() => state.people[0]);
if (!registered || !registered.needsAccountingReview || registered.onboardingStep !== 'rate' || !registered.registeredAt || registered.registeredAtLocation !== 'Березка') {
  throw new Error(`Security registration did not create accounting review: ${JSON.stringify(registered)}`);
}

await page.evaluate(() => {
  currentRole = 'Бухгалтер';
  currentPage = 'timesheet';
  currentView = 'attention';
  currentPeriod = '10–16 августа 2026';
  currentPeriodFrom = '2026-08-10';
  currentPeriodTo = '2026-08-16';
  currentLocation = 'Все площадки';
  currentEntity = 'Все ООО';
  currentEmployment = 'Все оформления';
  render();
});

const pendingRow = page.locator('[data-person-onboarding-row="100"]');
if (await pendingRow.count() !== 1) throw new Error('New security employee is not visible immediately in Требуют исправления');
const pendingText = await pendingRow.innerText();
if (!pendingText.includes('Новый сотрудник') || !pendingText.includes('Шаг 1 из 3') || !pendingText.includes('Карточка создана охраной')) {
  throw new Error(`Immediate onboarding row is incomplete: ${pendingText}`);
}

await page.locator('[data-person-onboarding-rate="100"]').fill('900');
await page.locator('[data-action="onboarding-person-rate"]').click();
if (await page.locator('[data-person-onboarding-position="100"]').count() !== 1) throw new Error('Person-only onboarding did not advance to position');
await page.locator('[data-person-onboarding-position="100"]').selectOption('Повар');
await page.locator('[data-action="onboarding-person-position"]').click();
await page.locator('[data-action="onboarding-person-employment"][data-value="Наличные"]').click();

const completed = await page.evaluate(() => state.people[0]);
if (completed.needsAccountingReview || completed.onboardingStep || !completed.rateConfirmed || completed.rate !== 900 || completed.engagement !== 'Наличные') {
  throw new Error(`Person-only onboarding did not complete: ${JSON.stringify(completed)}`);
}
if (await page.locator('[data-person-onboarding-row]').count() !== 0) throw new Error('Completed employee remains in Требуют исправления');

await page.locator('[data-action="choose-calc-period"]').click();
if (await page.locator('.plum-day.today.selected').count() !== 1) throw new Error('Current date is not selected when period calendar opens');
const calendarState = await page.evaluate(() => ({
  month: Number(document.querySelector('[data-calendar-month]')?.value),
  year: Number(document.querySelector('[data-calendar-year]')?.value),
  actualMonth: new Date().getMonth(),
  actualYear: new Date().getFullYear(),
  summary: document.querySelector('.period-range-summary')?.innerText
}));
if (calendarState.month !== calendarState.actualMonth || calendarState.year !== calendarState.actualYear) {
  throw new Error(`Calendar opens on an old date: ${JSON.stringify(calendarState)}`);
}

await page.screenshot({ path: 'tmp/immediate-security-onboarding.png', fullPage: true });
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
console.log(JSON.stringify({ registered, pendingText, completed, calendarState }, null, 2));
await browser.close();
