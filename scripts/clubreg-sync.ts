// The "ClubReg sync" robot (run by .github/workflows/clubreg-sync.yml). It asks the app which events
// linked to ClubReg are due a pull, logs in to ClubReg with the organizer's own login (GitHub secrets
// CLUBREG_EMAIL and CLUBREG_PASSWORD), exports each event's participant list from Report Builder, and
// sends it to the app, which replaces the list and logs who was added and who cancelled. If a pull fails
// the app keeps the list it has. Names and emails are never printed to the log.
//
// Usage: npx tsx scripts/clubreg-sync.ts --check   (prints due=N for the workflow; skips outside 5 AM Eastern)
//        npx tsx scripts/clubreg-sync.ts           (pulls; ALL=true pulls every linked event that hasn't ended)
import { appendFileSync, readFileSync } from 'node:fs';

import { rosterFromCsv } from '../src/lib/roster';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const FUNCTION = `${env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/push-schedule`;
const KEY = env.EXPO_PUBLIC_SUPABASE_KEY;
const CLUBREG = process.env.CLUBREG_URL ?? 'https://www.clubregistration.net';
const { CLUBREG_EMAIL, CLUBREG_PASSWORD, ROSTER_SYNC_TOKEN, MANUAL, ALL } = process.env;

type Due = { eventId: string; clubregEventId: string; name: string };

async function call(body: Record<string, unknown>) {
  const res = await fetch(FUNCTION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ ...body, token: ROSTER_SYNC_TOKEN }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${body.action}: ${json.error ?? res.status}`);
  return json;
}

/** The scheduled runs fire at both 5:15 EDT and 5:15 EST times; only the one in the 5 AM hour pulls. */
function inPullHour(): boolean {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date());
  return Number(hour) === 5;
}

async function due(): Promise<Due[]> {
  return (await call({ action: 'roster-due', all: ALL === 'true' })).due;
}

/** What's on the page, for the log when a step fails: field names, checkbox labels and buttons, never values. */
async function describe(page: import('playwright').Page): Promise<string> {
  const shape = await page.evaluate(() => ({
    fields: [...document.querySelectorAll('input, select, button')].slice(0, 80).map((el) => {
      const input = el as HTMLInputElement;
      const label = (input.labels?.[0]?.textContent ?? '').trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}[${input.type ?? ''}] ${input.name ?? ''}${label ? ` "${label}"` : ''}${input.type === 'submit' || input.type === 'button' ? ` "${input.value}"` : ''}`;
    }),
    links: [...document.querySelectorAll('a')].map((a) => a.textContent?.trim() ?? '').filter((t) => /report|export|log ?in|sign ?in/i.test(t)).slice(0, 20),
  }));
  return `page ${page.url().split('?')[0]} "${await page.title()}"\n  ${shape.fields.join('\n  ')}\n  links: ${shape.links.join(' | ')}`;
}

/** Short messages shown on the page, such as a login error (no form values). */
async function notice(page: import('playwright').Page): Promise<string> {
  const text = await page.locator('.error, .alert, .message, .warning, font[color], [class*=error i], [class*=alert i]').allTextContents();
  return text.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ').slice(0, 300) || '(no message)';
}

/**
 * Where the signed-in session lives: ClubReg may move between www.clubregistration.net and
 * clubregistration.net (cookies don't carry over), and ColdFusion may keep the session in CFID/CFTOKEN
 * on the URL instead of a cookie.
 */
let session = { origin: CLUBREG, params: '' };
const signedIn = (path: string) => `${session.origin}${path}${session.params ? (path.includes('?') ? '&' : '?') + session.params : ''}`;

function rememberSession(url: string) {
  const u = new URL(url);
  const params = new URLSearchParams();
  for (const [key, value] of u.searchParams) if (/^(cfid|cftoken|jsessionid)$/i.test(key)) params.set(key, value);
  session = { origin: u.origin, params: params.toString() };
}

