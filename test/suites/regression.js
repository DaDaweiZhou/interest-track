/*
 * 回归用例：修复后的行为 + 常规端到端流程（含真实 GBK 名称、导入导出、自动/手动刷新）。
 */
const H = require('../harness');

const q = (code, name, price, prev, dy, chg) => ({ code, name, price, prev, dy, chg });
const seedH = (arr) => ({ stock_holdings_v1: JSON.stringify(arr) });
const seedW = (arr) => ({ stock_watchlist_v1: JSON.stringify(arr) });

/* 1. 静默刷新：编辑中的那一条跳过，其余照常更新；取消后恢复 */
async function r1(check) {
  const app = await H.load({
    storage: seedH([
      { id: 'h1', code: '600519', name: 'A', quantity: 100, costPrice: 50, currentPrice: 100, prevClose: 90, dividendYield: 3 },
      { id: 'h2', code: '601398', name: 'B', quantity: 1000, costPrice: 4, currentPrice: 5, prevClose: 4.8, dividendYield: 5 },
    ]),
    quotes: { 600519: [q('600519', 'A', 200, 90, 3), q('600519', 'A', 300, 90, 3)], 601398: [q('601398', 'B', 9, 8, 5), q('601398', 'B', 9, 8, 5)] },
  });
  const { window } = app;
  H.click(window, '#tbody tr:first-child button[data-action="edit"]');
  await H.tick(window, 5600);
  let stored = JSON.parse(window.localStorage.getItem('stock_holdings_v1'));
  const editing = stored.find((r) => r.id === 'h1');
  const other = stored.find((r) => r.id === 'h2');
  check('R1', '自动刷新跳过编辑行、更新其它行', editing.currentPrice === 100 && other.currentPrice === 9,
    `编辑行现价=${editing.currentPrice}（应保持 100）, 其它行现价=${other.currentPrice}（应为 9）`);

  H.click(window, '#tbody tr.editing button[data-action="cancel"]');
  await H.tick(window, 5600);
  stored = JSON.parse(window.localStorage.getItem('stock_holdings_v1'));
  const afterCancel = stored.find((r) => r.id === 'h1').currentPrice;
  check('R2', '取消编辑后该行恢复刷新', afterCancel === 200,
    `取消后现价=${afterCancel}（应从 100 更新为 200）`);
  window.close();
}

/* 3. 静默刷新不吞掉正在输入的内容 */
async function r3(check) {
  const app = await H.load({
    storage: seedH([{ id: 'h1', code: '600519', name: 'A', quantity: 100, costPrice: 50, currentPrice: 100, prevClose: 90, dividendYield: 3 }]),
    quotes: { 600519: q('600519', 'A', 110, 90, 3) },
  });
  const { window } = app;
  H.click(window, '#tbody tr:first-child button[data-action="edit"]');
  const inp = window.document.querySelector('#tbody input[data-field="quantity"]');
  inp.value = '777';
  const nameInp = window.document.querySelector('#tbody input[data-field="name"]');
  nameInp.value = '手输名称';
  await H.tick(window, 5600);
  const q2 = window.document.querySelector('#tbody input[data-field="quantity"]');
  const n2 = window.document.querySelector('#tbody input[data-field="name"]');
  check('R3', '自动刷新期间保留未保存的输入', q2 && q2.value === '777' && n2 && n2.value === '手输名称',
    `数量=${q2 && q2.value}, 名称=${n2 && n2.value}`);
  window.close();
}

/* 4. 零/负成本价时盈亏率显示 --，正常成本价仍显示百分比 */
async function r4(check) {
  const app = await H.load({
    storage: seedH([
      { id: 'z', code: '600519', name: 'ZERO', quantity: 100, costPrice: 0, currentPrice: 10, prevClose: 10, dividendYield: 3 },
      { id: 'n', code: '601398', name: 'NEG', quantity: 100, costPrice: -5, currentPrice: 10, prevClose: 10, dividendYield: 3 },
      { id: 'p', code: '600900', name: 'POS', quantity: 100, costPrice: 8, currentPrice: 10, prevClose: 10, dividendYield: 3 },
    ]),
    quotes: {},
  });
  const { window } = app;
  const rateOf = (name) => {
    const row = H.rows(window, '#tbody tr').find((tr) => tr.children[1].textContent.trim() === name);
    return row ? row.children[9].textContent.trim() : '(no row)';
  };
  check('R4', '成本价<=0 时盈亏率显示 --，>0 时正常', rateOf('ZERO') === '--' && rateOf('NEG') === '--' && rateOf('POS') === '+25.00%',
    `0成本=${rateOf('ZERO')}, 负成本=${rateOf('NEG')}, 正常=${rateOf('POS')}`);
  window.close();
}

