const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const file = path.resolve("server/storage.ts");
const src = fs.readFileSync(file, "utf8");
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function lineOf(node) { return sf.getLineAndCharacterOfPosition(node.getStart()).line + 1; }
function endLineOf(node) { return sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1; }

let classMethods = [];
function visit(node) {
  if (ts.isClassDeclaration(node) && node.name && node.name.text === "DatabaseStorage") {
    for (const m of node.members) {
      if (ts.isMethodDeclaration(m) && m.name) {
        const name = m.name.getText();
        const isPrivate = !!m.modifiers && m.modifiers.some(mod => mod.kind === ts.SyntaxKind.PrivateKeyword);
        const bodyText = m.body ? m.body.getText() : "";
        const isDelegate = /^\{\s*return this\.\w+\.\w+\(/.test(bodyText) || /^\{\s*this\.\w+\.\w+\(/.test(bodyText);
        classMethods.push({ name, visibility: isPrivate ? "private" : "public", startLine: lineOf(m), endLine: endLineOf(m), lineCount: endLineOf(m)-lineOf(m)+1, isDelegate });
      }
    }
  }
  ts.forEachChild(node, visit);
}
visit(sf);

let callGraph = [];
function findEnclosingMethodName(node) {
  let p = node;
  while (p) { if (ts.isMethodDeclaration(p) && p.name) return p.name.getText(); p = p.parent; }
  return null;
}
function visit2(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
    callGraph.push({ caller: findEnclosingMethodName(node), callee: node.expression.name.getText(), line: lineOf(node) });
  }
  ts.forEachChild(node, visit2);
}
visit2(sf);

let transactionSites = [];
function visit3(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.getText() === "transaction") {
    transactionSites.push({ enclosingMethod: findEnclosingMethodName(node), startLine: lineOf(node) });
  }
  ts.forEachChild(node, visit3);
}
visit3(sf);

fs.writeFileSync("scratch_inventory23.json", JSON.stringify({ classMethods, callGraph, transactionSites }, null, 0));
const pub = classMethods.filter(m=>m.visibility==="public");
const priv = classMethods.filter(m=>m.visibility==="private");
const nonDelegatePub = pub.filter(m=>!m.isDelegate);
console.log("methods:", classMethods.length, "(public:", pub.length, "private:", priv.length, ")");
console.log("public non-delegate (still real implementations in monolith):", nonDelegatePub.length);
console.log("callGraph:", callGraph.length, "tx:", transactionSites.length);

const facadeCtorCount = (src.match(/new \w+Storage\(this\)/g) || []);
console.log("facade-to-domain deps:", facadeCtorCount.length, JSON.stringify(facadeCtorCount));