async function login(page: import('playwright').Page) {
  await page.goto(`${CLUBREG}/club_admin/`, { waitUntil: 'domcontentloaded' });
  let password = page.locator('input[type=password]').first();
  if (!(await password.count())) {
    const link = page.getByRole('link', { name: /log ?in|sign ?in/i }).first();
    if (await link.count()) {
      await link.click();
      await page.waitForLoadState('domcontentloaded');
      password = page.locator('input[type=password]').first();
    }
  }
  if (!(await password.count())) throw new Error(`Couldn't find ClubReg's login form.\n${await describe(page)}`);
  const form = password.locator('xpath=ancestor::form[1]');
  // ClubReg's login asks for an Account Type (driver or club); the events are under the club account.
  const accountType = form.locator('select[name=account_type]');
  if (await accountType.count()) {
    const options = await accountType.locator('option').evaluateAll((os) => os.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent?.trim() ?? '' })));
    console.log(`Account types: ${options.map((o) => `${o.label} (${o.value})`).join(', ')}`);
    const wanted = new RegExp(process.env.CLUBREG_ACCOUNT_TYPE || 'club|organi[sz]|admin', 'i');
    const club = options.find((o) => o.value && wanted.test(o.label));
    if (club) await accountType.selectOption(club.value);
  }
  // Secrets pasted into GitHub often carry a trailing line break.
  await form.locator('input[type=email], input[type=text]').first().fill((CLUBREG_EMAIL ?? '').trim());
  await password.fill((CLUBREG_PASSWORD ?? '').replace(/[\r\n]+$/, ''));
  const submit = form.locator('input[type=submit], button[type=submit], button:not([type]), input[type=image]').first();
  const navigated = page.waitForNavigation({ timeout: 20_000 }).catch(() => {});
  if (await submit.count()) await submit.click();
  else await password.press('Enter');
  await navigated;
  await page.waitForLoadState('networkidle');
  if (await page.locator('input[type=password]').count())
    throw new Error(`ClubReg login failed. Check the CLUBREG_EMAIL and CLUBREG_PASSWORD secrets in GitHub.\n${await describe(page)}\n  says: ${await notice(page)}`);
  rememberSession(page.url());
  // A session id may sit on the page's links rather than the address.
  if (!session.params) {
    const href = await page.locator('a[href*="CFID" i]').first().getAttribute('href', { timeout: 2000 }).catch(() => null);
    if (href) rememberSession(new URL(href, page.url()).toString());
  }
  console.log(`Signed in (${new URL(page.url()).pathname}${session.params ? ', session on the address' : ''})`);
}

/** Columns to tick in Report Builder (the rest are left as they are). */
const COLUMNS = [/^e-?mail/i, /^first ?name/i, /^last ?name/i, /^name$/i, /^status$/i, /^run ?group/i, /coaching/i];