/* 5. 正常添加流程：查询得到的昨收价写入记录，当日盈亏正确 */
async function r5(check) {
  const app = await H.load({ quotes: { 600519: q('600519', '贵州茅台', 100, 90, 3.5) } });
  const { window } = app;
  H.setVal(window, '#code', '600519');
  H.click(window, '#btnQuery');
  await H.tick(window, 40);
  H.setVal(window, '#quantity', '1000');
  H.setVal(window, '#costPrice', '80');
  H.submit(window, '#addForm');
  await H.tick(window, 0);
  const rec = JSON.parse(window.localStorage.getItem('stock_holdings_v1'))[0];
  const day = H.text(window, '#sumDayProfit');
  check('R5', '查询→添加 保留昨收价且当日盈亏正确', rec.prevClose === 90 && day === '10,000.00' && rec.name === '贵州茅台',
    `prevClose=${rec.prevClose}, name=${rec.name}, 当日盈亏=${day}`);
  window.close();
}

/* 6. 自动刷新端到端更新价格与汇总 */
async function r6(check) {
  const app = await H.load({
    storage: seedH([{ id: 'h1', code: '600519', name: 'A', quantity: 100, costPrice: 50, currentPrice: 100, prevClose: 90, dividendYield: 3 }]),
    quotes: { 600519: [q('600519', 'A', 110, 90, 4), q('600519', 'A', 110, 90, 4)] },
  });
  const { window } = app;
  const before = H.text(window, '#sumMarketValue');
  await H.tick(window, 5600);
  const after = H.text(window, '#sumMarketValue');
  const day = H.text(window, '#sumDayProfit');
  const dy = H.text(window, '#sumYield');
  check('R6', '自动刷新更新市值/当日盈亏/股息率', before === '10,000.00' && after === '11,000.00' && day === '2,000.00' && dy === '4.00%',
    `市值 ${before} -> ${after}, 当日盈亏=${day}, 加权股息率=${dy}`);
  window.close();
}

/* 7. 导入导出的数据结构可回灌，且恶意 id 被替换 */
async function r7(check) {
  const app = await H.load({
    quotes: {},
    storage: seedH([{ id: 'h1', code: '600519', name: 'A', quantity: 100, costPrice: 50, currentPrice: 100, prevClose: 90, dividendYield: 3 }]),
  });
  const { window } = app;
  const payload = JSON.stringify({
    exportedAt: new Date().toISOString(),
    holdings: [{ id: 'bad"id', code: '601398', name: 'B', quantity: 200, costPrice: 4, currentPrice: 5, prevClose: 4.5, dividendYield: 5 }],
    watchlist: [{ id: 'w"1', code: '600900', name: 'C', currentPrice: 20, prevClose: 19, dividendYield: 3 }],
  });
  const file = new window.File([payload], 'd.json', { type: 'application/json' });
  const input = window.document.querySelector('#fileInput');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await H.tick(window, 80);
  const hs = JSON.parse(window.localStorage.getItem('stock_holdings_v1'));
  const ws = JSON.parse(window.localStorage.getItem('stock_watchlist_v1'));
  const errorsBefore = app.errors.length;
  H.click(window, '.tab[data-tab="watch"]');
  H.setVal(window, '#wSearch', '6');
  H.setVal(window, '#search', '6');
  const ok = hs.length === 1 && ws.length === 1 && /^[A-Za-z0-9_-]+$/.test(hs[0].id) && /^[A-Za-z0-9_-]+$/.test(ws[0].id) && app.errors.length === errorsBefore;
  check('R7', '导入覆盖数据 + 非法 id 被替换 + 搜索不报错', ok,
    `持仓id=${hs[0].id}, 关注id=${ws[0].id}, errors=${app.errors.length - errorsBefore}`);
  window.close();
}

/* 8. 目标价表正常行仍是 9 列且计算正确（现价100 股息3.5% → 5.0% 档 = 70） */
async function r8(check) {
  const app = await H.load({
    storage: seedH([{ id: 'h1', code: '600519', name: 'A', quantity: 100, costPrice: 50, currentPrice: 100, prevClose: 90, dividendYield: 3.5 }]),
    quotes: {},
  });
  const { window } = app;
  const tds = H.rows(window, '#targetTbody tr:first-child td');
  check('R8', '目标价表列数与档位计算正确', tds.length === 9 && tds[1].textContent.indexOf('70.00') > -1,
    `td数=${tds.length}, 5.0%档=${tds[1].textContent.trim()}`);
  window.close();
}

/* 9. 手动刷新：按钮恢复可用且编辑内容保留 */
async function r9(check) {
  const app = await H.load({
    storage: seedH([{ id: 'h1', code: '600519', name: 'A', quantity: 100, costPrice: 50, currentPrice: 100, prevClose: 90, dividendYield: 3 }]),
    quotes: { 600519: 'NOTFOUND', 601398: 'NOTFOUND' },
  });
  const { window } = app;
  H.click(window, '#btnRefresh');
  await H.tick(window, 200);
  const btn = window.document.querySelector('#btnRefresh');
  check('R9', '刷新失败后按钮仍可再次点击', btn.disabled === false && btn.textContent === '刷新行情',
    `disabled=${btn.disabled}, text=${btn.textContent}`);
  window.close();
}

