// Hook-order audit — finds components that return early ABOVE a later hook.
//
// The shape this catches: a screen guards with
//   if (!isLoading && !isPlus) return <Redirect to="/upgrade" />;
// placed above a trailing hook (often a useCallback that reads like a plain
// handler). The first render, taken while entitlements load, runs the full
// hook list; when the snapshot resolves locked the guard fires, the hook below
// never runs, and React throws "Rendered fewer hooks than expected" — a blank
// screen instead of the paywall. No jsdom suite can see it (it needs two real
// renders), so this static audit is the cheap net.
//
// Grep cannot do this job: hooks inside useEffect cleanups and other closures
// are false positives, and a `return` inside a nested function is not an early
// return. This walks the real TypeScript AST and skips nested functions.
//
// Usage (from repo root):
//   NODE_PATH=node_modules/.pnpm/typescript@5.9.3/node_modules \
//     node qa/hook-order-audit.cjs artifacts/gujarati-coach/src/pages/games
// Pass any number of directories; non-recursive, so pass each directory.
// Exits 0 and prints nothing when clean.
const ts = require("typescript");
const fs = require("fs"), path = require("path");
const dirs = process.argv.slice(2);
const files = [];
for (const d of dirs) for (const f of fs.readdirSync(d)) if (/\.tsx$/.test(f)) files.push(path.join(d,f));
const isHook = (n) => ts.isCallExpression(n) && ((ts.isIdentifier(n.expression) && /^use[A-Z]/.test(n.expression.text)) || (ts.isPropertyAccessExpression(n.expression) && /^use[A-Z]/.test(n.expression.name.text)));
function hooksIn(node, sf){ // hook calls NOT nested inside another function
  const out=[];
  (function walk(n){
    if (n!==node && (ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n))) return;
    if (isHook(n)) out.push(sf.getLineAndCharacterOfPosition(n.getStart()).line+1 + ": " + n.expression.getText());
    ts.forEachChild(n, walk);
  })(node);
  return out;
}
for (const file of files){
  const sf = ts.createSourceFile(file, fs.readFileSync(file,"utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const comps=[];
  (function collect(n){
    if ((ts.isFunctionDeclaration(n)||ts.isVariableStatement(n)) ) {
      if (ts.isFunctionDeclaration(n) && n.name && /^[A-Z]/.test(n.name.text) && n.body) comps.push([n.name.text,n.body]);
      if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (d.name.getText().match(/^[A-Z]/) && d.initializer && (ts.isArrowFunction(d.initializer)||ts.isFunctionExpression(d.initializer)) && d.initializer.body && ts.isBlock(d.initializer.body)) comps.push([d.name.getText(), d.initializer.body]);
    }
    ts.forEachChild(n, collect);
  })(sf);
  for (const [name, body] of comps){
    const stmts = body.statements;
    let firstEarly = -1;
    for (let i=0;i<stmts.length;i++){
      const s = stmts[i];
      let has=false;
      if (ts.isIfStatement(s)) { (function w(n){ if (ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)) return; if (ts.isReturnStatement(n)) has=true; ts.forEachChild(n,w); })(s.thenStatement); if(s.elseStatement){(function w(n){ if (ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)) return; if (ts.isReturnStatement(n)) has=true; ts.forEachChild(n,w);})(s.elseStatement);} }
      if (has){ firstEarly=i; break; }
    }
    if (firstEarly<0) continue;
    const after=[];
    for (let i=firstEarly+1;i<stmts.length;i++) after.push(...hooksIn(stmts[i], sf));
    const line = sf.getLineAndCharacterOfPosition(stmts[firstEarly].getStart()).line+1;
    if (after.length) {
      console.log(`VIOLATION ${file} :: ${name}  conditional return at line ${line}`);
      for (const a of after) console.log(`    hook after -> ${a}`);
    }
  }
}