async function exportList(page: import('playwright').Page, clubregEventId: string): Promise<string> {
  // Opening the event makes it ClubReg's current event, which Reports works on.
  await page.goto(signedIn(`/club_admin/event_management/event_status.cfm?event_id=${clubregEventId}`), { waitUntil: 'networkidle' });
  await page.goto(signedIn('/club_admin/reports/index.cfm'), { waitUntil: 'networkidle' });
  if (await page.locator('input[type=password]').count()) throw new Error(`ClubReg signed the robot out.\n${await describe(page)}`);
  const labels = await page.locator('input[type=checkbox]').evaluateAll((boxes) =>
    boxes.map((el) => {
      const box = el as HTMLInputElement;
      const own = box.labels?.[0]?.textContent ?? box.closest('label')?.textContent;
      const next = box.nextSibling?.textContent;
      const parent = box.parentElement && box.parentElement.querySelectorAll('input[type=checkbox]').length === 1 ? box.parentElement.textContent : '';
      return (own || next || parent || box.name || '').replace(/\s+/g, ' ').trim();
    }),
  );
  const ticked: string[] = [];
  let first: import('playwright').Locator | null = null;
  for (const [i, label] of labels.entries()) {
    if (!COLUMNS.some((c) => c.test(label))) continue;
    const box = page.locator('input[type=checkbox]').nth(i);
    if (!(await box.isVisible())) continue;
    if (!(await box.isChecked())) await box.check();
    ticked.push(label);
    first ??= box;
  }
  if (!first) throw new Error(`Couldn't find Report Builder's Email column.\n${await describe(page)}`);
  console.log(`Report Builder columns ticked: ${ticked.join(', ')}`);
  // Report Builder's own Export, in the same form as its columns (the menu has a hidden "Export All Registrants").
  const exportButton = 'input[type=submit][value*="Export" i]:visible, input[type=button][value*="Export" i]:visible, button:has-text("Export"):visible, a:has-text("Export"):visible';
  const form = first.locator('xpath=ancestor::form[1]');
  let button = form.locator(exportButton).first();
  if (!(await form.count()) || !(await button.count())) button = page.locator(exportButton).last();
  if (!(await button.count())) throw new Error(`Couldn't find Report Builder's Export button.\n${await describe(page)}`);
  console.log(`Export button: ${(await button.evaluate((el) => `${el.tagName.toLowerCase()} "${(el as HTMLInputElement).value || el.textContent || ''}"`.trim())).slice(0, 80)}`);
  // The export is a download, but allow for it opening in a new tab or replacing the page.
  const download = page.waitForEvent('download', { timeout: 60_000 }).then(async (d) => readFileSync((await d.path())!, 'utf8'));
  const popup = page.context().waitForEvent('page', { timeout: 60_000 }).then(async (p) => (await p.waitForLoadState(), p.content()));
  const same = page.waitForEvent('load', { timeout: 60_000 }).then(async () => {
    const html = await page.content();
    if (!/<table/i.test(html) || !/e-?mail/i.test(html)) throw new Error('not the export');
    return html;
  });
  // Whichever way the file comes, the other waits end in a rejection that nothing else is listening for.
  for (const wait of [download, popup, same]) wait.catch(() => {});
  await button.click();
  return Promise.any([download, popup, same]).catch(async () => {
    throw new Error(`Report Builder's Export didn't give a file.\n${await describe(page)}`);
  });
}

async function main() {
  if (process.argv.includes('--check')) {
    const list = MANUAL === 'true' || inPullHour() ? await due() : [];
    console.log(list.length ? `Due: ${list.map((d) => d.name).join(', ')}` : 'Nothing due now.');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `due=${list.length}\n`);
    return;
  }
  if (!CLUBREG_EMAIL || !CLUBREG_PASSWORD) throw new Error('Add the CLUBREG_EMAIL and CLUBREG_PASSWORD secrets in GitHub.');
  const list = await due();
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  let failed = 0;
  try {
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
    await login(page);
    for (const event of list) {
      try {
        const { rows, problem } = rosterFromCsv(await exportList(page, event.clubregEventId));
        if (problem) throw new Error(problem);
        const result = await call({ action: 'roster-pull', eventId: event.eventId, rows });
        console.log(`${event.name}: ${result.kept ? 'ClubReg gave no drivers, list kept' : `${result.total} drivers, ${result.added} new, ${result.removed} cancelled`}`);
      } catch (err) {
        failed++;
        const message = (err as Error).message;
        console.error(`${event.name}: ${message}`);
        await call({ action: 'roster-pull', eventId: event.eventId, problem: `Pull failed, list kept: ${message.split('\n')[0]}` }).catch(() => {});
      }
    }
  } catch (err) {
    // Login failed: note it on every due event so organizers see it in Admin.
    for (const event of list)
      await call({ action: 'roster-pull', eventId: event.eventId, problem: `Pull failed, list kept: ${(err as Error).message.split('\n')[0]}` }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
