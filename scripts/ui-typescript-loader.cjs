// Test-harness-only loader; avoids spawning compiler children on restricted Windows hosts.
const ts = require("typescript");
module.exports = function (source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
};
