import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const keep = ['Underholdning', 'Dyrepresentasjoner', 'Kveldsforestillinger'];
const fmt = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(d);

const browser = await chromium.launch();
const page = await browser.newPage();

async function scrape(date) {
  await page.goto('https://www.dyreparken.no/dagsprogram/?dato=' + date, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('.c-tease').length > 10, null, { timeout: 45000 });
  const all = await page.$$eval('.c-tease', (cards) => cards.map((c) => {
    const q = (s) => c.querySelector(s);
    const title = q('.c-tease__title') ? q('.c-tease__title').textContent.trim() : null;
    const loc = q('.c-tease__location') ? q('.c-tease__location').textContent.trim() : '';
    const ix = loc.lastIndexOf(', ');
    const venue = ix > 0 ? loc.slice(0, ix) : loc;
    const category = ix > 0 ? loc.slice(ix + 2) : '';
    const times = Array.from(c.querySelectorAll('.c-tease__date')).map((d) => {
      const m = d.textContent.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      return m ? { from: m[1], to: m[2] } : null;
    }).filter(Boolean);
    const txt = c.textContent;
    return { title, venue, category, times, ticket: /Krever egen billett/.test(txt), weather: /temperaturforbehold/.test(txt) };
  }));
  const hours = await page.evaluate(() => {
    const body = document.body.textContent.replace(/\s+/g, ' ');
    const ix = body.indexOf('pningstider valgt dato');
    if (ix < 0) return null;
    const seg = body.slice(ix, ix + 220);
    const dp = seg.match(/Dyreparken:\s*(\d{2}[:.]\d{2})\s*-\s*(\d{2}[:.]\d{2})/);
    const bl = seg.match(/Badelandet:\s*(\d{2}[:.]\d{2})\s*-\s*(\d{2}[:.]\d{2})/);
    return {
      dyreparken: dp ? dp[1] + '\u2013' + dp[2] : null,
      badelandet: bl ? bl[1] + '\u2013' + bl[2] : null
    };
  });
  return { entries: all.filter((e) => e.title && e.times.length && keep.includes(e.category)), hours };
}

const today = fmt(new Date());
const tomorrowISO = fmt(new Date(Date.now() + 86400000));
const dayToday = await scrape(today);
let dayTomorrow = { entries: [], hours: null };
try { dayTomorrow = await scrape(tomorrowISO); } catch (e) { console.error('Klarte ikke hente morgendagen: ' + e.message); }
await browser.close();

if (!dayToday.entries.length) { console.error('Ingen oppfoeringer funnet - har dyreparken.no endret layout?'); process.exit(1); }
writeFileSync('program.json', JSON.stringify({ date: today, updated: new Date().toISOString(), entries: dayToday.entries, hours: dayToday.hours, tomorrow: { date: tomorrowISO, entries: dayTomorrow.entries, hours: dayTomorrow.hours } }, null, 1));
console.log('I dag: ' + dayToday.entries.length + ' oppfoeringer, i morgen: ' + dayTomorrow.entries.length);
