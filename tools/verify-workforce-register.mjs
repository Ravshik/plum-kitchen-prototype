import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', error => console.error('PAGEERROR', error.message));
page.on('console', message => { if (message.type() === 'error') console.error('CONSOLE', message.text()); });
await page.goto('http://127.0.0.1:4191/?v=75', { waitUntil: 'networkidle' });

await page.evaluate(() => {
  state = clone(EMPTY_STATE);
  state.people = [{
    id: 1, name: 'Канапиев Равшан', position: 'Повар', type: 'Штатный', engagement: 'ТК', payType: 'Почасовая', rate: 500,
    source: 'security', securityVisible: true
  }, {
    id: 2, name: 'Иванов Иван', position: 'Су-шеф', type: 'Штатный', engagement: 'ТК', payType: 'Оклад', rate: 40000,
    manualAmount: 0, manualHours: 0, location: 'Березка', legalEntity: 'ООО «ДТК»', source: 'accounting', securityVisible: false
  }, {
    id: 3, name: 'Петров Петр', position: 'Повар', type: 'Штатный', engagement: 'Наличные', payType: 'Почасовая', rate: 600,
    source: 'security', securityVisible: true
  }];
  state.shifts = [{
    id: 10, personId: 1, date: '17.09.2026', entry: '10:00', exit: '15:00', workStart: '10:00', workEnd: '15:00',
    position: 'Повар', type: 'Штатный', engagement: 'ТК', rate: 500, status: 'Готово', location: 'Березка', legalEntity: 'ООО «ДТК»', taxi: 100
  }];
  state.adjustments = [{ id: 20, personId: 1, type: 'Премия', amount: 500, month: 'Сентябрь 2026', location: 'Березка', reason: 'Тест', author: 'Бухгалтер' }];
  state.taxiExpenses = [{ id: 30, personId: 1, accountingMonth: '2026-09', period: 'Сентябрь 2026', amount: 100 }];
  state.payments = [];
  state.paymentPeriods = [];
  state.registries = [];
  state.nextId = 100;
  currentPeriod = '14–20 сентября 2026';
  currentPeriodFrom = '2026-09-14';
  currentPeriodTo = '2026-09-20';
  currentLocation = 'Все площадки';
  currentEntity = 'Все ООО';
  currentEmployment = 'Все оформления';
  currentRole = 'Бухгалтер';
  currentPage = 'timesheet';
  currentView = 'statement';
  render();
});

if (await page.locator('[data-ledger-row]').count() !== 3) throw new Error('The accounting register does not show every employee');
const accountantRow = page.locator('[data-ledger-row]').filter({ hasText: 'Иванов Иван' });
const accountantText = await accountantRow.innerText();
const normalizedAccountantText = accountantText.replace(/\s/g, ' ');
if (!normalizedAccountantText.includes('40 000 ₽') || !accountantText.includes('Без табеля')) throw new Error(`Accounting-only salary employee is missing: ${accountantText}`);
if (await accountantRow.locator('[data-pay-person]').isDisabled()) throw new Error('Accounting-only salary employee cannot be selected for payment');

const inactiveRow = page.locator('[data-ledger-row]').filter({ hasText: 'Петров Петр' });
if (!await inactiveRow.innerText().then(text => text.includes('Нет смен в периоде'))) throw new Error('Inactive employee has no visible status');
if (!await inactiveRow.locator('[data-pay-person]').isDisabled()) throw new Error('Inactive employee without accrual is selectable for payment');

await page.locator('[data-action="accounting-person"]').click();
await page.locator('#modal [data-field="name"]').fill('Сидоров Сидор');
await page.locator('#modal [data-field="phone"]').fill('+7 999 111-22-33');
await page.locator('#modal [data-field="payType"]').selectOption({ label: 'Оклад' });
await page.locator('#modal [data-field="rate"]').fill('50000');
await page.locator('#modal [data-confirm-modal]').click();
const addedAccountantRow = page.locator('[data-ledger-row]').filter({ hasText: 'Сидоров Сидор' });
if (await addedAccountantRow.count() !== 1 || !await addedAccountantRow.innerText().then(text => text.replace(/\s/g, ' ').includes('50 000 ₽'))) {
  throw new Error('Employee added through the accounting form did not appear in the register');
}

await page.evaluate(() => {
  currentPeriod = '21–27 сентября 2026';
  currentPeriodFrom = '2026-09-21';
  currentPeriodTo = '2026-09-27';
  render();
});
if (await page.locator('[data-ledger-row]').count() !== 4) throw new Error('Employees disappear after changing the calculation period');
if (!await page.locator('[data-ledger-row]').filter({ hasText: 'Иванов Иван' }).innerText().then(text => text.replace(/\s/g, ' ').includes('40 000 ₽'))) throw new Error('Accounting salary disappeared in another period');

await page.evaluate(() => {
  currentPeriod = '14–20 сентября 2026';
  currentPeriodFrom = '2026-09-14';
  currentPeriodTo = '2026-09-20';
  render();
});
await page.locator('[data-action="workforce-analytics"][data-analytics-mode="accounting"]').click();
const accountingAnalytics = await page.locator('#modal').innerText();
if (!accountingAnalytics.includes('Статистика персонала') || !accountingAnalytics.includes('По дням') || !accountingAnalytics.includes('По сотрудникам')) throw new Error('Accounting analytics sections are missing');
if (!accountingAnalytics.includes('Иванов Иван') || !accountingAnalytics.includes('Канапиев Равшан') || !accountingAnalytics.includes('Сидоров Сидор')) throw new Error('Accounting analytics omits employees');
if (!accountingAnalytics.replace(/\s/g, ' ').includes('3 100 ₽')) throw new Error(`Accounting analytics total is wrong: ${accountingAnalytics.slice(0, 1800)}`);

await page.locator('[data-close-analytics]').last().click();
await page.evaluate(() => { currentRole = 'Шеф'; currentPage = 'chef'; currentSecurityLocation = 'Березка'; render(); });
const chefButton = page.locator('[data-action="workforce-analytics"][data-analytics-mode="chef"]');
if (await chefButton.count() !== 1) throw new Error('Chef analytics button is missing');
await chefButton.click();
const chefAnalytics = await page.locator('#modal').innerText();
if (!chefAnalytics.includes('Статистика объекта') || !chefAnalytics.includes('Только объект «Березка»')) throw new Error(`Chef analytics is not scoped to the object: ${chefAnalytics.slice(0, 1200)}`);
await page.screenshot({ path: 'accounting-prototype/tmp/workforce-analytics.png', fullPage: true });

console.log(JSON.stringify({ accountingRows: 4, accountantText, accountingAnalytics: accountingAnalytics.slice(0, 900), chefAnalytics: chefAnalytics.slice(0, 600) }, null, 2));
await browser.close();
