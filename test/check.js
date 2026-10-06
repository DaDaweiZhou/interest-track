/*
 * 极简断言收集器。
 * 各用例文件导出 run(check)，用 check(id, 描述, 是否通过, 详情) 上报结果。
 */
function createChecker() {
  const results = [];
  const color = process.stdout.isTTY;
  const paint = (code, s) => (color ? `\u001b[${code}m${s}\u001b[0m` : s);

  function check(id, desc, pass, detail) {
    results.push({ id, desc, pass: !!pass });
    const line = `${pass ? 'PASS' : 'FAIL'}  ${id}  ${desc}${detail ? '  :: ' + detail : ''}`;
    console.log(pass ? paint(32, line) : paint(31, line));
  }

  return {
    check,
    results,
    get failed() { return results.filter((r) => !r.pass); },
  };
}

module.exports = { createChecker };