/* 10. 搜索过滤仍然正常（持仓 + 关注） */
async function r10(check) {
  const app = await H.load({
    storage: Object.assign(seedH([
      { id: 'h1', code: '600519', name: '贵州茅台', quantity: 100, costPrice: 50, currentPrice: 100, prevClose: 90, dividendYield: 3 },
      { id: 'h2', code: '601398', name: '工商银行', quantity: 100, costPrice: 5, currentPrice: 5, prevClose: 5, dividendYield: 5 },
    ]), seedW([{ id: 'w1', code: '000858', name: '五粮液', currentPrice: 20, prevClose: 19, dividendYield: 3, changePercent: 1 }])),
    quotes: {},
  });
  const { window } = app;
  H.setVal(window, '#search', '茅台');
  const byName = H.rows(window, '#tbody tr').length;
  H.setVal(window, '#search', '601');
  const byCode = H.rows(window, '#tbody tr').length;
  H.click(window, '.tab[data-tab="watch"]');
  H.setVal(window, '#wSearch', '五粮');
  const watchRows = H.rows(window, '#wTbody tr').length;
  check('R10', '按名称/代码前缀过滤持仓与关注', byName === 1 && byCode === 1 && watchRows === 1,
    `名称=${byName}, 代码=${byCode}, 关注=${watchRows}`);
  window.close();
}

/* 11. 关注表单：手工改代码后不沿用上一只股票的涨跌幅 */
async function r11(check) {
  const app = await H.load({ quotes: { 600519: q('600519', 'A', 100, 90, 3, 11.11) } });
  const { window } = app;
  H.click(window, '.tab[data-tab="watch"]');
  H.setVal(window, '#wCode', '600519');
  H.click(window, '#btnWQuery');
  await H.tick(window, 40);
  H.setVal(window, '#wCode', '601398');
  H.setVal(window, '#wName', 'B');
  H.setVal(window, '#wPrice', '5');
  H.submit(window, '#watchForm');
  await H.tick(window, 0);
  const rec = JSON.parse(window.localStorage.getItem('stock_watchlist_v1'))[0];
  check('R11', '关注手工改代码后不沿用旧涨跌幅', rec.changePercent === 0 && rec.prevClose === 5,
    `changePercent=${rec.changePercent}, prevClose=${rec.prevClose}`);
  window.close();
}

/* 12. 定时刷新重绘后，编辑框的焦点与光标位置不丢失 */
async function r12(check) {
  const app = await H.load({
    storage: seedH([{ id: 'h1', code: '600519', name: 'A', quantity: 100, costPrice: 50, currentPrice: 100, prevClose: 90, dividendYield: 3 }]),
    quotes: { 600519: q('600519', 'A', 120, 90, 3) },
  });
  const { window } = app;
  H.click(window, '#tbody tr:first-child button[data-action="edit"]');
  let inp = window.document.querySelector('#tbody input[data-field="quantity"]');
  inp.focus();
  inp.value = '777';
  inp.setSelectionRange(2, 2);
  const focusedBefore = window.document.activeElement === inp;
  await H.tick(window, 5600);
  inp = window.document.querySelector('#tbody input[data-field="quantity"]');
  const focusedAfter = window.document.activeElement === inp;
  check('R12', '定时刷新重绘后编辑框焦点与光标保留',
    focusedBefore && focusedAfter && inp.value === '777' && inp.selectionStart === 2,
    `刷新前聚焦=${focusedBefore}, 刷新后聚焦=${focusedAfter}, 值=${inp.value}, 光标=${inp.selectionStart}`);
  window.close();
}

/* 13. 手动「刷新行情」端到端更新价格并恢复按钮 */
async function r13(check) {
  const app = await H.load({
    storage: seedH([{ id: 'h1', code: '600519', name: 'A', quantity: 100, costPrice: 50, currentPrice: 100, prevClose: 90, dividendYield: 3 }]),
    quotes: { 600519: q('600519', 'A', 130, 95, 4.5) },
  });
  const { window } = app;
  H.click(window, '#btnRefresh');
  await H.tick(window, 300);
  const stored = JSON.parse(window.localStorage.getItem('stock_holdings_v1'))[0];
  const btn = window.document.querySelector('#btnRefresh');
  check('R13', '手动刷新更新行情并恢复按钮', stored.currentPrice === 130 && stored.prevClose === 95 && stored.dividendYield === 4.5 &&
    btn.disabled === false && btn.textContent === '刷新行情' && H.text(window, '#sumMarketValue') === '13,000.00',
    `现价=${stored.currentPrice}, 昨收=${stored.prevClose}, 股息率=${stored.dividendYield}, 按钮=${btn.textContent}/${btn.disabled}, 市值=${H.text(window, '#sumMarketValue')}`);
  window.close();
}

module.exports = async function run(check) {
  for (const fn of [r1, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13]) { await fn(check); }
};
