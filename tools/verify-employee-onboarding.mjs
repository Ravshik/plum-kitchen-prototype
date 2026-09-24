import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) pageErrors.push(message.text());
});
await page.goto('http://127.0.0.1:4191/?v=76', { waitUntil: 'networkidle' });

async function seed(id, name) {
  await page.evaluate(({ id, name }) => {
    state = clone(EMPTY_STATE);
    state.people = [{
      id, name, position: 'Повар', type: 'Штатный', engagement: 'Наличные', rate: null,
      rateConfirmed: false, source: 'security', securityVisible: true
    }];
    state.shifts = [{
      id: id + 100, personId: id, date: '17.09.2026', entry: '19:00', exit: '00:00',
      workStart: '19:00', workEnd: '00:00', position: 'Повар', type: 'Штатный', engagement: 'Наличные',
      rate: 1200, rateReview: true, status: 'Требует проверки ставки', location: 'Березка', legalEntity: 'ООО «ДТК»'
    }];
    state.audit = [];
    state.adjustments = [];
    state.payments = [];
    state.paymentPeriods = [];
    state.registries = [];
    state.nextId = 1000;
    currentRole = 'Бухгалтер';
    currentPage = 'timesheet';
    currentView = 'attention';
    currentPeriod = '14–20 сентября 2026';
    currentPeriodFrom = '2026-09-14';
    currentPeriodTo = '2026-09-20';
    currentLocation = 'Все площадки';
    currentEntity = 'Все ООО';
    currentEmployment = 'Все оформления';
    save();
    render();
  }, { id, name });
}

await seed(1, 'Сотрудник СЗ');
let tableText = await page.locator('.onboarding-table').innerText();
if (!tableText.includes('Шаг 1 из 3') || !tableText.includes('Новый сотрудник: ставка')) throw new Error(`Rate step is missing: ${tableText}`);
await page.locator('[data-onboarding-rate="101"]').fill('1300');
await page.locator('[data-action="onboarding-rate"]').click();
tableText = await page.locator('.onboarding-table').innerText();
if (!tableText.includes('Шаг 2 из 3') || await page.locator('[data-onboarding-position="101"]').count() !== 1) throw new Error(`Position step is missing: ${tableText}`);
await page.locator('[data-onboarding-position="101"]').selectOption('Бренд-шеф');
await page.locator('[data-action="onboarding-position"]').click();
tableText = await page.locator('.onboarding-table').innerText();
if (!tableText.includes('Шаг 3 из 3') || await page.locator('[data-value="СЗ"]').count() !== 1) throw new Error(`Employment step is missing: ${tableText}`);
await page.evaluate(() => {
  state.shifts.push({
    id: 111, personId: 1, date: '18.09.2026', entry: '10:00', exit: '15:00', workStart: '10:00', workEnd: '15:00',
    position: 'Бренд-шеф', type: 'Штатный', engagement: 'Наличные', rate: 1300, rateReview: true,
    status: 'Требует проверки ставки', location: 'Березка', legalEntity: 'ООО «ДТК»'
  });
});
await page.locator('[data-action="onboarding-employment"][data-value="СЗ"]').click();
const simpleResult = await page.evaluate(() => ({ person: state.people[0], shift: state.shifts[0], secondShift: state.shifts[1], errors: weekRows()[0].errorShifts.length }));
if (simpleResult.person.engagement !== 'СЗ' || simpleResult.person.position !== 'Бренд-шеф' || !simpleResult.person.rateConfirmed || simpleResult.shift.status !== 'Готово' || simpleResult.secondShift.engagement !== 'СЗ' || simpleResult.secondShift.rateReview || simpleResult.errors !== 0) {
  throw new Error(`Simple onboarding failed: ${JSON.stringify(simpleResult)}`);
}

await seed(2, 'Сотрудник ТК');
await page.locator('[data-onboarding-rate="102"]').fill('1400');
await page.locator('[data-action="onboarding-rate"]').click();
await page.locator('[data-onboarding-position="102"]').selectOption('Су-шеф');
await page.locator('[data-action="onboarding-position"]').click();
await page.locator('[data-action="onboarding-employment"][data-value="ТК"]').click();
const modalText = await page.locator('#modal').innerText();
if (!modalText.includes('Условия оформления по ТК') || !modalText.includes('Последний шаг') || !modalText.includes('Тип оплаты')) throw new Error(`TK settings modal is incomplete: ${modalText}`);
if (!await page.locator('#modal [data-field="engagement"]').isDisabled()) throw new Error('TK engagement can be changed inside the final settings modal');
const pending = await page.evaluate(() => ({ step: state.shifts[0].onboardingStep, status: state.shifts[0].status }));
if (pending.step !== 'tk-settings' || pending.status !== 'Требует оформления сотрудника') throw new Error(`TK employee completed before settings were saved: ${JSON.stringify(pending)}`);
await page.locator('#modal [data-confirm-modal]').click();
const tkResult = await page.evaluate(() => ({ person: state.people[0], shift: state.shifts[0], errors: weekRows()[0].errorShifts.length }));
if (tkResult.person.engagement !== 'ТК' || tkResult.person.position !== 'Су-шеф' || !tkResult.person.rateConfirmed || tkResult.shift.status !== 'Готово' || tkResult.shift.onboardingStep || tkResult.errors !== 0) {
  throw new Error(`TK onboarding failed: ${JSON.stringify(tkResult)}`);
}

await seed(3, 'Сотрудник ТК отмена');
await page.locator('[data-action="onboarding-rate"]').click();
await page.locator('[data-action="onboarding-position"]').click();
await page.locator('[data-action="onboarding-employment"][data-value="ТК"]').click();
await page.locator('#modal [data-close-modal]').last().click();
tableText = await page.locator('.onboarding-table').innerText();
if (!tableText.includes('Настроить ТК') || !tableText.includes('Не заполнены условия ТК')) throw new Error(`Cancelled TK setup cannot be resumed: ${tableText}`);

await page.screenshot({ path: 'tmp/employee-onboarding.png', fullPage: true });
if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join(' | ')}`);
console.log(JSON.stringify({ simpleResult, tkResult, cancelledTkResumable: true }, null, 2));
await browser.close();
