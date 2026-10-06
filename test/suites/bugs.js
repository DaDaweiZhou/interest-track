/*
 * 缺陷复现用例。
 * 这些用例在提交 212bca6（修复）之前全部失败，用于防止回归。
 */
const H = require('../harness');

const q = (code, name, price, prev, dy) => ({ code, name, price, prev, dy });

async function test1_editKeepsPrevClose(check) {
  const app = await H.load();
  const { window } = app;
  H.click(window, '#btnSample');
  const before = H.text(window, '#sumDayProfit');
  H.click(window, '#tbody tr:first-child button[data-action="edit"]');
  H.click(window, '#tbody tr:first-child button[data-action="save"]');
  await H.tick(window, 0);
  const after = H.text(window, '#sumDayProfit');
  const stored = JSON.parse(window.localStorage.getItem('stock_holdings_v1'));
  const rec = stored.find((r) => r.code === '600519');
  check('BUG-1', '编辑持仓后 当日盈亏/prevClose 保留', after === before && rec.prevClose === 1343,
    `汇总当日盈亏 ${before} -> ${after}; 600519.prevClose=${JSON.stringify(rec.prevClose)}`);
  window.close();
}

async function test2_staleHiddenPrevClose(check) {
  const app = await H.load({ quotes: { 600519: q('600519', 'MT', 100, 90, 3) } });
  const { window } = app;
  H.setVal(window, '#code', '600519');
  H.click(window, '#btnQuery');
  await H.tick(window, 30);
  // user switches to a different stock by hand, without re-querying
  H.setVal(window, '#code', '601398');
  H.setVal(window, '#name', 'ICBC');
  H.setVal(window, '#currentPrice', '5.32');
  H.setVal(window, '#quantity', '1000');
  H.setVal(window, '#costPrice', '4.8');
  H.submit(window, '#addForm');
  await H.tick(window, 0);
  const stored = JSON.parse(window.localStorage.getItem('stock_holdings_v1') || '[]');
  const rec = stored.find((r) => r.code === '601398');
  const dayProfit = rec ? (Number(rec.currentPrice) - Number(rec.prevClose)) * rec.quantity : NaN;
  check('BUG-2', '手工改代码后不沿用上一只股票的昨收价', !!rec && rec.prevClose === 5.32,
    `601398.prevClose=${rec && rec.prevClose}, 当日盈亏=${dayProfit}`);
  window.close();
}

async function test3_nonStringName(check) {
  const app = await H.load({
    storage: {
      stock_holdings_v1: JSON.stringify([
        { id: 'a1', code: '600519', name: 123, quantity: 100, costPrice: 1, currentPrice: 2, prevClose: 1, dividendYield: 3 },
      ]),
    },
  });
  const { window } = app;
  const before = app.errors.length;
  H.setVal(window, '#search', '600');
  await H.tick(window, 0);
  const newErr = app.errors.slice(before);
  check('BUG-3', '搜索时 name 非字符串不崩溃', newErr.length === 0 && H.rows(window, '#tbody tr').length === 1,
    `errors=${JSON.stringify(newErr).slice(0, 120)}`);
  window.close();
}

async function test3b_importNonStringName(check) {
  const app = await H.load({ quotes: {} });
  const { window } = app;
  const payload = JSON.stringify({ holdings: [{ code: '600519', name: 42, quantity: 100, costPrice: 1, currentPrice: 2 }], watchlist: [] });
  const file = new window.File([payload], 'd.json', { type: 'application/json' });
  const input = window.document.querySelector('#fileInput');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await H.tick(window, 60);
  const before = app.errors.length;
  H.setVal(window, '#search', '6');
  await H.tick(window, 0);
  const stored = JSON.parse(window.localStorage.getItem('stock_holdings_v1') || '[]');
  check('BUG-3b', '导入非字符串 name 后搜索不崩溃', app.errors.length === before && typeof stored[0].name === 'string',
    `name=${JSON.stringify(stored[0] && stored[0].name)} errors=${JSON.stringify(app.errors.slice(before)).slice(0, 100)}`);
  window.close();
}

