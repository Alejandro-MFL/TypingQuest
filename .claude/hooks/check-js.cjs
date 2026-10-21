#!/usr/bin/env node
// Hook PostToolUse (Edit|Write): comprueba la sintaxis de archivos JavaScript
// con `node --check` en su modo REAL de ejecución. No modifica código.
// Silencioso si todo es correcto.
//
// Códigos de salida (convención de Claude Code):
//   0 → sin nada que reportar (correcto, no es JS o el archivo no existe).
//   2 → error de sintaxis: stderr se entrega a Claude como resultado del Hook.
//   1 → fallo interno del Hook (no bloqueante, solo visible para el usuario).

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
// Carpetas del proyecto que el navegador carga con <script type="module">.
const BROWSER_MODULE_DIRS = ['js'];
// Errores de CommonJS con los que Node 22 reintenta un .js sin "type" como
// módulo ES (detección de sintaxis de módulo).
const ESM_ONLY_ERRORS = [
  'Cannot use import statement outside a module',
  "Unexpected token 'export'",
  "Cannot use 'import.meta' outside a module",
  'await is only valid in async functions and the top level bodies of modules',
  "Identifier 'module' has already been declared",
  "Identifier 'exports' has already been declared",
  "Identifier 'require' has already been declared",
  "Identifier '__filename' has already been declared",
  "Identifier '__dirname' has already been declared",
];
const CHECK_TIMEOUT_MS = 10000;
const MAX_ERROR_LINES = 15;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function getFilePath(rawEvent) {
  try {
    const event = JSON.parse(rawEvent);
    const filePath = event && event.tool_input && event.tool_input.file_path;
    return typeof filePath === 'string' ? filePath : null;
  } catch {
    return null;
  }
}

function isExistingJsFile(filePath) {
  if (!JS_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return false;
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isInside(dir, filePath) {
  const relative = path.relative(dir, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

// Igual que Node: manda el package.json más cercano, tenga o no "type".
function packageType(filePath) {
  let dir = path.dirname(filePath);
  while (true) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const { type } = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        return type === 'module' || type === 'commonjs' ? type : null;
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Devuelve 'module', 'commonjs' o 'detect' (.js sin "type": decide Node 22).
function resolveMode(filePath, projectRoot) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mjs') return 'module';
  if (ext === '.cjs') return 'commonjs';
  const absolute = path.resolve(filePath);
  if (BROWSER_MODULE_DIRS.some((dir) => isInside(path.resolve(projectRoot, dir), absolute))) {
    return 'module';
  }
  return packageType(absolute) || 'detect';
}

// Argumentos separados y sin shell: la ruta nunca se interpreta como comando.
// El código va por stdin porque `node --check archivo` no permite fijar el modo.
function runCheck(mode, source, filePath) {
  const result = spawnSync(process.execPath, [`--input-type=${mode}`, '--check'], {
    input: source,
    encoding: 'utf8',
    timeout: CHECK_TIMEOUT_MS,
    windowsHide: true,
  });
  const stderr = (result.stderr || '').replace(/\[stdin\]/g, filePath);
  return { error: result.error, status: result.status, stderr };
}

// Reproduce la detección de Node 22: CommonJS salvo que el fallo se deba a
// sintaxis exclusiva de módulos ES.
function checkDetected(source, filePath) {
  const asCommonJs = runCheck('commonjs', source, filePath);
  if (asCommonJs.error || asCommonJs.status === 0) return asCommonJs;
  const isEsmSyntax = ESM_ONLY_ERRORS.some((message) => asCommonJs.stderr.includes(message));
  return isEsmSyntax ? runCheck('module', source, filePath) : asCommonJs;
}

function checkSyntax(filePath, projectRoot) {
  const source = fs.readFileSync(filePath, 'utf8');
  const mode = resolveMode(filePath, projectRoot);
  return mode === 'detect' ? checkDetected(source, filePath) : runCheck(mode, source, filePath);
}

// Descarta la traza interna de Node y la línea de versión: no ayudan a corregir.
function isUsefulLine(line) {
  return !/^\s+at /.test(line) && !/^Node\.js v\d/.test(line);
}

function formatError(filePath, stderr) {
  const details = stderr.trim().split(/\r?\n/).filter(isUsefulLine)
    .slice(0, MAX_ERROR_LINES).join('\n').trim();
  return `[check-js] Error de sintaxis en ${filePath}\n${details}\n` +
    '[check-js] Corrige el error antes de continuar.\n';
}

function main() {
  const filePath = getFilePath(readStdin());
  if (!filePath || !isExistingJsFile(filePath)) return 0;

  const projectRoot = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
  const result = checkSyntax(filePath, projectRoot);
  if (result.error) {
    process.stderr.write(`[check-js] No se pudo ejecutar node --check: ${result.error.message}\n`);
    return 1;
  }
  if (result.status === 0) return 0;

  process.stderr.write(formatError(filePath, result.stderr));
  return 2;
}

process.exitCode = main();
