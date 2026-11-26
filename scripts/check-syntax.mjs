import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import ts from 'typescript'

const roots = ['src']
const supported = new Set(['.ts', '.tsx'])
const files = []

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await walk(path)
    else if (supported.has(extname(path))) files.push(path)
  }
}

for (const root of roots) await walk(root)
let failures = 0
for (const file of files) {
  const source = await readFile(file, 'utf8')
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  for (const diagnostic of parsed.parseDiagnostics) {
    failures += 1
    const position = parsed.getLineAndCharacterOfPosition(diagnostic.start ?? 0)
    process.stderr.write(`${file}:${position.line + 1}:${position.character + 1} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}\n`)
  }
}

if (failures) process.exit(1)
process.stdout.write(`Syntax OK: ${files.length} TypeScript/TSX source files checked.\n`)