async function test4_refreshFrozenWhileEditing(check) {
  const app = await H.load({ quotes: { 600519: q('600519', 'MT', 1, 1, 1) } });
  const { window } = app;
  H.click(window, '#btnSample');
  H.click(window, '#tbody tr:first-child button[data-action="edit"]');
  H.click(window, '.tab[data-tab="watch"]');
  const before = app.calls.length;
  await H.tick(window, 5600);
  const after = app.calls.length;
  check('BUG-4a', '切到「关注」页后自动刷新仍然工作', after > before, `5.6s 内行情请求数 = ${after - before}`);
  window.close();
}

async function test4b_filteredEditRow(check) {
  const app = await H.load({ quotes: { 600519: q('600519', 'MT', 1, 1, 1) } });
  const { window } = app;
  H.click(window, '#btnSample');
  H.click(window, '#tbody tr:first-child button[data-action="edit"]'); // 贵州茅台
  H.setVal(window, '#search', '宁'); // filters the editing row out
  const before = app.calls.length;
  await H.tick(window, 5600);
  const after = app.calls.length;
  check('BUG-4b', '编辑行被搜索过滤后自动刷新仍然工作', after > before, `5.6s 内行情请求数 = ${after - before}`);
  window.close();
}

async function test5_manualRefreshKeepsTypedEdit(check) {
  const app = await H.load({ quotes: { 600519: q('600519', 'MT', 1, 1, 1) } });
  const { window } = app;
  H.click(window, '#btnSample');
  H.click(window, '#tbody tr:first-child button[data-action="edit"]');
  const inp = window.document.querySelector('#tbody tr[data-id] input[data-field="quantity"]');
  inp.value = '200';
  H.click(window, '#btnRefresh');
  await H.tick(window, 300);
  const after = window.document.querySelector('#tbody tr.editing input[data-field="quantity"]');
  check('BUG-5', '点「刷新行情」不清掉正在编辑的输入', !!after && after.value === '200',
    `编辑框数量 = ${after ? after.value : '(编辑框已消失)'}`);
  window.close();
}

async function test6_visibilityRespectsAutoOff(check) {
  const app = await H.load({ quotes: { 600519: q('600519', 'MT', 1, 1, 1) } });
  const { window } = app;
  H.click(window, '#btnSample');
  H.click(window, '#btnAuto'); // turn auto refresh OFF
  await H.tick(window, 20);
  const before = app.calls.length;
  Object.defineProperty(window.document, 'hidden', { value: true, configurable: true });
  window.document.dispatchEvent(new window.Event('visibilitychange'));
  Object.defineProperty(window.document, 'hidden', { value: false, configurable: true });
  window.document.dispatchEvent(new window.Event('visibilitychange'));
  await H.tick(window, 200);
  check('BUG-7a', '关闭自动刷新后，切回标签页不发请求', app.calls.length === before,
    `切回页面触发请求数 = ${app.calls.length - before}`);
  window.close();
}

async function test7_zeroYieldColspan(check) {
  const app = await H.load({
    storage: {
      stock_holdings_v1: JSON.stringify([
        { id: 'z1', code: '600519', name: 'ZERO', quantity: 100, costPrice: 1, currentPrice: 10, prevClose: 10, dividendYield: 0 },
      ]),
    },
  });
  const { window } = app;
  const tds = H.rows(window, '#targetTbody tr:first-child td');
  check('BUG-6', '无股息数据行与表头列数对齐', tds.length === 9, `该行 td 数 = ${tds.length}`);
  window.close();
}

module.exports = async function run(check) {
  await test1_editKeepsPrevClose(check);
  await test2_staleHiddenPrevClose(check);
  await test3_nonStringName(check);
  await test3b_importNonStringName(check);
  await test4_refreshFrozenWhileEditing(check);
  await test4b_filteredEditRow(check);
  await test5_manualRefreshKeepsTypedEdit(check);
  await test6_visibilityRespectsAutoOff(check);
  await test7_zeroYieldColspan(check);
};
