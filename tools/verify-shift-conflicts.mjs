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

await page.goto('http://127.0.0.1:4191/?v=74', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  state = clone(EMPTY_STATE);
  state.people = [{
    id: 1,
    name: 'Канапиев Равшан',
    position: 'Повар',
    type: 'Штатный',
    engagement: 'Наличные',
    rate: 500,
    source: 'security',
    securityVisible: true
  }, {
    id: 2,
    name: 'Иванов Иван',
    position: 'Су-шеф',
    type: 'Штатный',
    engagement: 'ТК',
    rate: 600,
    source: 'security',
    securityVisible: true
  }];
  state.shifts = [{
    id: 10,
    personId: 1,
    date: '17.09.2026',
    entry: '14:47',
    exit: null,
    workStart: null,
    workEnd: null,
    position: 'Повар',
    type: 'Штатный',
    engagement: 'Наличные',
    rate: 500,
    status: 'Открыта',
    location: 'Березка',
    legalEntity: 'ООО «ДТК»'
  }];
  state.audit = [];
  currentRole = 'Охрана';
  currentPage = 'security';
  currentSecurityLocation = 'Лофт 2–3';
  currentSecurityPersonId = 2;
  render();
});

const blockedRow = page.locator('.security-person-row.is-open-elsewhere').filter({ hasText: 'Канапиев Равшан' });
if (await blockedRow.count() !== 1) throw new Error('Employee opened elsewhere is not visible as blocked');
const blockedRowText = await blockedRow.innerText();
if (!blockedRowText.includes('Открыт: Березка')) throw new Error(`Blocked row does not show location: ${blockedRowText}`);

const shiftsBefore = await page.evaluate(() => state.shifts.length);
await blockedRow.locator('[data-action="quick-open-security-shift"]').click();
const conflictDialog = await page.locator('#modal').innerText();
if (!conflictDialog.includes('Смена уже открыта') || !conflictDialog.includes('Березка') || !conflictDialog.includes('14:47') || !conflictDialog.includes('Лофт 2–3')) {
  throw new Error(`Conflict dialog is incomplete: ${conflictDialog}`);
}
if (await page.evaluate(() => state.shifts.length) !== shiftsBefore) throw new Error('Conflicting quick start created a second shift');

await page.locator('[data-close-conflict]').last().click();
await page.locator('[data-action="start-shift"]').click();
const personSelect = page.locator('#modal [data-field="personId"]');
await personSelect.selectOption('1');
const inlineWarning = await page.locator('.shift-conflict-inline').innerText();
if (!inlineWarning.includes('Березка') || !inlineWarning.includes('14:47')) throw new Error(`Inline warning is incomplete: ${inlineWarning}`);
if (!(await page.locator('#modal [data-confirm-modal]').isDisabled())) throw new Error('Start button is enabled for a conflicting employee');
if (await page.evaluate(() => state.shifts.length) !== shiftsBefore) throw new Error('Regular start form created a second shift');

await page.locator('#modal [data-close-modal]').first().click();
await page.evaluate(() => { state.shifts[0].exit = '18:00'; render(); });
await page.locator('.security-person-row').filter({ hasText: 'Канапиев Равшан' }).locator('[data-action="quick-open-security-shift"]').click();
const successfulShift = await page.evaluate(() => state.shifts[state.shifts.length - 1]);
if (successfulShift.personId !== 1 || successfulShift.location !== 'Лофт 2–3' || successfulShift.exit !== null) {
  throw new Error(`Shift did not open after previous one was closed: ${JSON.stringify(successfulShift)}`);
}

console.log(JSON.stringify({ blockedRowText, conflictDialog, inlineWarning, successfulLocation: successfulShift.location }, null, 2));
await browser.close();
