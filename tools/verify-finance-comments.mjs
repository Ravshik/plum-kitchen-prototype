import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', error => console.error('PAGEERROR', error.message));
page.on('console', message => { if (message.type() === 'error') console.error('CONSOLE', message.text()); });
await page.goto('http://127.0.0.1:4191/?v=72', { waitUntil: 'networkidle' });

await page.evaluate(() => {
  state = clone(EMPTY_STATE);
  state.people = [{ id: 1, name: 'Канапиев Равшан', position: 'Повар', type: 'Штатный', engagement: 'Наличные', payType: 'Почасовая', rate: 500, source: 'security', securityVisible: true }];
  state.shifts = [{ id: 10, personId: 1, date: '29.09.2026', entry: '18:00', exit: '23:00', workStart: '18:00', workEnd: '23:00', position: 'Повар', type: 'Штатный', engagement: 'Наличные', rate: 500, status: 'Готово', location: 'Лофт 2–3', legalEntity: 'ООО «ДТК»', taxi: 100, taxiComment: 'Такси после позднего окончания смены' }];
  state.adjustments = [
    { id: 20, personId: 1, type: 'Премия', amount: 500, month: 'Сентябрь 2026', location: 'Березка', reason: 'За помощь на площадке', author: 'Бухгалтер' },
    { id: 21, personId: 1, type: 'Анимация', amount: 400, month: 'Сентябрь 2026', location: 'Лофт 2–3', reason: 'Анимационная станция', author: 'Бухгалтер' },
    { id: 22, personId: 1, type: 'Штраф', amount: 100, date: '29.09.2026', month: 'Сентябрь 2026', location: 'Лофт 2–3', reason: 'Опоздание', author: 'Бухгалтер' }
  ];
  state.taxiExpenses = [{ id: 30, personId: 1, period: '28–30 сентября 2026', accountingMonth: '2026-09', amount: 100 }];
  state.paymentPeriods = [];
  state.payments = [];
  state.registries = [];
  currentPeriod = '28–30 сентября 2026';
  currentPeriodFrom = '2026-09-28';
  currentPeriodTo = '2026-09-30';
  currentLocation = 'Все площадки';
  currentEntity = 'Все ООО';
  currentEmployment = 'Все оформления';
  currentRole = 'Бухгалтер';
  currentPage = 'timesheet';
  currentView = 'statement';
  render();
});

await page.waitForTimeout(100);
console.log('ledgerRows', await page.locator('[data-ledger-row]').count(), (await page.locator('#page-root').innerText()).slice(0, 1000));
const ledgerRow = page.locator('[data-ledger-row]').first();
console.log('ledgerHTML', (await ledgerRow.innerHTML()).slice(0, 2000));
await ledgerRow.locator('.amount-detail').first().hover();
await page.waitForSelector('.finance-tooltip-portal.visible');
const bonusTooltip = await page.locator('.finance-tooltip-portal').innerText();
if (!bonusTooltip.includes('За помощь на площадке') || !bonusTooltip.includes('Анимационная станция')) throw new Error(`Bonus tooltip incomplete: ${bonusTooltip}`);

await ledgerRow.locator('[data-taxi-person]').locator('..').hover();
const taxiTooltip = await page.locator('.finance-tooltip-portal').innerText();
if (!taxiTooltip.includes('29.09.2026') || !taxiTooltip.includes('Такси после позднего окончания смены')) throw new Error(`Taxi tooltip incomplete: ${taxiTooltip}`);

await ledgerRow.locator('.person-link').click();
await page.waitForSelector('.person-finance-drawer');
await page.waitForTimeout(100);
const premiumRow = page.locator('.finance-accrual-row').filter({ hasText: 'Премия' }).first();
await premiumRow.locator('strong').hover();
const cardTooltip = await page.locator('.finance-tooltip-portal').innerText();
if (!cardTooltip.includes('За помощь на площадке')) throw new Error(`Card tooltip incomplete: ${cardTooltip}`);

await page.evaluate(() => { closeDrawer(); currentRole = 'Шеф'; render(); });
await page.waitForTimeout(100);
const chefRow = page.locator('.panel').filter({ hasText: 'Смены, закрытые охраной' }).locator('tbody tr').first();
const chefText = await chefRow.innerText();
if (!chefText.replace(/\s/g, ' ').includes('3 400 ₽')) throw new Error(`Chef total is stale: ${chefText}`);
await chefRow.locator('[data-chef-period-total]').hover();
const chefTooltip = await page.locator('.finance-tooltip-portal').innerText();
if (!chefTooltip.includes('За помощь на площадке') || !chefTooltip.includes('Опоздание')) throw new Error(`Chef tooltip incomplete: ${chefTooltip}`);
await chefRow.locator('[data-action="chef-callout"]').click();
const taxiCommentInput = page.locator('input[placeholder*="позднего окончания"]');
if (await taxiCommentInput.inputValue() !== 'Такси после позднего окончания смены') throw new Error('Taxi comment field was not preserved');

await fs.mkdir('accounting-prototype/tmp/finance-comments', { recursive: true });
await page.screenshot({ path: 'accounting-prototype/tmp/finance-comments/chef.png', fullPage: true });
console.log(JSON.stringify({ bonusTooltip, taxiTooltip, cardTooltip, chefText, chefTooltip }, null, 2));
await browser.close();
