import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
});
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', error => console.error('PAGEERROR', error.message));
page.on('console', message => {
  if (message.type() === 'error') console.error('CONSOLE', message.text());
});

await page.goto('http://127.0.0.1:4191/?v=73', { waitUntil: 'networkidle' });

await page.evaluate(() => {
  state = clone(EMPTY_STATE);
  state.people = [{
    id: 1,
    name: 'Канапиев Равшан',
    position: 'Повар',
    type: 'Штатный',
    engagement: 'ТК',
    payType: 'Индивидуальная окладная формула',
    salaryBase: 100000,
    salaryNormHours: 10,
    salaryOvertimeRate: 500,
    rate: 500,
    source: 'security',
    securityVisible: true
  }];
  state.shifts = [{
    id: 10,
    personId: 1,
    date: '17.09.2026',
    entry: '08:00',
    exit: '20:00',
    workStart: '08:00',
    workEnd: '20:00',
    position: 'Повар',
    type: 'Штатный',
    engagement: 'ТК',
    rate: 500,
    status: 'Готово',
    location: 'Лофт 2–3',
    legalEntity: 'ООО «ДТК»'
  }];
  state.adjustments = [{
    id: 20,
    personId: 1,
    type: 'Штраф',
    amount: 100,
    date: '17.09.2026',
    month: 'Сентябрь 2026',
    location: 'Лофт 2–3',
    reason: 'Проверка накопительного остатка',
    author: 'Бухгалтер'
  }];
  state.taxiExpenses = [];
  state.paymentPeriods = [];
  state.payments = [];
  state.registries = [];
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

const workedPeriod = await page.evaluate(() => {
  const row = weekRows().find(item => item.p.id === 1);
  return {
    ok: row.ok,
    salaryPayable: row.salaryPayable,
    shiftCount: row.shifts.length,
    base: row.base,
    balance: row.balance
  };
});
if (!workedPeriod.ok || !workedPeriod.salaryPayable || workedPeriod.shiftCount !== 1 || workedPeriod.balance !== 100900) {
  throw new Error(`Worked period is not payable: ${JSON.stringify(workedPeriod)}`);
}
if (await page.locator('[data-ledger-row]').count() !== 1) {
  throw new Error('Employee is missing from the period where the shift was worked');
}

await page.locator('[data-action="open-registers"]').click();
const modalText = await page.locator('#modal').innerText();
if (!modalText.includes('Канапиев Равшан')) {
  throw new Error(`Payment modal does not include worked employee: ${modalText}`);
}
await page.locator('[data-create-registers]').click();

const registry = await page.evaluate(() => state.registries[0]);
if (registry.from !== '14.09.2026' || registry.to !== '20.09.2026') {
  throw new Error(`Registry was attached to the wrong period: ${JSON.stringify(registry)}`);
}

await page.evaluate(() => {
  currentPeriod = '21–27 сентября 2026';
  currentPeriodFrom = '2026-09-21';
  currentPeriodTo = '2026-09-27';
  currentView = 'statement';
  render();
});

const emptyPeriod = await page.evaluate(() => {
  const row = weekRows().find(item => item.p.id === 1);
  return {
    ok: row.ok,
    salaryPayable: row.salaryPayable,
    shiftCount: row.shifts.length
  };
});
if (emptyPeriod.ok || emptyPeriod.salaryPayable || emptyPeriod.shiftCount !== 0) {
  throw new Error(`Employee leaked into an empty period: ${JSON.stringify(emptyPeriod)}`);
}
if (await page.locator('[data-ledger-row]').count() !== 1) {
  throw new Error('The persistent employee register should keep the employee visible');
}
const emptyPeriodRow = page.locator('[data-ledger-row]').first();
if (!await emptyPeriodRow.innerText().then(text => text.includes('Нет смен в периоде'))) {
  throw new Error('The empty period row is not clearly marked as having no shifts');
}
if (!await emptyPeriodRow.locator('[data-pay-person]').isDisabled()) {
  throw new Error('Employee without shifts is incorrectly selectable for payment');
}

const nextWorkedPeriod = await page.evaluate(() => {
  const registry = state.registries[0];
  applyRegistryPayment(registry);
  registry.status = 'Выплачен';
  state.shifts.push({
    id: 11,
    personId: 1,
    date: '22.09.2026',
    entry: '08:00',
    exit: '10:00',
    workStart: '08:00',
    workEnd: '10:00',
    position: 'Повар',
    type: 'Штатный',
    engagement: 'ТК',
    rate: 500,
    status: 'Готово',
    location: 'Лофт 2–3',
    legalEntity: 'ООО «ДТК»'
  });
  render();
  const row = weekRows().find(item => item.p.id === 1);
  return {
    ok: row.ok,
    salaryPayable: row.salaryPayable,
    shiftCount: row.shifts.length,
    base: row.base,
    penalty: row.penalty,
    paid: row.paid,
    balance: row.balance
  };
});
if (!nextWorkedPeriod.ok || !nextWorkedPeriod.salaryPayable || nextWorkedPeriod.shiftCount !== 1 || nextWorkedPeriod.balance !== 1000) {
  throw new Error(`Cumulative remainder is wrong in the next worked period: ${JSON.stringify(nextWorkedPeriod)}`);
}

console.log(JSON.stringify({ workedPeriod, registryPeriod: `${registry.from}–${registry.to}`, emptyPeriod, nextWorkedPeriod }, null, 2));
await browser.close();
