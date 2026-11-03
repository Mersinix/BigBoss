const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const dir = "server/storage/domains";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".storage.ts"));

for (const f of files) {
  const full = path.join(dir, f);
  const src = fs.readFileSync(full, "utf8");
  const lines = src.split(/\r?\n/).length;
  const sf = ts.createSourceFile(full, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let className = null;
  let pub = 0, priv = 0, hasFacadeCtor = false;
  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name) {
      className = node.name.text;
      for (const m of node.members) {
        if (ts.isMethodDeclaration(m) && m.name) {
          const isPrivate = !!m.modifiers && m.modifiers.some(mo => mo.kind === ts.SyntaxKind.PrivateKeyword);
          if (isPrivate) priv++; else pub++;
        }
        if (ts.isConstructorDeclaration(m)) hasFacadeCtor = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  console.log(f.padEnd(38), (className||"?").padEnd(28), "pub:", String(pub).padStart(3), "priv:", String(priv).padStart(2), "lines:", String(lines).padStart(4), "facadeCtor:", hasFacadeCtor);
}
