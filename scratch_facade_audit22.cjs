const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const domainsDir = "server/storage/domains";
const domainFiles = fs.readdirSync(domainsDir).filter(f => f.endsWith(".storage.ts"));

const classMethodsByClass = {};
for (const f of domainFiles) {
  const full = path.join(domainsDir, f);
  const src = fs.readFileSync(full, "utf8");
  const sf = ts.createSourceFile(full, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name) {
      const methods = node.members
        .filter(m => ts.isMethodDeclaration(m) && m.name)
        .map(m => m.name.getText());
      classMethodsByClass[node.name.text] = { file: f, methods };
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

const storagePath = "server/storage.ts";
const src = fs.readFileSync(storagePath, "utf8");
const sf = ts.createSourceFile(storagePath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

// field -> className
const fieldToClass = {};
const fieldDeclRe = /private readonly (\w+) = new (\w+)\(/g;
let m;
while ((m = fieldDeclRe.exec(src))) {
  fieldToClass[m[1]] = m[2];
}

console.log("=== Field -> Class mapping ===");
for (const [field, cls] of Object.entries(fieldToClass)) {
  const known = classMethodsByClass[cls] ? "OK" : "MISSING CLASS DEFINITION";
  console.log(field.padEnd(28), "->", cls.padEnd(28), known);
}

// Now find DatabaseStorage class and all its methods + bodies calling this.<field>.<method>
let dbStorageMethods = [];
function visit2(node) {
  if (ts.isClassDeclaration(node) && node.name && node.name.text === "DatabaseStorage") {
    for (const mem of node.members) {
      if (ts.isMethodDeclaration(mem) && mem.name) {
        const bodyText = mem.body ? mem.body.getText() : "";
        const call = bodyText.match(/this\.(\w+)\.(\w+)\(/);
        if (call) {
          dbStorageMethods.push({ delegateName: mem.name.getText(), field: call[1], calledMethod: call[2] });
        }
      }
    }
  }
  ts.forEachChild(node, visit2);
}
visit2(sf);

console.log("\n=== Delegate consistency check ===");
let mismatches = 0;
for (const d of dbStorageMethods) {
  const cls = fieldToClass[d.field];
  if (!cls) {
    console.log(`MISMATCH: ${d.delegateName} -> this.${d.field}.${d.calledMethod}() but field '${d.field}' has no known class`);
    mismatches++;
    continue;
  }
  const classInfo = classMethodsByClass[cls];
  if (!classInfo.methods.includes(d.calledMethod)) {
    console.log(`MISMATCH: ${d.delegateName} -> this.${d.field}.${d.calledMethod}() but ${cls} (${classInfo.file}) has no method '${d.calledMethod}'`);
    mismatches++;
    continue;
  }
  if (d.delegateName !== d.calledMethod) {
    console.log(`NAME DRIFT (not necessarily wrong, flagging): facade method '${d.delegateName}' delegates to '${cls}.${d.calledMethod}' (different name)`);
  }
}
console.log(`\nTotal delegate methods found: ${dbStorageMethods.length}`);
console.log(`Total mismatches: ${mismatches}`);

// Reverse check: every public method in every domain class should have exactly one delegate calling it
console.log("\n=== Reverse check: every domain class public method has exactly one delegate ===");
for (const [cls, info] of Object.entries(classMethodsByClass)) {
  for (const methodName of info.methods) {
    const callers = dbStorageMethods.filter(d => d.calledMethod === methodName && fieldToClass[d.field] === cls);
    if (callers.length === 0) {
      console.log(`NO DELEGATE: ${cls}.${methodName} (${info.file}) has no DatabaseStorage delegate calling it`);
    } else if (callers.length > 1) {
      console.log(`DUPLICATE DELEGATES: ${cls}.${methodName} is called by ${callers.length} different facade methods: ${callers.map(c => c.delegateName).join(", ")}`);
    }
  }
}
console.log("\nDone.");
