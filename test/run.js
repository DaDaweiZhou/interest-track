#!/usr/bin/env node
/*
 * 测试入口：node test/run.js（或 npm test）
 * 任意一条用例失败即以非 0 退出码结束。
 */
const { createChecker } = require('./check');

const SUITES = [
  ['smoke（基础渲染与汇总计算）', require('./suites/smoke')],
  ['bugs（缺陷复现，修复前必失败）', require('./suites/bugs')],
  ['regression（修复后的行为与常规流程）', require('./suites/regression')],
];

(async () => {
  const checker = createChecker();
  const startedAt = Date.now();

  for (const [name, run] of SUITES) {
    console.log(`\n--- ${name} ---`);
    try {
      await run(checker.check);
    } catch (err) {
      checker.check(name, '用例执行未抛异常', false, (err && err.message) || String(err));
    }
  }

  const failed = checker.failed;
  const total = checker.results.length;
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n== ${total - failed.length}/${total} passed in ${seconds}s ==`);
  if (failed.length) {
    console.log('失败用例：' + failed.map((f) => f.id).join(', '));
    process.exit(1);
  }
  process.exit(0);
})();
