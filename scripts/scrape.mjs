import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date());
const url = 'https://www.dyreparken.no/dagsprogram/?dato=' + date;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
await browser.close();

const keep = ['Underholdning', 'Dyrepresentasjoner', 'Kveldsforestillinger'];
const entries = all.filter((e) => e.title && e.times.length && keep.includes(e.category));
if (!entries.length) { console.error('Ingen oppfoeringer funnet - har dyreparken.no endret layout?'); process.exit(1); }
writeFileSync('program.json', JSON.stringify({ date, updated: new Date().toISOString(), entries }, null, 1));
console.log('Skrev ' + entries.length + ' oppfoeringer for ' + date);
