/*
 * 基础用例：页面能无错加载、示例数据与汇总口径正确、表格与目标价表渲染完整。
 */
const H = require('../harness');

const SAMPLE = [
  { id: 'h1', code: '600519', name: '贵州茅台', quantity: 100, costPrice: 1500, currentPrice: 1356.31, prevClose: 1343, dividendYield: 3.84 },
  { id: 'h2', code: '601398', name: '工商银行', quantity: 5000, costPrice: 4.8, currentPrice: 5.32, prevClose: 5.25, dividendYield: 5.2 },
  { id: 'h3', code: '600900', name: '长江电力', quantity: 800, costPrice: 20.5, currentPrice: 24.3, prevClose: 24.1, dividendYield: 3.57 },
  { id: 'h4', code: '300750', name: '宁德时代', quantity: 200, costPrice: 220, currentPrice: 186.5, prevClose: 185.2, dividendYield: 1.2 },
];

module.exports = async function run(check) {
  const app = await H.load({ storage: { stock_holdings_v1: JSON.stringify(SAMPLE) } });
  const { window } = app;

  check('S1', '页面加载无 JS 报错', app.errors.length === 0, app.errors.join(' | ').slice(0, 200));
  check('S2', '持仓表渲染 4 行', H.rows(window, '#tbody tr').length === 4, `实际 ${H.rows(window, '#tbody tr').length} 行`);
  check('S3', '目标价表渲染 4 行', H.rows(window, '#targetTbody tr').length === 4, `实际 ${H.rows(window, '#targetTbody tr').length} 行`);

  // 汇总口径（与 design.md §3.2 公式一致）
  const expect = {
    '#sumMarketValue': '218,971.00',   // Σ 数量 × 现价
    '#sumCost': '234,400.00',          // Σ 数量 × 成本价
    '#sumProfit': '-15,429.00',        // 市值 − 成本
    '#sumDayProfit': '2,101.00',       // Σ (现价 − 昨收) × 数量
    '#sumDividend': '7,733.04',        // Σ 市值 × 股息率
    '#sumYield': '3.53%',              // 总分红 ÷ 总市值
  };
  Object.keys(expect).forEach(function (sel) {
    const actual = H.text(window, sel);
    check('S4' + sel.replace('#sum', '-'), `汇总 ${sel.slice(4)} 计算正确`, actual === expect[sel], `实际 ${actual}，期望 ${expect[sel]}`);
  });

  // 空状态
  const empty = await H.load();
  check('S5', '无数据时显示空状态引导', empty.window.document.querySelector('#emptyState').style.display !== 'none'
    && empty.window.document.querySelector('#tableWrap').style.display === 'none');
  check('S6', '空数据时汇总为 0', H.text(empty.window, '#sumMarketValue') === '0.00' && H.text(empty.window, '#sumDayProfit') === '0.00',
    `市值=${H.text(empty.window, '#sumMarketValue')}`);
  empty.window.close();

  // 载入示例数据按钮
  const sampleApp = await H.load();
  H.click(sampleApp.window, '#btnSample');
  check('S7', '「载入示例数据」写入 4 条持仓并渲染',
    JSON.parse(sampleApp.window.localStorage.getItem('stock_holdings_v1')).length === 4 && H.rows(sampleApp.window, '#tbody tr').length === 4);
  sampleApp.window.close();

  window.close();
};
