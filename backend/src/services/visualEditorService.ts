import { AppDataSource } from '../config/typeorm';
import { VisualEditorBlueprint } from '../models/visualEditorBlueprint.entity';
import { VisualEditorLibrary } from '../models/visualEditorLibrary.entity';

export interface BlockField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'variable' | 'expression' | 'json';
  default?: string | number | boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
  helpText?: string;
}

export interface BlockDefinition {
  type: string;
  category: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  canHaveChildren: boolean;
  childrenLabel?: string;
  fields: BlockField[];
  example?: string;
}

export interface Block {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  children: Block[];
  collapsed?: boolean;
  position: { x: number; y: number };
}

export interface ProjectFile {
  id: string;
  name: string;
  type: 'main' | 'module' | 'worker' | 'types';
  icon: string;
  blocks: Block[];
}

export interface Project {
  id: string;
  name: string;
  files: ProjectFile[];
  activeFileId: string;
}

export interface BlueprintResponse {
  id: number;
  userId: number;
  name: string;
  description: string;
  projectData: Project;
  latestGeneratedCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  blockId?: string;
  field?: string;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  blockIssues: Record<string, ValidationIssue[]>;
  hasErrors: boolean;
}

const MAX_VISUAL_EDITOR_NAME_LENGTH = 512;
const MAX_VISUAL_EDITOR_DESCRIPTION_LENGTH = 4096;

function clampText(value: unknown, maxLength: number): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeBlueprintName(name: string): string {
  const normalized = clampText(name, MAX_VISUAL_EDITOR_NAME_LENGTH);
  if (!normalized) {
    throw new Error('Blueprint name is required');
  }
  return normalized;
}

function normalizeLibraryName(name: string): string {
  const normalized = clampText(name, MAX_VISUAL_EDITOR_NAME_LENGTH);
  if (!normalized) {
    throw new Error('Library item name is required');
  }
  return normalized;
}

const IDENTIFIER_RE = /^[$A-Z_a-z][$\w$]*$/;
const TOP_LEVEL_RESERVED = new Set([
  'Bun',
  'Buffer',
  'crypto',
  'nodemailer',
  'server',
  'transporter',
  'request',
  'url',
  'method',
]);

function normalizeIdentifier(value: unknown): string {
  return String(value ?? '').trim();
}

function isValidIdentifier(value: string): boolean {
  return IDENTIFIER_RE.test(value);
}

function splitTopLevelArgs(raw: string): string[] {
  const out: string[] = [];
  let current = '';
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const prev = raw[i - 1];

    if (quote) {
      current += ch;
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);

    if (ch === ',' && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) out.push(current.trim());
  return out;
}

function inferLiteralType(expr: string): string | null {
  const value = expr.trim();
  if (!value) return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")) || (value.startsWith('`') && value.endsWith('`'))) return 'string';
  if (/^-?\d+(\.\d+)?$/.test(value)) return 'number';
  if (value === 'true' || value === 'false') return 'boolean';
  if (value === 'null') return 'null';
  if (value === 'undefined') return 'undefined';
  if (value.startsWith('[') && value.endsWith(']')) return 'array';
  if (value.startsWith('{') && value.endsWith('}')) return 'object';
  if (/^new\s+\w+\(/.test(value)) return 'object';
  return null;
}

function normalizeExpectedToken(token: string): string {
  return token.trim().toLowerCase();
}

function isTypeCompatible(actual: string | null, expectedRaw: string): boolean {
  if (!expectedRaw.trim()) return true;
  if (!actual) return true;
  const tokens = expectedRaw.split('|').map(normalizeExpectedToken).filter(Boolean);
  if (tokens.length === 0) return true;

  return tokens.some((token) => {
    if (token === 'any' || token === 'unknown' || token === 'never') return true;
    if (token === actual) return true;
    if (token.endsWith('[]')) return actual === 'array';
    if (token === 'string') return actual === 'string';
    if (token === 'number') return actual === 'number';
    if (token === 'boolean') return actual === 'boolean';
    if (token === 'array') return actual === 'array';
    if (token === 'object') return actual === 'object';
    if (token === 'null') return actual === 'null';
    if (token === 'undefined') return actual === 'undefined';
    return false;
  });
}

function addValidationIssue(target: ValidationIssue[], issue: ValidationIssue, blockIssues: Record<string, ValidationIssue[]>) {
  target.push(issue);
  if (issue.blockId) {
    if (!blockIssues[issue.blockId]) blockIssues[issue.blockId] = [];
    blockIssues[issue.blockId].push(issue);
  }
}

function getDeclaredNames(block: Block): Array<{ name: string; kind: 'const' | 'let' | 'function' | 'import' }> {
  const cfg = block.config || {};
  const names: Array<{ name: string; kind: 'const' | 'let' | 'function' | 'import' }> = [];

  switch (block.type) {
    case 'create_variable':
    case 'create_list':
    case 'create_object':
      if (cfg.name) names.push({ name: normalizeIdentifier(cfg.name), kind: cfg.global ? 'const' : 'let' });
      break;
    case 'create_function':
    case 'define_handler':
      if (cfg.name) names.push({ name: normalizeIdentifier(cfg.name), kind: 'function' });
      break;
    case 'create_smtp_transport':
      names.push({ name: normalizeIdentifier(cfg.name || 'transporter'), kind: 'const' });
      break;
    case 'connect_database':
    case 'connect_redis':
    case 'connect_mongodb':
    case 'connect_typeorm':
      if (cfg.name) names.push({ name: normalizeIdentifier(cfg.name), kind: 'const' });
      break;
    case 'get_from_list':
    case 'math':
    case 'text_join':
    case 'random_number':
    case 'run_function':
    case 'invoke_handler':
    case 'fetch_url':
    case 'get_env':
    case 'read_file':
    case 'write_file':
    case 'list_files':
    case 'generate_uuid':
    case 'hash_text':
    case 'hash_verify':
    case 'random_bytes':
    case 'encrypt_text':
    case 'decrypt_text':
    case 'generate_key':
    case 'sign_hmac':
    case 'verify_hmac':
    case 'csrf_token':
    case 'csrf_verify':
    case 'redis_get':
    case 'mongo_find':
    case 'orm_find':
    case 'orm_save':
    case 'orm_update':
    case 'orm_delete':
      for (const key of ['saveTo', 'saveKeyTo', 'saveIvTo'] as const) {
        if (cfg[key]) names.push({ name: normalizeIdentifier(cfg[key]), kind: 'const' });
      }
      break;
  }

  if (block.type === 'import_file') {
    const importType = String(cfg.importType || 'named');
    if (importType !== 'side-effect' && cfg.what) {
      String(cfg.what)
        .split(',')
        .map((s) => normalizeIdentifier(s.trim()))
        .filter(Boolean)
        .forEach((name) => names.push({ name, kind: 'import' }));
    }
  }

  return names.filter((item) => item.name);
}

function getReservedNamesForBlock(block: Block): string[] {
  const cfg = block.config || {};
  switch (block.type) {
    case 'start_server':
    case 'start_ws_server':
      return ['server'];
    case 'send_email':
      return ['transporter'];
    case 'connect_database': {
      const type = String(cfg.type || 'sqlite');
      if (type === 'sqlite') return ['Database'];
      if (type === 'postgres') return ['postgres'];
      return ['mysql'];
    }
    case 'connect_redis':
      return ['Redis'];
    case 'connect_mongodb':
      return ['MongoClient'];
    case 'connect_typeorm':
      return ['DataSource'];
    default:
      return [];
  }
}

export function validateProject(files: ProjectFile[]): ValidationReport {
  const issues: ValidationIssue[] = [];
  const blockIssues: Record<string, ValidationIssue[]> = {};
  const seenTopLevelPerFile = new Map<string, Map<string, { blockId: string; kind: string }>>();
  const functionDefs = new Map<string, { blockId: string; params: { name: string; type?: string }[]; fileId: string }>();
  const handlerDefs = new Map<string, { blockId: string; params: { name: string; type?: string; optional?: boolean }[]; fileId: string }>();
  const functionLocalScopes = new Map<string, Set<string>>();
  const handlerLocalScopes = new Map<string, Set<string>>();
  const transportVars = new Set<string>();
  const dbConnectors = new Set<string>();
  const redisConnectors = new Set<string>();
  const mongoConnectors = new Set<string>();
  const ormConnectors = new Set<string>();
  const blockToFile = new Map<string, string>();

  const visit = (block: Block, currentFileId: string, parentFunctionId?: string, parentHandlerId?: string) => {
    blockToFile.set(block.id, currentFileId);
    const declared = getDeclaredNames(block);
    const reserved = new Set<string>([...TOP_LEVEL_RESERVED, ...getReservedNamesForBlock(block)]);

    for (const declaredItem of declared) {
      const name = declaredItem.name;
      const kind = declaredItem.kind;

      if (!isValidIdentifier(name)) {
        addValidationIssue(issues, { severity: 'error', blockId: block.id, field: 'name', message: `"${name}" is not a valid JavaScript identifier.` }, blockIssues);
        continue;
      }

      if (reserved.has(name)) {
        addValidationIssue(issues, { severity: 'error', blockId: block.id, field: 'name', message: `"${name}" is reserved by generated imports or runtime code.` }, blockIssues);
      }

      if (parentFunctionId) {
        const funcScope = functionLocalScopes.get(parentFunctionId);
        if (funcScope?.has(name)) {
          addValidationIssue(issues, { severity: 'error', blockId: block.id, field: 'name', message: `"${name}" is already used by a declaration within this function scope.` }, blockIssues);
        } else if (kind !== 'function') {
          functionLocalScopes.get(parentFunctionId)?.add(name);
        }
      } else if (parentHandlerId) {
        const handlerScope = handlerLocalScopes.get(parentHandlerId);
        if (handlerScope?.has(name)) {
          addValidationIssue(issues, { severity: 'error', blockId: block.id, field: 'name', message: `"${name}" is already used by a declaration within this handler scope.` }, blockIssues);
        } else if (kind !== 'function') {
          handlerLocalScopes.get(parentHandlerId)?.add(name);
        }
      } else {
        if (!seenTopLevelPerFile.has(currentFileId)) seenTopLevelPerFile.set(currentFileId, new Map());
        const fileScope = seenTopLevelPerFile.get(currentFileId)!;

        if (kind === 'import') {
          fileScope.set(name, { blockId: block.id, kind });
        } else {
          const prev = fileScope.get(name);
          if (prev) {
            addValidationIssue(issues, { severity: 'error', blockId: block.id, field: 'name', message: `"${name}" is already used by a ${prev.kind} declaration.` }, blockIssues);
            addValidationIssue(issues, { severity: 'error', blockId: prev.blockId, field: 'name', message: `"${name}" conflicts with another declaration.` }, blockIssues);
          } else {
            fileScope.set(name, { blockId: block.id, kind });
          }
        }
      }
    }

    if (block.type === 'create_function' && block.config.name) {
      functionDefs.set(normalizeIdentifier(block.config.name), {
        blockId: block.id,
        params: splitTopLevelArgs(String(block.config.inputs || '')).map((part) => {
          const colonIdx = part.indexOf(':');
          if (colonIdx > 0) return { name: part.slice(0, colonIdx).trim(), type: part.slice(colonIdx + 1).trim() || undefined };
          return { name: part.trim() };
        }).filter((p) => p.name),
        fileId: currentFileId,
      });
      functionLocalScopes.set(block.id, new Set());
    }

    if (block.type === 'define_handler' && block.config.name) {
      let parsed: { name: string; type?: string; optional?: boolean }[] = [];
      try {
        const p = typeof block.config.params === 'string' ? JSON.parse(block.config.params) : block.config.params;
        if (Array.isArray(p)) parsed = p.map((item: any) => ({ name: String(item?.name ?? '').trim(), type: String(item?.type ?? '').trim() || undefined, optional: Boolean(item?.optional) })).filter((item) => item.name);
      } catch {
        parsed = [];
      }
      handlerDefs.set(normalizeIdentifier(block.config.name), { blockId: block.id, params: parsed, fileId: currentFileId });
      handlerLocalScopes.set(block.id, new Set());
    }

    if (block.type === 'create_smtp_transport') transportVars.add(currentFileId + ':' + normalizeIdentifier(block.config.name || 'transporter'));
    if (block.type === 'connect_database') dbConnectors.add(currentFileId + ':' + normalizeIdentifier(block.config.name || 'db'));
    if (block.type === 'connect_redis') redisConnectors.add(currentFileId + ':' + normalizeIdentifier(block.config.name || 'redis'));
    if (block.type === 'connect_mongodb') mongoConnectors.add(currentFileId + ':' + normalizeIdentifier(block.config.name || 'mongo'));
    if (block.type === 'connect_typeorm') ormConnectors.add(currentFileId + ':' + normalizeIdentifier(block.config.name || 'AppDataSource'));

    const nextFnId = block.type === 'create_function' ? block.id : parentFunctionId;
    const nextHandlerId = block.type === 'define_handler' ? block.id : parentHandlerId;
    (block.children || []).forEach((child) => visit(child, currentFileId, nextFnId, nextHandlerId));
  };

  files.forEach((file) => (file.blocks || []).forEach((block) => visit(block, file.id)));

  const validateCall = (block: Block) => {
    if (block.type === 'run_function') {
      const fnName = normalizeIdentifier(block.config.name);
      const fn = functionDefs.get(fnName);
      if (!fn) {
        addValidationIssue(issues, { severity: 'error', blockId: block.id, field: 'name', message: `Function "${fnName}" is not defined.` }, blockIssues);
      } else {
        const args = splitTopLevelArgs(String(block.config.inputs || '')).filter(Boolean);
        if (args.length !== fn.params.length) {
          addValidationIssue(issues, { severity: 'error', blockId: block.id, field: 'inputs', message: `Function "${fnName}" expects ${fn.params.length} argument(s), got ${args.length}.` }, blockIssues);
        }
        fn.params.forEach((param, index) => {
          if (!param.type) return;
          const argExpr = args[index];
          if (!argExpr) return;
          const actual = inferLiteralType(argExpr);
          if (!isTypeCompatible(actual, param.type || '')) {
            addValidationIssue(issues, { severity: 'error', blockId: block.id, field: 'inputs', message: `Argument ${index + 1} for "${fnName}" expects ${param.type}, got ${actual || 'an unknown expression'}.` }, blockIssues);
          }
        });
      }
    }

    if (block.type === 'invoke_handler') {
      const handlerName = normalizeIdentifier(block.config.name);
      const handler = handlerDefs.get(handlerName);
      if (!handler) {
        addValidationIssue(issues, { severity: 'error', blockId: block.id, field: 'name', message: `Handler "${handlerName}" is not defined.` }, blockIssues);
      } else {
        handler.params.forEach((param) => {
          const argExpr = block.config[`arg_${param.name}`];
          if ((argExpr === undefined || argExpr === '') && !param.optional) {
            addValidationIssue(issues, { severity: 'error', blockId: block.id, field: `arg_${param.name}`, message: `Missing argument "${param.name}" for handler "${handlerName}".` }, blockIssues);
            return;
          }
          if (!param.type || argExpr === undefined || argExpr === '') return;
          const actual = inferLiteralType(String(argExpr));
          if (!isTypeCompatible(actual, param.type || '')) {
            addValidationIssue(issues, { severity: 'error', blockId: block.id, field: `arg_${param.name}`, message: `Argument "${param.name}" expects ${param.type}, got ${actual || 'an unknown expression'}.` }, blockIssues);
          }
        });
      }
    }

    if (block.type === 'create_variable') {
      const expected = String(block.config.type || '').trim();
      const value = String(block.config.value ?? '');
      const actual = inferLiteralType(value);
      if (expected && actual && !isTypeCompatible(actual, expected)) {
        addValidationIssue(issues, { severity: 'error', blockId: block.id, field: 'value', message: `Variable "${String(block.config.name || '')}" expects ${expected}, got ${actual}.` }, blockIssues);
      }
    }

    if (block.type === 'send_email' && !String(block.config.smtpHost || '').trim()) {
      const transportName = normalizeIdentifier(block.config.transport || 'transporter');
      const fileId = blockToFile.get(block.id) || '';
      if (!transportVars.has(fileId + ':' + transportName)) {
        addValidationIssue(issues, { severity: 'warning', blockId: block.id, field: 'transport', message: `Transport "${transportName}" is not defined. Add a "Create SMTP Transport" block with name "${transportName}".` }, blockIssues);
      }
    }

    if (block.type === 'db_find' || block.type === 'db_add' || block.type === 'db_update' || block.type === 'db_delete') {
      const dbName = normalizeIdentifier(block.config.db || 'db');
      const fileId = blockToFile.get(block.id) || '';
      if (!dbConnectors.has(fileId + ':' + dbName)) {
        addValidationIssue(issues, { severity: 'warning', blockId: block.id, field: 'db', message: `Database connector "${dbName}" not found. Add a "Connect to Database" block with name "${dbName}".` }, blockIssues);
      }
    }

    if (block.type === 'redis_set' || block.type === 'redis_get' || block.type === 'redis_del') {
      const clientName = normalizeIdentifier(block.config.client || 'redis');
      const fileId = blockToFile.get(block.id) || '';
      if (!redisConnectors.has(fileId + ':' + clientName)) {
        addValidationIssue(issues, { severity: 'warning', blockId: block.id, field: 'client', message: `Redis client "${clientName}" not found. Add a "Connect to Redis" block with name "${clientName}".` }, blockIssues);
      }
    }

    if (block.type === 'mongo_find' || block.type === 'mongo_insert' || block.type === 'mongo_update' || block.type === 'mongo_delete') {
      const clientName = normalizeIdentifier(block.config.client || 'mongo');
      const fileId = blockToFile.get(block.id) || '';
      if (!mongoConnectors.has(fileId + ':' + clientName)) {
        addValidationIssue(issues, { severity: 'warning', blockId: block.id, field: 'client', message: `MongoDB client "${clientName}" not found. Add a "Connect to MongoDB" block with name "${clientName}".` }, blockIssues);
      }
    }

    if (block.type === 'orm_find' || block.type === 'orm_save' || block.type === 'orm_update' || block.type === 'orm_delete') {
      const dsName = normalizeIdentifier(block.config.ds || 'AppDataSource');
      const fileId = blockToFile.get(block.id) || '';
      if (!ormConnectors.has(fileId + ':' + dsName)) {
        addValidationIssue(issues, { severity: 'warning', blockId: block.id, field: 'ds', message: `TypeORM DataSource "${dsName}" not found. Add a "Connect with TypeORM" block with name "${dsName}".` }, blockIssues);
      }
    }

    (block.children || []).forEach(validateCall);
  };

  files.forEach((file) => (file.blocks || []).forEach(validateCall));

  return {
    issues,
    blockIssues,
    hasErrors: issues.some((issue) => issue.severity === 'error'),
  };
}

export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  { type: 'print', category: 'basics', name: 'Print Message', description: 'Show something in the console', color: '#10b981', icon: 'MessageSquare', canHaveChildren: false, fields: [{ name: 'label', label: 'Label (optional)', type: 'text', placeholder: 'Score:', helpText: 'Prefix label shown before the value' }, { name: 'message', label: 'Message or variable', type: 'expression', placeholder: '"Hello"  or  myVar  or  score', required: true, helpText: 'Use quotes for text: "Hello" — OR just type a variable name: myVar — OR type a number: 42' }] },
  { type: 'comment', category: 'basics', name: 'Note to Self', description: 'Add a comment (won\'t run)', color: '#6b7280', icon: 'StickyNote', canHaveChildren: false, fields: [{ name: 'text', label: 'Your note', type: 'text', placeholder: 'This explains what the code does...' }] },
  { type: 'wait', category: 'basics', name: 'Wait', description: 'Pause before continuing', color: '#f59e0b', icon: 'Clock', canHaveChildren: false, fields: [{ name: 'seconds', label: 'Wait for (seconds)', type: 'number', default: 1, helpText: 'How long to pause' }] },
  { type: 'create_variable', category: 'data', name: 'Create Variable', description: 'Store a value with a name', color: '#8b5cf6', icon: 'Box', canHaveChildren: false, fields: [{ name: 'global', label: 'Global (top-level)', type: 'boolean', default: false }, { name: 'name', label: 'Call it', type: 'text', placeholder: 'myNumber', required: true, helpText: 'The name for your variable' }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'number | string | boolean', helpText: 'Leave blank for automatic type' }, { name: 'value', label: 'Starting value', type: 'expression', placeholder: '0', required: true, helpText: 'Text needs quotes: "hello"' }] },
  { type: 'change_variable', category: 'data', name: 'Change Variable', description: 'Update a variable\'s value', color: '#8b5cf6', icon: 'RefreshCw', canHaveChildren: false, fields: [{ name: 'name', label: 'Variable name', type: 'variable', required: true }, { name: 'value', label: 'New value', type: 'expression', required: true }] },
  { type: 'create_list', category: 'data', name: 'Create List', description: 'Store multiple items together', color: '#06b6d4', icon: 'List', canHaveChildren: false, fields: [{ name: 'global', label: 'Global (top-level)', type: 'boolean', default: false }, { name: 'name', label: 'Call it', type: 'text', required: true, placeholder: 'myList' }, { name: 'items', label: 'Starting items', type: 'text', placeholder: '"apple", "banana", "orange"', helpText: 'Separate with commas' }] },
  { type: 'add_to_list', category: 'data', name: 'Add to List', description: 'Put something in a list', color: '#06b6d4', icon: 'PlusCircle', canHaveChildren: false, fields: [{ name: 'list', label: 'Which list', type: 'variable', required: true }, { name: 'item', label: 'Item to add', type: 'expression', required: true }, { name: 'where', label: 'Add at', type: 'select', default: 'end', options: [{ label: 'End of list', value: 'end' }, { label: 'Start of list', value: 'start' }] }] },
  { type: 'remove_from_list', category: 'data', name: 'Remove from List', description: 'Take something out of a list', color: '#06b6d4', icon: 'MinusCircle', canHaveChildren: false, fields: [{ name: 'list', label: 'Which list', type: 'variable', required: true }, { name: 'what', label: 'Remove', type: 'select', default: 'last', options: [{ label: 'Last item', value: 'last' }, { label: 'First item', value: 'first' }, { label: 'Item at position', value: 'index' }] }, { name: 'index', label: 'Position (if needed)', type: 'number' }] },
  { type: 'get_from_list', category: 'data', name: 'Get from List', description: 'Get an item from a list', color: '#06b6d4', icon: 'Search', canHaveChildren: false, fields: [{ name: 'list', label: 'Which list', type: 'variable', required: true }, { name: 'what', label: 'Get', type: 'select', default: 'first', options: [{ label: 'First item', value: 'first' }, { label: 'Last item', value: 'last' }, { label: 'Item at position', value: 'index' }, { label: 'Random item', value: 'random' }, { label: 'Length (count)', value: 'length' }] }, { name: 'index', label: 'Position (if needed)', type: 'number', default: 0 }, { name: 'saveTo', label: 'Save to variable', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string | number', helpText: 'Leave blank for inferred type' }] },
  { type: 'create_object', category: 'data', name: 'Create Object', description: 'Store named properties together', color: '#ec4899', icon: 'Braces', canHaveChildren: false, fields: [{ name: 'global', label: 'Global (top-level)', type: 'boolean', default: false }, { name: 'name', label: 'Call it', type: 'text', required: true, placeholder: 'user' }] },
  { type: 'set_property', category: 'data', name: 'Set Property', description: 'Set a value inside an object', color: '#ec4899', icon: 'Settings', canHaveChildren: false, fields: [{ name: 'object', label: 'Which object', type: 'variable', required: true }, { name: 'property', label: 'Property name', type: 'text', required: true, placeholder: 'name' }, { name: 'value', label: 'Value', type: 'expression', required: true }] },
  { type: 'get_property', category: 'data', name: 'Get Property', description: 'Get a value from an object', color: '#ec4899', icon: 'Eye', canHaveChildren: false, fields: [{ name: 'object', label: 'Which object', type: 'variable', required: true }, { name: 'property', label: 'Property name', type: 'text', required: true }, { name: 'saveTo', label: 'Save to variable', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string | number', helpText: 'Leave blank for inferred type' }] },
  { type: 'math', category: 'data', name: 'Do Math', description: 'Calculate numbers', color: '#f97316', icon: 'Calculator', canHaveChildren: false, fields: [{ name: 'left', label: 'First number', type: 'expression', required: true }, { name: 'operation', label: 'Operation', type: 'select', default: 'add', options: [{ label: 'Plus (+)', value: 'add' }, { label: 'Minus (-)', value: 'subtract' }, { label: 'Times (×)', value: 'multiply' }, { label: 'Divided by (÷)', value: 'divide' }, { label: 'Remainder (%)', value: 'modulo' }, { label: 'To the power of', value: 'power' }] }, { name: 'right', label: 'Second number', type: 'expression', required: true }, { name: 'saveTo', label: 'Save result to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'number', helpText: 'Leave blank for inferred type' }] },
  { type: 'text_join', category: 'data', name: 'Join Text', description: 'Combine text together', color: '#84cc16', icon: 'Link', canHaveChildren: false, fields: [{ name: 'text1', label: 'First text', type: 'expression', required: true }, { name: 'text2', label: 'Second text', type: 'expression', required: true }, { name: 'saveTo', label: 'Save result to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string', helpText: 'Leave blank for inferred type' }] },
  { type: 'random_number', category: 'data', name: 'Random Number', description: 'Pick a random number', color: '#f97316', icon: 'Shuffle', canHaveChildren: false, fields: [{ name: 'min', label: 'From', type: 'number', default: 1 }, { name: 'max', label: 'To', type: 'number', default: 100 }, { name: 'saveTo', label: 'Save to variable', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'number', helpText: 'Leave blank for inferred type' }] },
  { type: 'if', category: 'logic', name: 'If (Start Decision)', description: 'Check a condition - drag actions INSIDE this block', color: '#3b82f6', icon: 'GitBranch', canHaveChildren: true, childrenLabel: 'When TRUE, do these (drag blocks here):', fields: [{ name: 'left', label: 'Check if', type: 'expression', required: true, placeholder: 'score', helpText: 'The value to check' }, { name: 'comparison', label: 'Is', type: 'select', default: 'equals', options: [{ label: 'equals (==)', value: 'equals' }, { label: 'does not equal (!=)', value: 'notEquals' }, { label: 'is greater than (>)', value: 'greater' }, { label: 'is less than (<)', value: 'less' }, { label: 'is greater or equal (>=)', value: 'greaterEqual' }, { label: 'is less or equal (<=)', value: 'lessEqual' }, { label: 'contains', value: 'contains' }, { label: 'is empty', value: 'isEmpty' }, { label: 'is not empty', value: 'isNotEmpty' }] }, { name: 'right', label: 'Than', type: 'expression', placeholder: '100', helpText: 'The value to compare against' }, { name: 'conditions', label: 'Extra conditions', type: 'text', placeholder: 'Click + below to add conditions', helpText: 'Stackable AND/OR conditions' }] },
  { type: 'otherwise', category: 'logic', name: 'Else (Must Follow If)', description: 'Runs when the IF above is false - place right after an If block', color: '#64748b', icon: 'GitMerge', canHaveChildren: true, childrenLabel: 'When FALSE, do these (drag blocks here):', fields: [] },
  { type: 'otherwise_if', category: 'logic', name: 'Else If (Must Follow If)', description: 'Check another condition if the first was false', color: '#3b82f6', icon: 'GitBranch', canHaveChildren: true, childrenLabel: 'When this is TRUE, do these:', fields: [{ name: 'left', label: 'Check if', type: 'expression', required: true, helpText: 'Another condition to check' }, { name: 'comparison', label: 'Is', type: 'select', default: 'equals', options: [{ label: 'equals (==)', value: 'equals' }, { label: 'does not equal (!=)', value: 'notEquals' }, { label: 'is greater than (>)', value: 'greater' }, { label: 'is less than (<)', value: 'less' }] }, { name: 'right', label: 'Than', type: 'expression', helpText: 'Compare value' }, { name: 'conditions', label: 'Extra conditions', type: 'text', placeholder: 'Click + below to add conditions', helpText: 'Stackable AND/OR conditions' }] },
  { type: 'switch', category: 'logic', name: 'Check Value (Switch)', description: 'Do different things based on a value', color: '#6366f1', icon: 'Layers', canHaveChildren: true, childrenLabel: 'Cases (add Case blocks inside):', fields: [{ name: 'value', label: 'Check this value', type: 'expression', required: true }] },
  { type: 'case', category: 'logic', name: 'When Value Is', description: 'One possible value to check', color: '#6366f1', icon: 'Tag', canHaveChildren: true, childrenLabel: 'Do this:', fields: [{ name: 'value', label: 'When it equals', type: 'expression', required: true }] },
  { type: 'default_case', category: 'logic', name: 'Otherwise (Default)', description: 'If no other case matches', color: '#6366f1', icon: 'MoreHorizontal', canHaveChildren: true, childrenLabel: 'Do this:', fields: [] },
  { type: 'repeat_times', category: 'loops', name: 'Repeat X Times', description: 'Do something a specific number of times', color: '#f59e0b', icon: 'Repeat', canHaveChildren: true, childrenLabel: 'Do these each time:', fields: [{ name: 'times', label: 'How many times', type: 'expression', default: '10', required: true }, { name: 'counterName', label: 'Call the counter', type: 'text', default: 'i', helpText: 'Use this to know which repetition you\'re on' }] },
  { type: 'for_each', category: 'loops', name: 'For Each Item In List', description: 'Do something for every item in a list', color: '#f59e0b', icon: 'ListOrdered', canHaveChildren: true, childrenLabel: 'Do these for each item:', fields: [{ name: 'list', label: 'Which list', type: 'variable', required: true }, { name: 'itemName', label: 'Call each item', type: 'text', default: 'item', required: true }] },
  { type: 'while', category: 'loops', name: 'While This Is True', description: 'Keep repeating while condition is true', color: '#f59e0b', icon: 'RefreshCw', canHaveChildren: true, childrenLabel: 'Keep doing:', fields: [{ name: 'left', label: 'While this', type: 'expression', required: true }, { name: 'comparison', label: 'Is', type: 'select', default: 'less', options: [{ label: 'equals', value: 'equals' }, { label: 'does not equal', value: 'notEquals' }, { label: 'is greater than', value: 'greater' }, { label: 'is less than', value: 'less' }, { label: 'is true', value: 'isTrue' }] }, { name: 'right', label: 'This', type: 'expression' }] },
  { type: 'stop_loop', category: 'loops', name: 'Stop Looping', description: 'Exit the loop early', color: '#ef4444', icon: 'StopCircle', canHaveChildren: false, fields: [] },
  { type: 'skip_to_next', category: 'loops', name: 'Skip to Next', description: 'Skip the rest and go to next repetition', color: '#f59e0b', icon: 'SkipForward', canHaveChildren: false, fields: [] },
  { type: 'create_function', category: 'functions', name: 'Create Function', description: 'Make a reusable block of code', color: '#a855f7', icon: 'Puzzle', canHaveChildren: true, childrenLabel: 'Function does:', fields: [{ name: 'global', label: 'Use function keyword (hoisted)', type: 'boolean', default: false }, { name: 'name', label: 'Function name', type: 'text', required: true, placeholder: 'greetUser' }, { name: 'inputs', label: 'Inputs (optional)', type: 'text', placeholder: 'name, age', helpText: 'What info does it need? Separate with commas' }, { name: 'description', label: 'What it does', type: 'text', placeholder: 'Greets a user by name' }] },
  { type: 'run_function', category: 'functions', name: 'Run Function', description: 'Use a function you created', color: '#a855f7', icon: 'Play', canHaveChildren: false, fields: [{ name: 'name', label: 'Function name', type: 'text', required: true }, { name: 'inputs', label: 'Input values', type: 'expression', placeholder: '"John", 25', helpText: 'Values to pass in, separated by commas' }, { name: 'saveTo', label: 'Save result to (optional)', type: 'text' }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string | number', helpText: 'Leave blank for inferred type' }] },
  { type: 'return_value', category: 'functions', name: 'Return Value', description: 'Send a value back from the function', color: '#a855f7', icon: 'CornerDownLeft', canHaveChildren: false, fields: [{ name: 'value', label: 'Value to return', type: 'expression' }] },
  { type: 'try', category: 'functions', name: 'Try (Might Fail)', description: 'Try something that might cause an error', color: '#ef4444', icon: 'Shield', canHaveChildren: true, childrenLabel: 'Try to do:', fields: [] },
  { type: 'catch_error', category: 'functions', name: 'If Error Happens', description: 'What to do if something fails', color: '#ef4444', icon: 'AlertCircle', canHaveChildren: true, childrenLabel: 'Handle error by:', fields: [{ name: 'errorName', label: 'Call the error', type: 'text', default: 'error' }] },
  { type: 'start_server', category: 'server', name: 'Start Web Server', description: 'Create a website/API server', color: '#0ea5e9', icon: 'Server', canHaveChildren: true, childrenLabel: 'Server routes (add Route blocks):', fields: [{ name: 'port', label: 'Port number', type: 'number', default: 3000, helpText: 'Usually 3000 for development' }] },
  { type: 'route', category: 'server', name: 'Handle Route', description: 'Respond to requests at a URL', color: '#0ea5e9', icon: 'Route', canHaveChildren: true, childrenLabel: 'When someone visits, do:', fields: [{ name: 'method', label: 'Request type', type: 'select', default: 'GET', options: [{ label: 'GET - Read/view data', value: 'GET' }, { label: 'POST - Send/create data', value: 'POST' }, { label: 'PUT - Update data', value: 'PUT' }, { label: 'DELETE - Remove data', value: 'DELETE' }] }, { name: 'path', label: 'URL path', type: 'text', default: '/', placeholder: '/users', helpText: 'Use :name for dynamic parts, like /users/:id' }] },
  { type: 'send_response', category: 'server', name: 'Send Response', description: 'Send data back to the visitor', color: '#0ea5e9', icon: 'Send', canHaveChildren: false, fields: [{ name: 'type', label: 'Response type', type: 'select', default: 'json', options: [{ label: 'JSON (data)', value: 'json' }, { label: 'Text', value: 'text' }, { label: 'HTML (webpage)', value: 'html' }] }, { name: 'data', label: 'Data to send', type: 'expression', required: true }, { name: 'status', label: 'Status code', type: 'select', default: '200', options: [{ label: '200 - OK', value: '200' }, { label: '201 - Created', value: '201' }, { label: '400 - Bad Request', value: '400' }, { label: '404 - Not Found', value: '404' }, { label: '500 - Server Error', value: '500' }] }] },
  { type: 'get_request_data', category: 'server', name: 'Get Request Data', description: 'Get information from the request', color: '#0ea5e9', icon: 'Download', canHaveChildren: false, fields: [{ name: 'from', label: 'Get from', type: 'select', default: 'body', options: [{ label: 'Body (POST data)', value: 'body' }, { label: 'URL parameters (:id)', value: 'params' }, { label: 'Query string (?key=val)', value: 'query' }, { label: 'Headers', value: 'headers' }] }, { name: 'saveTo', label: 'Save to variable', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'any', helpText: 'Leave blank for inferred type' }] },
  { type: 'fetch_url', category: 'server', name: 'Fetch from URL', description: 'Get data from another website/API', color: '#22c55e', icon: 'Globe', canHaveChildren: false, fields: [{ name: 'url', label: 'URL', type: 'expression', required: true, placeholder: '"https://api.example.com/data"' }, { name: 'method', label: 'Request type', type: 'select', default: 'GET', options: [{ label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }] }, { name: 'body', label: 'Data to send (for POST)', type: 'expression' }, { name: 'saveTo', label: 'Save response to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'any', helpText: 'Leave blank for inferred type' }] },
  { type: 'send_email', category: 'server', name: 'Send Email', description: 'Send an email message', color: '#ec4899', icon: 'Mail', canHaveChildren: false, fields: [{ name: 'transport', label: 'Transport variable', type: 'text', default: 'transporter', placeholder: 'transporter', helpText: 'Created by Create SMTP Transport block' }, { name: 'to', label: 'To', type: 'expression', required: true, placeholder: '"user@example.com"' }, { name: 'subject', label: 'Subject', type: 'expression', required: true }, { name: 'body', label: 'Message', type: 'expression', required: true }, { name: 'from', label: 'From address', type: 'text', placeholder: 'no-reply@example.com' }, { name: 'smtpHost', label: 'SMTP Server', type: 'text', placeholder: 'smtp.gmail.com' }, { name: 'smtpPort', label: 'SMTP Port', type: 'number', default: 587, placeholder: '587' }, { name: 'smtpSecure', label: 'Use TLS/SSL', type: 'boolean', default: false }, { name: 'smtpUser', label: 'Username', type: 'text' }, { name: 'smtpPass', label: 'Password', type: 'text' }] },
  { type: 'create_smtp_transport', category: 'server', name: 'Create SMTP Transport', description: 'Create a reusable nodemailer transport', color: '#ec4899', icon: 'Mail', canHaveChildren: false, fields: [{ name: 'name', label: 'Transport variable', type: 'text', default: 'transporter', helpText: 'Reference this by name in Send Email blocks' }, { name: 'host', label: 'SMTP Server', type: 'text', required: true, placeholder: 'smtp.gmail.com' }, { name: 'port', label: 'SMTP Port', type: 'number', default: 587 }, { name: 'secure', label: 'Use TLS/SSL', type: 'boolean', default: false }, { name: 'user', label: 'Username', type: 'text' }, { name: 'pass', label: 'Password', type: 'text' }] },
  { type: 'connect_database', category: 'database', name: 'Connect to Database', description: 'Connect to a SQL database', color: '#f97316', icon: 'Database', canHaveChildren: false, fields: [{ name: 'type', label: 'Database type', type: 'select', default: 'sqlite', options: [{ label: 'SQLite (simple file)', value: 'sqlite' }, { label: 'PostgreSQL', value: 'postgres' }, { label: 'MySQL', value: 'mysql' }, { label: 'MariaDB', value: 'mariadb' }] }, { name: 'connection', label: 'Connection info', type: 'text', required: true, placeholder: './mydata.db', helpText: 'SQLite: file path like "./data.db" | Postgres/MySQL: URL like "postgres://user:pass@localhost:5432/db"' }, { name: 'host', label: 'Host', type: 'text', placeholder: 'localhost' }, { name: 'port', label: 'Port', type: 'number', placeholder: '5432' }, { name: 'username', label: 'Username', type: 'text', placeholder: 'root' }, { name: 'password', label: 'Password', type: 'text', placeholder: '••••••••' }, { name: 'database', label: 'Database name', type: 'text', placeholder: 'mydb' }, { name: 'name', label: 'Call it', type: 'text', default: 'db' }] },
  { type: 'db_find', category: 'database', name: 'Find in Database', description: 'Search for records', color: '#f97316', icon: 'Search', canHaveChildren: false, fields: [{ name: 'driver', label: 'Database type', type: 'select', default: 'sqlite', options: [{ label: 'SQLite', value: 'sqlite' }, { label: 'PostgreSQL', value: 'postgres' }, { label: 'MySQL/MariaDB', value: 'mysql' }] }, { name: 'db', label: 'Database', type: 'text', default: 'db' }, { name: 'table', label: 'Table name', type: 'text', required: true }, { name: 'where', label: 'Where (condition)', type: 'text', placeholder: 'id = 1', helpText: 'Leave empty to get all' }, { name: 'saveTo', label: 'Save results to', type: 'text', required: true }] },
  { type: 'db_add', category: 'database', name: 'Add to Database', description: 'Insert a new record', color: '#f97316', icon: 'Plus', canHaveChildren: false, fields: [{ name: 'driver', label: 'Database type', type: 'select', default: 'sqlite', options: [{ label: 'SQLite', value: 'sqlite' }, { label: 'PostgreSQL', value: 'postgres' }, { label: 'MySQL/MariaDB', value: 'mysql' }] }, { name: 'db', label: 'Database', type: 'text', default: 'db' }, { name: 'table', label: 'Table name', type: 'text', required: true }, { name: 'data', label: 'Data (object)', type: 'json', required: true, placeholder: '{ name: "John", age: 25 }' }] },
  { type: 'db_update', category: 'database', name: 'Update in Database', description: 'Change existing records', color: '#f97316', icon: 'RefreshCw', canHaveChildren: false, fields: [{ name: 'driver', label: 'Database type', type: 'select', default: 'sqlite', options: [{ label: 'SQLite', value: 'sqlite' }, { label: 'PostgreSQL', value: 'postgres' }, { label: 'MySQL/MariaDB', value: 'mysql' }] }, { name: 'db', label: 'Database', type: 'text', default: 'db' }, { name: 'table', label: 'Table name', type: 'text', required: true }, { name: 'where', label: 'Where (condition)', type: 'text', required: true, placeholder: 'id = 1' }, { name: 'data', label: 'New values', type: 'json', required: true }] },
  { type: 'db_delete', category: 'database', name: 'Delete from Database', description: 'Remove records', color: '#ef4444', icon: 'Trash2', canHaveChildren: false, fields: [{ name: 'driver', label: 'Database type', type: 'select', default: 'sqlite', options: [{ label: 'SQLite', value: 'sqlite' }, { label: 'PostgreSQL', value: 'postgres' }, { label: 'MySQL/MariaDB', value: 'mysql' }] }, { name: 'db', label: 'Database', type: 'text', default: 'db' }, { name: 'table', label: 'Table name', type: 'text', required: true }, { name: 'where', label: 'Where (condition)', type: 'text', required: true, placeholder: 'id = 1' }] },

  { type: 'connect_redis', category: 'database', name: 'Connect to Redis', description: 'Connect to a Redis server', color: '#dc2626', icon: 'Database', canHaveChildren: false, fields: [{ name: 'connection', label: 'Connection URL', type: 'text', required: true, placeholder: 'redis://localhost:6379', helpText: 'Use redis://user:pass@host:port' }, { name: 'name', label: 'Call it', type: 'text', default: 'redis' }] },
  { type: 'redis_set', category: 'database', name: 'Redis: Set Value', description: 'Store a value in Redis', color: '#dc2626', icon: 'Save', canHaveChildren: false, fields: [{ name: 'client', label: 'Redis client', type: 'text', default: 'redis' }, { name: 'key', label: 'Key', type: 'text', required: true, placeholder: 'user:123' }, { name: 'value', label: 'Value', type: 'expression', required: true }, { name: 'ttl', label: 'TTL (seconds, optional)', type: 'number', placeholder: '3600' }] },
  { type: 'redis_get', category: 'database', name: 'Redis: Get Value', description: 'Read a value from Redis', color: '#dc2626', icon: 'Search', canHaveChildren: false, fields: [{ name: 'client', label: 'Redis client', type: 'text', default: 'redis' }, { name: 'key', label: 'Key', type: 'text', required: true, placeholder: 'user:123' }, { name: 'saveTo', label: 'Save result to', type: 'text', required: true }] },
  { type: 'redis_del', category: 'database', name: 'Redis: Delete Key', description: 'Remove a key from Redis', color: '#dc2626', icon: 'Trash2', canHaveChildren: false, fields: [{ name: 'client', label: 'Redis client', type: 'text', default: 'redis' }, { name: 'key', label: 'Key', type: 'text', required: true, placeholder: 'user:123' }] },
  { type: 'connect_mongodb', category: 'database', name: 'Connect to MongoDB', description: 'Connect to a MongoDB database', color: '#22c55e', icon: 'Database', canHaveChildren: false, fields: [{ name: 'connection', label: 'Connection URL', type: 'text', required: true, placeholder: 'mongodb://localhost:27017/mydb', helpText: 'MongoDB connection string' }, { name: 'dbName', label: 'Database name', type: 'text', required: true, placeholder: 'mydb' }, { name: 'name', label: 'Call it', type: 'text', default: 'mongo' }] },
  { type: 'mongo_find', category: 'database', name: 'Mongo: Find Documents', description: 'Search documents in a collection', color: '#22c55e', icon: 'Search', canHaveChildren: false, fields: [{ name: 'client', label: 'Mongo client', type: 'text', default: 'mongo' }, { name: 'collection', label: 'Collection name', type: 'text', required: true, placeholder: 'users' }, { name: 'filter', label: 'Filter (query)', type: 'json', placeholder: '{ age: { $gte: 18 } }', helpText: 'MongoDB query object, empty for all' }, { name: 'saveTo', label: 'Save results to', type: 'text', required: true }] },
  { type: 'mongo_insert', category: 'database', name: 'Mongo: Insert Document', description: 'Add a new document', color: '#22c55e', icon: 'Plus', canHaveChildren: false, fields: [{ name: 'client', label: 'Mongo client', type: 'text', default: 'mongo' }, { name: 'collection', label: 'Collection name', type: 'text', required: true, placeholder: 'users' }, { name: 'data', label: 'Document', type: 'json', required: true, placeholder: '{ name: "John", age: 25 }' }] },
  { type: 'mongo_update', category: 'database', name: 'Mongo: Update Documents', description: 'Modify existing documents', color: '#22c55e', icon: 'RefreshCw', canHaveChildren: false, fields: [{ name: 'client', label: 'Mongo client', type: 'text', default: 'mongo' }, { name: 'collection', label: 'Collection name', type: 'text', required: true, placeholder: 'users' }, { name: 'filter', label: 'Filter', type: 'json', required: true, placeholder: '{ name: "John" }' }, { name: 'update', label: 'Update', type: 'json', required: true, placeholder: '{ $set: { age: 26 } }' }] },
  { type: 'mongo_delete', category: 'database', name: 'Mongo: Delete Documents', description: 'Remove documents from collection', color: '#ef4444', icon: 'Trash2', canHaveChildren: false, fields: [{ name: 'client', label: 'Mongo client', type: 'text', default: 'mongo' }, { name: 'collection', label: 'Collection name', type: 'text', required: true, placeholder: 'users' }, { name: 'filter', label: 'Filter', type: 'json', required: true, placeholder: '{ name: "John" }' }] },
  { type: 'connect_typeorm', category: 'database', name: 'Connect with TypeORM', description: 'Set up TypeORM DataSource', color: '#8b5cf6', icon: 'Database', canHaveChildren: false, fields: [{ name: 'type', label: 'Database type', type: 'select', default: 'sqlite', options: [{ label: 'SQLite', value: 'sqlite' }, { label: 'PostgreSQL', value: 'postgres' }, { label: 'MySQL', value: 'mysql' }, { label: 'MariaDB', value: 'mariadb' }] }, { name: 'connection', label: 'Connection URL', type: 'text', placeholder: 'postgres://user:pass@localhost:5432/db', helpText: 'Leave blank to use host/port/database fields below' }, { name: 'host', label: 'Host', type: 'text', placeholder: 'localhost' }, { name: 'port', label: 'Port', type: 'number', placeholder: '5432' }, { name: 'username', label: 'Username', type: 'text', placeholder: 'root' }, { name: 'password', label: 'Password', type: 'text', placeholder: '••••••••' }, { name: 'database', label: 'Database name', type: 'text', placeholder: 'mydb' }, { name: 'sync', label: 'Auto-sync schema', type: 'boolean', default: true }, { name: 'name', label: 'Call it', type: 'text', default: 'AppDataSource' }] },
  { type: 'orm_entity', category: 'database', name: 'TypeORM: Define Entity', description: 'Create an entity class', color: '#8b5cf6', icon: 'Box', canHaveChildren: false, fields: [{ name: 'name', label: 'Entity name', type: 'text', required: true, placeholder: 'User' }, { name: 'table', label: 'Table name', type: 'text', placeholder: 'users' }, { name: 'columns', label: 'Columns (JSON)', type: 'json', placeholder: '[{"name":"id","type":"number","primary":true},{"name":"email","type":"string"}]', helpText: 'JSON array of column definitions: {name, type, primary?, unique?, default?}' }] },
  { type: 'orm_find', category: 'database', name: 'TypeORM: Find Records', description: 'Search records using TypeORM', color: '#8b5cf6', icon: 'Search', canHaveChildren: false, fields: [{ name: 'ds', label: 'DataSource', type: 'text', default: 'AppDataSource' }, { name: 'entity', label: 'Entity name', type: 'text', required: true, placeholder: 'User' }, { name: 'where', label: 'Where (condition)', type: 'json', placeholder: '{ email: "john@example.com" }', helpText: 'TypeORM find condition object' }, { name: 'saveTo', label: 'Save results to', type: 'text', required: true }] },
  { type: 'orm_save', category: 'database', name: 'TypeORM: Save Record', description: 'Insert or update a record', color: '#8b5cf6', icon: 'Plus', canHaveChildren: false, fields: [{ name: 'ds', label: 'DataSource', type: 'text', default: 'AppDataSource' }, { name: 'entity', label: 'Entity name', type: 'text', required: true, placeholder: 'User' }, { name: 'data', label: 'Data', type: 'json', required: true, placeholder: '{ email: "john@example.com", age: 25 }' }] },
  { type: 'orm_update', category: 'database', name: 'TypeORM: Update Records', description: 'Update records with conditions', color: '#8b5cf6', icon: 'RefreshCw', canHaveChildren: false, fields: [{ name: 'ds', label: 'DataSource', type: 'text', default: 'AppDataSource' }, { name: 'entity', label: 'Entity name', type: 'text', required: true, placeholder: 'User' }, { name: 'where', label: 'Where', type: 'json', required: true, placeholder: '{ email: "john@example.com" }' }, { name: 'data', label: 'New values', type: 'json', required: true, placeholder: '{ age: 26 }' }] },
  { type: 'orm_delete', category: 'database', name: 'TypeORM: Delete Records', description: 'Remove records using TypeORM', color: '#ef4444', icon: 'Trash2', canHaveChildren: false, fields: [{ name: 'ds', label: 'DataSource', type: 'text', default: 'AppDataSource' }, { name: 'entity', label: 'Entity name', type: 'text', required: true, placeholder: 'User' }, { name: 'where', label: 'Where', type: 'json', required: true, placeholder: '{ email: "john@example.com" }' }] },
  { type: 'read_file', category: 'files', name: 'Read File', description: 'Read contents of a file', color: '#64748b', icon: 'FileText', canHaveChildren: false, fields: [{ name: 'path', label: 'File path', type: 'expression', required: true, placeholder: '"./data.txt"' }, { name: 'saveTo', label: 'Save contents to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string', helpText: 'Leave blank for inferred type' }] },
  { type: 'write_file', category: 'files', name: 'Write File', description: 'Write to a file', color: '#64748b', icon: 'Save', canHaveChildren: false, fields: [{ name: 'path', label: 'File path', type: 'expression', required: true }, { name: 'content', label: 'Content', type: 'expression', required: true }, { name: 'mode', label: 'Mode', type: 'select', default: 'overwrite', options: [{ label: 'Overwrite file', value: 'overwrite' }, { label: 'Add to end', value: 'append' }] }] },
  { type: 'delete_file', category: 'files', name: 'Delete File', description: 'Remove a file', color: '#ef4444', icon: 'Trash2', canHaveChildren: false, fields: [{ name: 'path', label: 'File path', type: 'expression', required: true }] },
  { type: 'list_files', category: 'files', name: 'List Files', description: 'Get files in a folder', color: '#64748b', icon: 'Folder', canHaveChildren: false, fields: [{ name: 'path', label: 'Folder path', type: 'expression', required: true, placeholder: '"./uploads"' }, { name: 'saveTo', label: 'Save list to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string[]', helpText: 'Leave blank for inferred type' }] },
  { type: 'run_in_background', category: 'advanced', name: 'Run in Background', description: 'Run code in a separate thread (won\'t block)', color: '#7c3aed', icon: 'Cpu', canHaveChildren: true, childrenLabel: 'Run in background:', fields: [{ name: 'name', label: 'Worker name', type: 'text', default: 'worker' }] },
  { type: 'worker_send', category: 'advanced', name: 'Send to Worker', description: 'Send a message to a background worker', color: '#8b5cf6', icon: 'Send', canHaveChildren: false, fields: [{ name: 'worker', label: 'Worker variable', type: 'text', required: true, placeholder: 'worker' }, { name: 'message', label: 'Message', type: 'expression', required: true, placeholder: '{ type: "calculate", value: 42 }' }] },
  { type: 'worker_receive', category: 'advanced', name: 'Receive from Worker', description: 'Listen for messages from a worker', color: '#8b5cf6', icon: 'MessageSquare', canHaveChildren: true, childrenLabel: 'Handle worker message:', fields: [{ name: 'worker', label: 'Worker variable', type: 'text', required: true, placeholder: 'worker' }, { name: 'saveTo', label: 'Save message to', type: 'text', required: true, placeholder: 'message' }] },
  { type: 'worker_return', category: 'advanced', name: 'Return Result (Worker)', description: 'Return a result from a worker to the parent thread', color: '#8b5cf6', icon: 'CornerDownLeft', canHaveChildren: false, fields: [{ name: 'result', label: 'Result to return', type: 'expression', required: true, placeholder: '{ status: "done", sum: 100 }' }] },
  { type: 'run_command', category: 'advanced', name: 'Run System Command', description: 'Execute a terminal command', color: '#64748b', icon: 'Terminal', canHaveChildren: false, fields: [{ name: 'command', label: 'Command', type: 'text', required: true, placeholder: 'ls -la' }, { name: 'saveTo', label: 'Save output to', type: 'text' }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string', helpText: 'Leave blank for inferred type' }] },
  { type: 'schedule', category: 'advanced', name: 'Run on Schedule', description: 'Run code at specific times', color: '#f59e0b', icon: 'Calendar', canHaveChildren: true, childrenLabel: 'Do this on schedule:', fields: [{ name: 'type', label: 'Schedule type', type: 'select', default: 'interval', options: [{ label: 'Every X seconds', value: 'interval' }, { label: 'Once after delay', value: 'timeout' }] }, { name: 'seconds', label: 'Seconds', type: 'number', default: 60 }] },
  { type: 'get_env', category: 'advanced', name: 'Get Environment Variable', description: 'Get a secret/config value', color: '#06b6d4', icon: 'Key', canHaveChildren: false, fields: [{ name: 'name', label: 'Variable name', type: 'text', required: true, placeholder: 'API_KEY' }, { name: 'saveTo', label: 'Save to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string', helpText: 'Leave blank for inferred type' }] },
  { type: 'import_file', category: 'advanced', name: 'Import from File', description: 'Use code from another file', color: '#8b5cf6', icon: 'Package', canHaveChildren: false, fields: [{ name: 'importType', label: 'Import type', type: 'select', default: 'named', options: [{ label: 'Named import { ... }', value: 'named' }, { label: 'Default import', value: 'default' }, { label: 'Namespace import * as', value: 'namespace' }, { label: 'Side-effect import', value: 'side-effect' }] }, { name: 'from', label: 'From file', type: 'text', required: true, placeholder: './utils' }, { name: 'what', label: 'What to import', type: 'text', required: true, placeholder: 'myFunction' }] },
  { type: 'export', category: 'advanced', name: 'Export', description: 'Make available to other files', color: '#8b5cf6', icon: 'Share2', canHaveChildren: false, fields: [{ name: 'exportType', label: 'Export type', type: 'select', default: 'named', options: [{ label: 'Named export { ... }', value: 'named' }, { label: 'Default export', value: 'default' }, { label: 'Re-export { ... } from', value: 're-export' }] }, { name: 'what', label: 'What to export', type: 'text', required: true, placeholder: 'myFunction' }, { name: 'from', label: 'From (for re-export)', type: 'text', placeholder: './utils' }] },
  { type: 'define_handler', category: 'functions', name: 'Define Handler', description: 'Create a callable event handler with typed parameters', color: '#a855f7', icon: 'Puzzle', canHaveChildren: true, childrenLabel: 'Handler body:', fields: [{ name: 'name', label: 'Handler name', type: 'text', required: true, placeholder: 'onUserLogin' }, { name: 'params', label: 'Parameters (JSON)', type: 'json', placeholder: '[{"name":"user","type":"string","optional":false}]', helpText: 'Define parameters as JSON array. Each param: {name, type, optional}' }, { name: 'description', label: 'What it handles', type: 'text', placeholder: 'Called when a user logs in' }] },
  { type: 'invoke_handler', category: 'functions', name: 'Invoke Handler', description: 'Call a handler with specific argument values', color: '#a855f7', icon: 'Play', canHaveChildren: false, fields: [{ name: 'name', label: 'Handler name', type: 'text', required: true }, { name: 'saveTo', label: 'Save result to (optional)', type: 'text', placeholder: 'result' }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'any', helpText: 'Leave blank for inferred type' }] },
  { type: 'group', category: 'advanced', name: 'Group', description: 'Visually group blocks together (no code generated)', color: '#6b7280', icon: 'Folder', canHaveChildren: true, childrenLabel: 'Grouped blocks:', fields: [{ name: 'name', label: 'Group name', type: 'text', placeholder: 'Setup section' }] },
  { type: 'custom_code', category: 'custom', name: 'Custom Code', description: 'Write your own TypeScript', color: '#374151', icon: 'Code', canHaveChildren: false, fields: [{ name: 'code', label: 'Your code', type: 'text', required: true, placeholder: '// Write TypeScript here' }] },
  { type: 'hash_text', category: 'security', name: 'Hash Text', description: 'Generate a hash from text (Bun-native: password hashing, crypto hash, or fast hash)', color: '#06b6d4', icon: 'Fingerprint', canHaveChildren: false, fields: [{ name: 'algorithm', label: 'Algorithm', type: 'select', default: 'sha256', options: [{ label: 'SHA-256', value: 'sha256' }, { label: 'SHA-512', value: 'sha512' }, { label: 'MD5', value: 'md5' }, { label: 'Bun fast hash (wyhash)', value: 'wyhash' }, { label: 'Bun.password (argon2id)', value: 'bun_password' }, { label: 'Bun.password (bcrypt)', value: 'bun_bcrypt' }] }, { name: 'input', label: 'Text to hash', type: 'expression', required: true, placeholder: '"password123"' }, { name: 'saveTo', label: 'Save hash to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string | number', helpText: 'Leave blank for inferred type' }] },
  { type: 'hash_verify', category: 'security', name: 'Verify Hash', description: 'Check if text matches a hash', color: '#06b6d4', icon: 'ShieldCheck', canHaveChildren: false, fields: [{ name: 'algorithm', label: 'Algorithm', type: 'select', default: 'sha256', options: [{ label: 'SHA-256', value: 'sha256' }, { label: 'SHA-512', value: 'sha512' }, { label: 'MD5', value: 'md5' }] }, { name: 'input', label: 'Text to check', type: 'expression', required: true, placeholder: '"password123"' }, { name: 'hash', label: 'Expected hash', type: 'expression', required: true, placeholder: '"5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"' }, { name: 'saveTo', label: 'Save result to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'boolean', helpText: 'Leave blank for inferred type' }] },
  { type: 'generate_uuid', category: 'security', name: 'Generate UUID', description: 'Create a random UUID', color: '#8b5cf6', icon: 'Key', canHaveChildren: false, fields: [{ name: 'saveTo', label: 'Save UUID to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string', helpText: 'Leave blank for inferred type' }] },
  { type: 'encrypt_text', category: 'security', name: 'Encrypt Text', description: 'Encrypt text with AES-256-CBC', color: '#06b6d4', icon: 'Lock', canHaveChildren: false, fields: [{ name: 'input', label: 'Text to encrypt', type: 'expression', required: true, placeholder: '"secret message"' }, { name: 'key', label: 'Encryption key (32 hex bytes)', type: 'text', required: true, placeholder: '0123456789abcdef0123456789abcdef' }, { name: 'iv', label: 'IV (16 hex bytes)', type: 'text', required: true, placeholder: '0123456789abcdef0123456789abcdef' }, { name: 'encoding', label: 'Output encoding', type: 'select', default: 'hex', options: [{ label: 'Hex', value: 'hex' }, { label: 'Base64', value: 'base64' }] }, { name: 'saveTo', label: 'Save encrypted to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string', helpText: 'Leave blank for inferred type' }] },
  { type: 'decrypt_text', category: 'security', name: 'Decrypt Text', description: 'Decrypt AES-256-CBC encrypted text', color: '#06b6d4', icon: 'Lock', canHaveChildren: false, fields: [{ name: 'input', label: 'Encrypted text', type: 'expression', required: true, placeholder: 'encryptedData' }, { name: 'key', label: 'Decryption key (32 hex bytes)', type: 'text', required: true, placeholder: '0123456789abcdef0123456789abcdef' }, { name: 'iv', label: 'IV (16 hex bytes)', type: 'text', required: true, placeholder: '0123456789abcdef0123456789abcdef' }, { name: 'encoding', label: 'Input encoding', type: 'select', default: 'hex', options: [{ label: 'Hex', value: 'hex' }, { label: 'Base64', value: 'base64' }] }, { name: 'saveTo', label: 'Save decrypted to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string', helpText: 'Leave blank for inferred type' }] },
  { type: 'generate_key', category: 'security', name: 'Generate Key & IV', description: 'Create a random 256-bit key and 128-bit IV for AES', color: '#8b5cf6', icon: 'KeyRound', canHaveChildren: false, fields: [{ name: 'saveKeyTo', label: 'Save key to', type: 'text', required: true, placeholder: 'encKey' }, { name: 'saveIvTo', label: 'Save IV to', type: 'text', required: true, placeholder: 'encIv' }, { name: 'encoding', label: 'Output encoding', type: 'select', default: 'hex', options: [{ label: 'Hex', value: 'hex' }, { label: 'Base64', value: 'base64' }] }] },
  { type: 'sign_hmac', category: 'security', name: 'HMAC Sign', description: 'Sign data with HMAC-SHA256', color: '#8b5cf6', icon: 'Signature', canHaveChildren: false, fields: [{ name: 'input', label: 'Data to sign', type: 'expression', required: true, placeholder: 'message' }, { name: 'secret', label: 'Secret key', type: 'text', required: true, placeholder: 'my-secret-key' }, { name: 'algorithm', label: 'Algorithm', type: 'select', default: 'sha256', options: [{ label: 'SHA-256', value: 'sha256' }, { label: 'SHA-512', value: 'sha512' }] }, { name: 'saveTo', label: 'Save signature to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string', helpText: 'Leave blank for inferred type' }] },
  { type: 'verify_hmac', category: 'security', name: 'Verify HMAC', description: 'Verify an HMAC-SHA256 signature', color: '#8b5cf6', icon: 'ShieldCheck', canHaveChildren: false, fields: [{ name: 'input', label: 'Original data', type: 'expression', required: true, placeholder: 'message' }, { name: 'signature', label: 'Signature to verify', type: 'expression', required: true, placeholder: 'receivedSig' }, { name: 'secret', label: 'Secret key', type: 'text', required: true, placeholder: 'my-secret-key' }, { name: 'algorithm', label: 'Algorithm', type: 'select', default: 'sha256', options: [{ label: 'SHA-256', value: 'sha256' }, { label: 'SHA-512', value: 'sha512' }] }, { name: 'saveTo', label: 'Save result to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'boolean', helpText: 'Leave blank for inferred type' }] },
  { type: 'random_bytes', category: 'security', name: 'Random Bytes', description: 'Generate cryptographically secure random bytes', color: '#8b5cf6', icon: 'Dice5', canHaveChildren: false, fields: [{ name: 'length', label: 'Number of bytes', type: 'number', default: 32, required: true }, { name: 'encoding', label: 'Output encoding', type: 'select', default: 'hex', options: [{ label: 'Hex', value: 'hex' }, { label: 'Base64', value: 'base64' }] }, { name: 'saveTo', label: 'Save to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'string', helpText: 'Leave blank for inferred type' }] },
  { type: 'start_ws_server', category: 'websocket', name: 'Start WebSocket Server', description: 'Create a WebSocket server that handles real-time connections', color: '#06b6d4', icon: 'Radio', canHaveChildren: true, childrenLabel: 'WebSocket event handlers:', fields: [{ name: 'port', label: 'Port number', type: 'number', default: 8080, helpText: 'WebSocket server port' }] },
  { type: 'csrf_token', category: 'security', name: 'CSRF Token (Generate)', description: 'Generate a CSRF token signed with HMAC using Bun.CSRF', color: '#8b5cf6', icon: 'Shield', canHaveChildren: false, fields: [{ name: 'secret', label: 'Secret key', type: 'text', required: true, placeholder: 'my-csrf-secret', helpText: 'Shared secret for signing tokens' }, { name: 'sessionId', label: 'Session ID (optional)', type: 'expression', placeholder: '"user-session-id"', helpText: 'Bind to a session/user ID for extra security' }, { name: 'expiresIn', label: 'Expires in (ms)', type: 'number', default: 86400000, helpText: 'Token validity window (default 24h)' }, { name: 'saveTo', label: 'Save token to', type: 'text', required: true }] },
  { type: 'csrf_verify', category: 'security', name: 'CSRF Token (Verify)', description: 'Verify a CSRF token using Bun.CSRF.verify', color: '#8b5cf6', icon: 'ShieldCheck', canHaveChildren: false, fields: [{ name: 'token', label: 'Token to verify', type: 'expression', required: true, placeholder: 'receivedToken' }, { name: 'secret', label: 'Secret key', type: 'text', required: true, placeholder: 'my-csrf-secret', helpText: 'Must match the secret used to generate' }, { name: 'sessionId', label: 'Session ID (optional)', type: 'expression', placeholder: '"user-session-id"', helpText: 'Must match the sessionId used in generate' }, { name: 'saveTo', label: 'Save result to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'boolean', helpText: 'Leave blank for inferred type' }] },
  { type: 'ws_on_open', category: 'websocket', name: 'On Connection Open', description: 'Run when a new WebSocket connects - place inside WebSocket Server', color: '#22c55e', icon: 'LogIn', canHaveChildren: true, childrenLabel: 'Do on connection:', fields: [] },
  { type: 'ws_on_message', category: 'websocket', name: 'On Message Received', description: 'Run when a message is received - place inside WebSocket Server', color: '#3b82f6', icon: 'MessageSquare', canHaveChildren: true, childrenLabel: 'Handle message:', fields: [] },
  { type: 'ws_on_close', category: 'websocket', name: 'On Connection Close', description: 'Run when a WebSocket disconnects - place inside WebSocket Server', color: '#ef4444', icon: 'LogOut', canHaveChildren: true, childrenLabel: 'Clean up:', fields: [] },
  { type: 'ws_send', category: 'websocket', name: 'Send to Client', description: 'Send a message to a connected client', color: '#06b6d4', icon: 'Send', canHaveChildren: false, fields: [{ name: 'ws', label: 'WebSocket client', type: 'expression', required: true, placeholder: 'ws', helpText: 'Use "ws" in On Message handler, or store ref in On Open' }, { name: 'data', label: 'Message', type: 'expression', required: true, placeholder: '"Hello from server"' }, { name: 'type', label: 'Message type', type: 'select', default: 'text', options: [{ label: 'Text', value: 'text' }, { label: 'Binary (Uint8Array)', value: 'binary' }] }] },
  { type: 'ws_broadcast', category: 'websocket', name: 'Broadcast to All', description: 'Send a message to all connected clients', color: '#06b6d4', icon: 'Radio', canHaveChildren: false, fields: [{ name: 'server', label: 'Server variable', type: 'text', default: 'server', helpText: 'The variable holding the Bun.serve result' }, { name: 'data', label: 'Message', type: 'expression', required: true, placeholder: '"Hello everyone!"' }] },
  { type: 'ws_get_clients', category: 'websocket', name: 'Get Connected Clients', description: 'Get the count or list of connected WebSocket clients', color: '#06b6d4', icon: 'Users', canHaveChildren: false, fields: [{ name: 'server', label: 'Server variable', type: 'text', default: 'server', helpText: 'The variable holding the Bun.serve result' }, { name: 'saveTo', label: 'Save count to', type: 'text', required: true }, { name: 'type', label: 'Type (optional)', type: 'text', placeholder: 'number', helpText: 'Leave blank for inferred type' }] },
];

export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return BLOCK_DEFINITIONS.find(b => b.type === type);
}

export function generateCode(blocks: Block[]): string {
  const bodyLines: string[] = [];

  blocks.forEach(block => {
    const code = generateBlock(block, 0);
    if (code) bodyLines.push(code);
  });

  if (blocks.length === 0) {
    bodyLines.push('// Add blocks to the canvas to generate code.');
  }

  const codeBody = bodyLines.join('\n');

  const autoImports: string[] = [];

  const cryptoImports: string[] = [];
  if (/\bcreateCipheriv\(/.test(codeBody)) cryptoImports.push('createCipheriv');
  if (/\bcreateDecipheriv\(/.test(codeBody)) cryptoImports.push('createDecipheriv');
  if (/\brandomBytes\(/.test(codeBody)) cryptoImports.push('randomBytes');
  if (/\bcreateHmac\(/.test(codeBody)) cryptoImports.push('createHmac');

  const dbImports: string[] = [];
  if (/\bnew Database\(/.test(codeBody)) dbImports.push('Database');
  if (/\bpostgres\(/.test(codeBody)) dbImports.push('postgres');
  if (/\bmysql\.createConnection\(/.test(codeBody) || /\bmysql2\/promise\b/.test(codeBody)) dbImports.push('mysql');
  if (/\bnew Redis\(/.test(codeBody)) dbImports.push('Redis');
  if (/\bnew MongoClient\(/.test(codeBody)) dbImports.push('MongoClient');
  if (/\bnew DataSource\(/.test(codeBody)) dbImports.push('DataSource');

  if (cryptoImports.length > 0) {
    const uniqueImports = [...new Set(cryptoImports)].join(', ');
    autoImports.push(`import { ${uniqueImports} } from "crypto";`);
  }

  if (dbImports.length > 0) {
    const uniqueDbImports = [...new Set(dbImports)];
    if (uniqueDbImports.includes('Database')) autoImports.push('import { Database } from "bun:sqlite";');
    if (uniqueDbImports.includes('postgres')) autoImports.push('import postgres from "postgres";');
    if (uniqueDbImports.includes('mysql')) autoImports.push('import mysql from "mysql2/promise";');
    if (uniqueDbImports.includes('Redis')) autoImports.push('import Redis from "ioredis";');
    if (uniqueDbImports.includes('MongoClient')) autoImports.push('import { MongoClient } from "mongodb";');
    if (uniqueDbImports.includes('DataSource')) autoImports.push('import { DataSource } from "typeorm";');
  }

  if (/\bnodemailer\.createTransport\(/.test(codeBody)) {
    autoImports.push('import nodemailer from "nodemailer";');
  }

  const parts: string[] = [
    '/*',
    '* Generated by Ecli.app Visual Editor',
    '* Runtime: Bun (https://bun.sh)',
    '*/',
  ];

  if (autoImports.length > 0) {
    parts.push('', ...autoImports, '');
  } else {
    parts.push('');
  }

  parts.push(codeBody);

  let output = parts.join('\n');
  output = output.replace(/\}\n(\s*)else\s*\{/g, '} else {');
  output = output.replace(/\}\n(\s*)else\s+if\s*\(/g, '} else if (');
  return output;
}

function indent(level: number): string {
  return '  '.repeat(level);
}

function typeAnn(config: Record<string, unknown>): string {
  return config.type ? `: ${String(config.type)}` : '';
}

function generateCondition(left: unknown, comparison: string, right: unknown): string {
  const leftStr = String(left);
  const rightStr = String(right);
  switch (comparison) {
    case 'equals': return `${leftStr} === ${rightStr}`;
    case 'notEquals': return `${leftStr} !== ${rightStr}`;
    case 'greater': return `${leftStr} > ${rightStr}`;
    case 'less': return `${leftStr} < ${rightStr}`;
    case 'greaterEqual': return `${leftStr} >= ${rightStr}`;
    case 'lessEqual': return `${leftStr} <= ${rightStr}`;
    case 'contains': return `String(${leftStr}).includes(${rightStr})`;
    case 'isEmpty': return `!${leftStr} || ${leftStr}.length === 0`;
    case 'isNotEmpty': return `${leftStr} && ${leftStr}.length > 0`;
    case 'isTrue': return `${leftStr}`;
    default: return `${leftStr} === ${rightStr}`;
  }
}

const MAX_PROJECT_SIZE = 10 * 1024 * 1024;

function renderChildren(children: Block[], indentLevel: number, _depth: number, placeholder?: string): string {
  if (children && children.length > 0) {
    let code = '';
    children.forEach(child => { code += generateBlock(child, indentLevel + 1, _depth + 1) + '\n'; });
    return code;
  }
  return placeholder ? `${indent(indentLevel)}  // ${placeholder}\n` : '';
}

function generateBlock(block: Block, indentLevel: number, _depth = 0): string {
  if (_depth > 200) return `${indent(indentLevel)}\n// Max nesting depth exceeded, use multiple files for this!`;
  const { type, config, children } = block;
  const ind = indent(indentLevel);

  switch (type) {
    case 'print': {
      const msg = config.message ?? '"Hello!"';
      const label = String(config.label || '');
      return label ? `${ind}console.log(${label}, ${msg});` : `${ind}console.log(${msg});`;
    }
    case 'comment':
      return `${ind}// ${config.text || 'add a note here'}`;
    case 'wait': {
      const seconds = config.seconds ?? 1;
      return `${ind}await new Promise(resolve => setTimeout(resolve, ${Number(seconds) * 1000}));`;
    }
    case 'create_variable': {
      const name = config.name || 'myVar';
      const value = config.value ?? 'null';
      const type = config.type ? `: ${config.type}` : '';
      const keyword = config.global ? 'const' : 'let';
      return `${ind}${keyword} ${name}${type} = ${value};`;
    }
    case 'change_variable': {
      const name = config.name || 'myVar';
      const value = config.value ?? 'null';
      return `${ind}${name} = ${value};`;
    }
    case 'create_list': {
      const name = config.name || 'myList';
      const items = config.items || '';
      const keyword = config.global ? 'const' : 'let';
      return `${ind}${keyword} ${name} = [${items}];`;
    }
    case 'add_to_list': {
      const list = config.list || 'myList';
      const item = config.item ?? 'null';
      const where = config.where || 'end';
      return where === 'start' ? `${ind}${list}.unshift(${item});` : `${ind}${list}.push(${item});`;
    }
    case 'remove_from_list': {
      const list = config.list || 'myList';
      const what = config.what || 'last';
      if (what === 'first') return `${ind}${list}.shift();`;
      if (what === 'index') return `${ind}${list}.splice(${config.index ?? 0}, 1);`;
      return `${ind}${list}.pop();`;
    }
    case 'get_from_list': {
      const list = config.list || 'myList';
      const what = config.what || 'first';
      const saveTo = config.saveTo || 'item';
      const index = config.index ?? 0;
      let expr: string;
      switch (what) {
        case 'first': expr = `${list}[0]`; break;
        case 'last': expr = `${list}[${list}.length - 1]`; break;
        case 'index': expr = `${list}[${index}]`; break;
        case 'random': expr = `${list}[Math.floor(Math.random() * ${list}.length)]`; break;
        case 'length': expr = `${list}.length`; break;
        default: expr = `${list}[0]`;
      }
      return `${ind}let ${saveTo}${typeAnn(config)} = ${expr};`;
    }
    case 'create_object': {
      const name = config.name || 'myObject';
      const keyword = config.global ? 'const' : 'let';
      return `${ind}${keyword} ${name} = {};`;
    }
    case 'set_property': {
      const object = config.object || 'myObject';
      const property = config.property || 'key';
      const value = config.value ?? 'null';
      return `${ind}${object}.${property} = ${value};`;
    }
    case 'get_property': {
      const object = config.object || 'myObject';
      const property = config.property || 'key';
      const saveTo = config.saveTo || 'value';
      return `${ind}let ${saveTo}${typeAnn(config)} = ${object}.${property};`;
    }
    case 'math': {
      const left = config.left ?? '0';
      const right = config.right ?? '0';
      const saveTo = String(config.saveTo || 'result');
      const operation = String(config.operation || 'add');
      const ops: Record<string, string> = { add: '+', subtract: '-', multiply: '*', divide: '/', modulo: '%', power: '**' };
      return `${ind}let ${saveTo}${typeAnn(config)} = ${left} ${ops[String(operation)] || '+'} ${right};`;
    }
    case 'text_join': {
      const text1 = config.text1 ?? '""';
      const text2 = config.text2 ?? '""';
      const saveTo = config.saveTo || 'result';
      return `${ind}let ${saveTo}${typeAnn(config)} = String(${text1}) + String(${text2});`;
    }
    case 'random_number': {
      const min = config.min ?? 1;
      const max = config.max ?? 100;
      const saveTo = config.saveTo || 'randomNum';
      return `${ind}let ${saveTo}${typeAnn(config)} = Math.floor(Math.random() * (${max} - ${min} + 1)) + ${min};`;
    }
    case 'if': {
      const left = config.left ?? 'true';
      const comparison = String(config.comparison || 'equals');
      const right = config.right ?? 'true';
      let cond = generateCondition(left, comparison, right);
      const rawConditions = String(config.conditions || '[]');
      let extraConds: { op: string; left: string; comparison: string; right: string }[] = [];
      try { const p = JSON.parse(rawConditions); if (Array.isArray(p)) extraConds = p; } catch {}
      for (const c of extraConds) {
        const op = c.op === 'or' ? ' || ' : ' && ';
        cond = `(${cond})${op}(${generateCondition(c.left || 'true', c.comparison || 'equals', c.right || 'true')})`;
      }
      let code = `${ind}if (${cond}) {\n`;
      code += renderChildren(children, indentLevel, _depth, 'add blocks here');
      code += `${ind}}`;
      return code;
    }
    case 'otherwise': {
      let code = `${ind}else {\n`;
      code += renderChildren(children, indentLevel, _depth, 'add blocks here');
      code += `${ind}}`;
      return code;
    }
    case 'otherwise_if': {
      const left = config.left ?? 'true';
      const comparison = String(config.comparison || 'equals');
      const right = config.right ?? 'true';
      let cond = generateCondition(left, comparison, right);
      const rawConditions = String(config.conditions || '[]');
      let extraConds: { op: string; left: string; comparison: string; right: string }[] = [];
      try { const p = JSON.parse(rawConditions); if (Array.isArray(p)) extraConds = p; } catch {}
      for (const c of extraConds) {
        const op = c.op === 'or' ? ' || ' : ' && ';
        cond = `(${cond})${op}(${generateCondition(c.left || 'true', c.comparison || 'equals', c.right || 'true')})`;
      }
      let code = `${ind}else if (${cond}) {\n`;
      code += renderChildren(children, indentLevel, _depth, 'add blocks here');
      code += `${ind}}`;
      return code;
    }
    case 'switch': {
      const value = config.value ?? 'value';
      let code = `${ind}switch (${value}) {\n`;
      code += renderChildren(children, indentLevel, _depth);
      code += `${ind}}`;
      return code;
    }
    case 'case': {
      const caseValue = config.value ?? '"value"';
      let code = `${ind}case ${caseValue}:\n`;
      code += renderChildren(children, indentLevel, _depth, 'add blocks here');
      code += `${ind}break;`;
      return code;
    }
    case 'default_case': {
      let code = `${ind}default:\n`;
      code += renderChildren(children, indentLevel, _depth, 'add blocks here');
      code += `${ind}break;`;
      return code;
    }
    case 'create_function': {
      const name = String(config.name || 'myFunction');
      const inputs = String(config.inputs || '');
      const typedParams = inputs ? inputs.split(',').map((s: string) => { const part = s.trim(); if (!part) return ''; const parts = part.split(':'); if (parts.length > 1) return `${parts[0].trim()}: ${parts.slice(1).join(':').trim()}`; return `${part}: unknown`; }).filter(Boolean).join(', ') : '';
      if (config.global) {
        let code = `${ind}function ${name}(${typedParams}) {\n`;
        code += renderChildren(children, indentLevel, _depth, 'add blocks here');
        code += `${ind}}`;
        return code;
      }
      let code = `${ind}const ${name} = (${typedParams}) => {\n`;
      code += renderChildren(children, indentLevel, _depth, 'add blocks here');
      code += `${ind}};`;
      return code;
    }
    case 'run_function': {
      const name = config.name || 'myFunction';
      const inputs = config.inputs || '';
      const saveTo = config.saveTo;
      return saveTo ? `${ind}let ${saveTo}${typeAnn(config)} = ${name}(${inputs});` : `${ind}${name}(${inputs});`;
    }
    case 'define_handler': {
      const hName = config.name || 'handler';
      let paramsRaw: { name: string; type: string; optional?: boolean }[] = [];
      try { const p = JSON.parse(String(config.params || '[]')); if (Array.isArray(p)) paramsRaw = p; } catch {}
      const paramEntries = paramsRaw.map(p =>
        `${p.name}${p.optional ? '?' : ''}: ${p.type || 'unknown'}`
      );
      let code = `${ind}async function ${hName}({ ${paramEntries.join(', ')} }: { ${paramEntries.join('; ')} }) {\n`;
      code += renderChildren(children, indentLevel, _depth, 'add blocks here');
      code += `${ind}}`;
      return code;
    }
    case 'invoke_handler': {
      const hName = config.name || 'handler';
      const saveTo = config.saveTo;
      const argKeys = Object.keys(config).filter(k => k.startsWith('arg_'));
      const args = argKeys.map(k => `${k.slice(4)}: ${config[k]}`).join(', ');
      const call = `${hName}({ ${args} })`;
      return saveTo ? `${ind}const ${saveTo}${typeAnn(config)} = await ${call};` : `${ind}await ${call};`;
    }
    case 'return_value': {
      return `${ind}return ${config.value ?? 'undefined'};`;
    }
    case 'try': {
      let code = `${ind}try {\n`;
      code += renderChildren(children, indentLevel, _depth, 'add blocks here');
      code += `${ind}}`;
      return code;
    }
    case 'catch_error': {
      const errorName = config.errorName || 'error';
      let code = `${ind}catch (${errorName}) {\n`;
      code += renderChildren(children, indentLevel, _depth, `console.error(${errorName});`);
      code += `${ind}}`;
      return code;
    }
    case 'start_server': {
      const port = config.port ?? 3000;
      let code = `${ind}const server = Bun.serve({\n`;
      code += `${ind}  port: ${port},\n`;
      code += `${ind}  async fetch(request) {\n`;
      code += `${ind}    const url = new URL(request.url);\n`;
      code += `${ind}    const method = request.method;\n`;
      children.forEach(child => { code += generateBlock(child, indentLevel + 2, _depth + 1) + '\n'; });
      code += `${ind}    return new Response("Not Found", { status: 404 });\n`;
      code += `${ind}  },\n`;
      code += `${ind}});\n`;
      code += `${ind}console.log(\`Server running at http://localhost:\${server.port}\`);`;
      return code;
    }
    case 'route': {
      const method = config.method || 'GET';
      const path = config.path || '/';
      let code = `${ind}if (method === "${method}" && url.pathname === "${path}") {\n`;
      code += renderChildren(children, indentLevel, _depth);
      code += `${ind}}`;
      return code;
    }
    case 'send_response': {
      const responseType = config.type || 'json';
      const data = config.data ?? '{ message: "Hello" }';
      const status = config.status || '200';
      if (responseType === 'json') return `${ind}return Response.json(${data}, { status: ${status} });`;
      if (responseType === 'html') return `${ind}return new Response(${data}, { status: ${status}, headers: { "Content-Type": "text/html" } });`;
      return `${ind}return new Response(${data}, { status: ${status} });`;
    }
    case 'get_request_data': {
      const from = config.from || 'body';
      const saveTo = config.saveTo || 'data';
      const ta = typeAnn(config);
      if (from === 'body') return `${ind}const ${saveTo}${ta} = await request.json();`;
      if (from === 'params') return `${ind}const ${saveTo}${ta} = Object.fromEntries(url.searchParams);`;
      if (from === 'headers') return `${ind}const ${saveTo}${ta} = Object.fromEntries(request.headers);`;
      return `${ind}const ${saveTo}${ta} = await request.json();`;
    }
    case 'fetch_url': {
      const url = config.url ?? '"https://api.example.com"';
      const method = config.method || 'GET';
      const body = config.body;
      const saveTo = config.saveTo || 'response';
      let fetchOptions = `method: "${method}"`;
      if (body && method !== 'GET') fetchOptions += `, body: JSON.stringify(${body}), headers: { "Content-Type": "application/json" }`;
      return `${ind}const ${saveTo}${typeAnn(config)} = await fetch(${url}, { ${fetchOptions} }).then(r => r.json());`;
    }
    case 'send_email': {
      const to = config.to ?? '"user@example.com"';
      const subject = config.subject ?? '"Hello"';
      const body = config.body ?? '"Message"';
      const transport = String(config.transport || 'transporter');
      const from = String(config.from || '');
      const smtpHost = String(config.smtpHost || '');
      const smtpPort = Number(config.smtpPort) || 587;
      const smtpSecure = config.smtpSecure !== undefined ? Boolean(config.smtpSecure) : smtpPort === 465;
      const smtpUser = String(config.smtpUser || '');
      const smtpPass = String(config.smtpPass || '');
      const fromLine = from ? `${ind}  from: ${JSON.stringify(from)},\n` : '';

      let code = '';
      if (smtpHost) {
        const authLine = smtpUser || smtpPass
          ? `${ind}  auth: { user: ${JSON.stringify(smtpUser)}, pass: ${JSON.stringify(smtpPass)} },\n`
          : '';
        code += `${ind}const ${transport} = nodemailer.createTransport({\n`;
        code += `${ind}  host: ${JSON.stringify(smtpHost)},\n`;
        code += `${ind}  port: ${smtpPort},\n`;
        code += `${ind}  secure: ${smtpSecure},\n`;
        code += authLine;
        code += `${ind}});\n`;
      }
      code += `${ind}await ${transport}.sendMail({\n`;
      code += fromLine;
      code += `${ind}  to: ${to},\n`;
      code += `${ind}  subject: ${subject},\n`;
      code += `${ind}  text: String(${body}),\n`;
      code += `${ind}});`;
      return code;
    }
    case 'create_smtp_transport': {
      const name = String(config.name || 'transporter');
      const host = String(config.host || 'smtp.gmail.com');
      const port = Number(config.port) || 587;
      const secure = config.secure !== undefined ? Boolean(config.secure) : port === 465;
      const user = String(config.user || '');
      const pass = String(config.pass || '');
      const authLine = user || pass
        ? `${ind}  auth: { user: ${JSON.stringify(user)}, pass: ${JSON.stringify(pass)} },\n`
        : '';
      return `${ind}const ${name} = nodemailer.createTransport({\n${ind}  host: ${JSON.stringify(host)},\n${ind}  port: ${port},\n${ind}  secure: ${secure},\n${authLine}${ind}});`;
    }
    case 'connect_database': {
      const dbType = config.type || 'sqlite';
      const name = config.name || 'db';
      const conn = config.connection ?? '';
      const host = config.host || 'localhost';
      const port = config.port || '';
      const user = config.username || 'root';
      const pass = config.password || '';
      const dbname = config.database || 'mydb';
      if (dbType === 'sqlite') {
        const path = conn || ':memory:';
        return `${ind}const ${name} = new Database(${path});`;
      }
      if (dbType === 'postgres') {
        const url = conn || `postgres://${user}:${pass}@${host}:${port || 5432}/${dbname}`;
        return `${ind}const ${name} = postgres("${url}");`;
      }
      if (dbType === 'mysql' || dbType === 'mariadb') {
        const url = conn || `mysql://${user}:${pass}@${host}:${port || 3306}/${dbname}`;
        return `${ind}const ${name} = await mysql.createConnection("${url}");`;
      }
      return `${ind}const ${name} = new Database(":memory:");`;
    }
    case 'db_find': {
      const driver = config.driver || 'sqlite';
      const table = config.table || 'users';
      const saveTo = config.saveTo || 'results';
      const where = config.where || '';
      const db = config.db || 'db';
      if (driver === 'sqlite') {
        return where ? `${ind}const ${saveTo}${typeAnn(config)} = ${db}.query("SELECT * FROM ${table} WHERE ${where}").all();` : `${ind}const ${saveTo}${typeAnn(config)} = ${db}.query("SELECT * FROM ${table}").all();`;
      }
      if (driver === 'postgres') {
        return where ? `${ind}const ${saveTo}${typeAnn(config)} = await ${db}\`SELECT * FROM ${table} WHERE ${where}\`;` : `${ind}const ${saveTo}${typeAnn(config)} = await ${db}\`SELECT * FROM ${table}\`;`;
      }
      if (driver === 'mysql') {
        const cond = where ? ` WHERE ${where}` : '';
        return `${ind}const [${saveTo}]${typeAnn(config)} = await ${db}.execute("SELECT * FROM ${table}${cond}");`;
      }
      return `${ind}const ${saveTo}${typeAnn(config)} = []; // Unsupported driver: ${driver}`;
    }
    case 'db_add': {
      const driver = config.driver || 'sqlite';
      const table = config.table || 'users';
      const data = config.data || '{}';
      const db = config.db || 'db';
      if (driver === 'sqlite') return `${ind}${db}.run("INSERT INTO ${table} ...", Object.values(${data}));`;
      if (driver === 'postgres') return `${ind}await ${db}\`INSERT INTO ${table} \${${data}}\`;`;
      if (driver === 'mysql') return `${ind}await ${db}.execute("INSERT INTO ${table} SET ?", ${data});`;
      return `${ind}// Unsupported driver: ${driver}`;
    }
    case 'db_update': {
      const driver = config.driver || 'sqlite';
      const table = config.table || 'users';
      const where = config.where || 'id = ?';
      const data = config.data || '{}';
      const db = config.db || 'db';
      if (driver === 'sqlite') return `${ind}${db}.run("UPDATE ${table} SET ... WHERE ${where}");`;
      if (driver === 'postgres') return `${ind}await ${db}\`UPDATE ${table} SET \${${data}} WHERE ${where}\`;`;
      if (driver === 'mysql') return `${ind}await ${db}.execute("UPDATE ${table} SET ? WHERE ${where}", ${data});`;
      return `${ind}// Unsupported driver: ${driver}`;
    }
    case 'db_delete': {
      const driver = config.driver || 'sqlite';
      const table = config.table || 'users';
      const where = config.where || 'id = ?';
      const db = config.db || 'db';
      if (driver === 'sqlite') return `${ind}${db}.run("DELETE FROM ${table} WHERE ${where}");`;
      if (driver === 'postgres') return `${ind}await ${db}\`DELETE FROM ${table} WHERE ${where}\`;`;
      if (driver === 'mysql') return `${ind}await ${db}.execute("DELETE FROM ${table} WHERE ${where}");`;
      return `${ind}// Unsupported driver: ${driver}`;
    }
    case 'connect_redis': {
      const rName = config.name || 'redis';
      const rConn = config.connection || 'redis://localhost:6379';
      return `${ind}const ${rName} = new Redis("${rConn}");`;
    }
    case 'redis_set': {
      const client = config.client || 'redis';
      const key = config.key || 'mykey';
      const value = config.value ?? '"value"';
      const ttl = config.ttl != null ? Number(config.ttl) : 0;
      if (ttl > 0) return `${ind}await ${client}.set(${key}, ${value}, "EX", ${ttl});`;
      return `${ind}await ${client}.set(${key}, ${value});`;
    }
    case 'redis_get': {
      const client = config.client || 'redis';
      const key = config.key || 'mykey';
      const saveTo = config.saveTo || 'result';
      return `${ind}const ${saveTo}${typeAnn(config)} = await ${client}.get(${key});`;
    }
    case 'redis_del': {
      const client = config.client || 'redis';
      const key = config.key || 'mykey';
      return `${ind}await ${client}.del(${key});`;
    }
    case 'connect_mongodb': {
      const mName = config.name || 'mongo';
      const mConn = config.connection || 'mongodb://localhost:27017';
      const mDb = config.dbName || 'mydb';
      return `${ind}const ${mName}Client = new MongoClient("${mConn}");\n${ind}await ${mName}Client.connect();\n${ind}const ${mName} = ${mName}Client.db("${mDb}");`;
    }
    case 'mongo_find': {
      const client = config.client || 'mongo';
      const coll = config.collection || 'users';
      const filter = config.filter || '{}';
      const saveTo = config.saveTo || 'results';
      return `${ind}const ${saveTo}${typeAnn(config)} = await ${client}.collection("${coll}").find(${filter}).toArray();`;
    }
    case 'mongo_insert': {
      const client = config.client || 'mongo';
      const coll = config.collection || 'users';
      const data = config.data || '{}';
      return `${ind}await ${client}.collection("${coll}").insertOne(${data});`;
    }
    case 'mongo_update': {
      const client = config.client || 'mongo';
      const coll = config.collection || 'users';
      const filter = config.filter || '{}';
      const upd = config.update || '{}';
      return `${ind}await ${client}.collection("${coll}").updateMany(${filter}, ${upd});`;
    }
    case 'mongo_delete': {
      const client = config.client || 'mongo';
      const coll = config.collection || 'users';
      const filter = config.filter || '{}';
      return `${ind}await ${client}.collection("${coll}").deleteMany(${filter});`;
    }
    case 'connect_typeorm': {
      const tName = config.name || 'AppDataSource';
      const tType = config.type || 'sqlite';
      const tConn = config.connection || '';
      const tHost = config.host || 'localhost';
      const tPort = config.port ? Number(config.port) : (tType === 'postgres' ? 5432 : 3306);
      const tUser = config.username || 'root';
      const tPass = config.password || '';
      const tDb = config.database || 'mydb';
      const tSync = config.sync !== false;
      if (tConn) return `${ind}const ${tName} = new DataSource({ type: "${tType}", url: "${tConn}", synchronize: ${tSync}, entities: [] });\n${ind}await ${tName}.initialize();`;
      return `${ind}const ${tName} = new DataSource({ type: "${tType}", host: "${tHost}", port: ${tPort}, username: "${tUser}", password: "${tPass}", database: "${tDb}", synchronize: ${tSync}, entities: [] });\n${ind}await ${tName}.initialize();`;
    }
    case 'orm_entity': {
      const eName = config.name || 'MyEntity';
      const eTable = config.table || '';
      const eCols = config.columns || '[]';
      let eColsStr = '';
      try {
        const cols = typeof eCols === 'string' ? JSON.parse(eCols) : eCols;
        if (Array.isArray(cols)) {
          eColsStr = cols.map((c: Record<string, unknown>) => {
            let col = `  @Column()\n  ${c.name}: ${c.type || 'string'};`;
            if (c.primary) col = `  @PrimaryGeneratedColumn()\n  ${c.name}: ${c.type || 'number'};`;
            if (c.unique) col = `  @Column({ unique: true })\n  ${c.name}: ${c.type || 'string'};`;
            return col;
          }).join('\n');
        }
      } catch { eColsStr = `  // Parse columns JSON: ${eCols}`; }
      const tableDecor = eTable ? `@Entity("${eTable}")` : '@Entity()';
      return `${ind}${tableDecor}\n${ind}export class ${eName} {\n${eColsStr ? indent(indentLevel + 1) + eColsStr.replace(/\n/g, '\n' + indent(indentLevel + 1)) + '\n' : ''}${ind}}`;
    }
    case 'orm_find': {
      const ds = config.ds || 'AppDataSource';
      const entity = config.entity || 'User';
      const where = config.where || '{}';
      const saveTo = config.saveTo || 'results';
      return `${ind}const ${saveTo}${typeAnn(config)} = await ${ds}.getRepository(${entity}).find({ where: ${where} });`;
    }
    case 'orm_save': {
      const ds = config.ds || 'AppDataSource';
      const entity = config.entity || 'User';
      const data = config.data || '{}';
      return `${ind}const repo = ${ds}.getRepository(${entity});\n${ind}await repo.save(${data});`;
    }
    case 'orm_update': {
      const ds = config.ds || 'AppDataSource';
      const entity = config.entity || 'User';
      const where = config.where || '{}';
      const data = config.data || '{}';
      return `${ind}await ${ds}.getRepository(${entity}).update(${where}, ${data});`;
    }
    case 'orm_delete': {
      const ds = config.ds || 'AppDataSource';
      const entity = config.entity || 'User';
      const where = config.where || '{}';
      return `${ind}await ${ds}.getRepository(${entity}).delete(${where});`;
    }
    case 'read_file': {
      const saveTo = String(config.saveTo || 'content');
      return `${ind}const ${saveTo}${typeAnn(config)} = await Bun.file(${config.path ?? '"./file.txt"'}).text();`;
    }
    case 'write_file': return `${ind}await Bun.write(${config.path ?? '"./file.txt"'}, ${config.content ?? '"Hello"'});`;
    case 'delete_file': return `${ind}await Bun.file(${config.path ?? '"./file.txt"'}).delete();`;
    case 'list_files': {
      const saveTo = String(config.saveTo || 'files');
      return `${ind}import { readdir } from "fs/promises";\n${ind}const ${saveTo}${typeAnn(config)} = await readdir(${config.path ?? '"."'});`;
    }
    case 'run_in_background': return `${ind}Bun.spawn(["bun", "run", "${config.name || 'worker'}.ts"]);`;
    case 'worker_send': {
      const worker = String(config.worker || 'worker');
      const msg = String(config.message || '{}');
      return `${ind}${worker}.send(${msg});`;
    }
    case 'worker_receive': {
      const worker = String(config.worker || 'worker');
      const saveTo = String(config.saveTo || 'message');
      let code = `${ind}${worker}.on("message", (${saveTo}) => {\n`;
      code += renderChildren(children, indentLevel, _depth);
      code += `${ind}});`;
      return code;
    }
    case 'worker_return': {
      const result = String(config.result || '{}');
      return `${ind}parentPort.postMessage(${result});`;
    }
    case 'run_command': {
      const saveTo = String(config.saveTo || 'output');
      const rawCmd = typeof config.command === 'string' && String(config.command).startsWith('"') ? String(config.command).slice(1, -1) : config.command || 'ls';
      return `${ind}const ${saveTo}${typeAnn(config)} = await Bun.$\`${rawCmd}\`.text();`;
    }
    case 'schedule': {
      const scheduleType = config.type || 'interval';
      const seconds = config.seconds ?? 60;
      if (scheduleType === 'timeout') {
        let code = `${ind}setTimeout(async () => {\n`;
        code += renderChildren(children, indentLevel, _depth);
        code += `${ind}}, ${Number(seconds) * 1000});`;
        return code;
      }
      let code = `${ind}setInterval(async () => {\n`;
      code += renderChildren(children, indentLevel, _depth);
      code += `${ind}}, ${Number(seconds) * 1000});`;
      return code;
    }
    case 'get_env': {
      const saveTo = String(config.saveTo || 'value');
      return `${ind}const ${saveTo}${typeAnn(config)} = Bun.env.${config.name || 'MY_VAR'} ?? ${config.default ?? '""'};`;
    }
    case 'import_file': {
      const style = String(config.importType || 'named');
      const from = String(config.from || './utils');
      const what = String(config.what || 'myFunction');
      if (style === 'default') return `${ind}import ${what} from "${from}";`;
      if (style === 'namespace') return `${ind}import * as ${what} from "${from}";`;
      if (style === 'side-effect') return `${ind}import "${from}";`;
      return `${ind}import { ${what} } from "${from}";`;
    }
    case 'export': {
      const eStyle = String(config.exportType || 'named');
      const eWhat = String(config.what || 'myFunction');
      if (eStyle === 'default') return `${ind}export default ${eWhat};`;
      if (eStyle === 're-export') return `${ind}export { ${eWhat} } from "${config.from || './utils'}";`;
      return `${ind}export { ${eWhat} };`;
    }
    case 'group': {
      let code = '';
      if (children && children.length > 0) children.forEach(child => { code += generateBlock(child, indentLevel, _depth + 1) + '\n'; });
      return code.trimEnd();
    }
    case 'custom_code': return `${ind}${config.code || '// write your TypeScript here'}`;
    case 'hash_text': {
      const alg = String(config.algorithm || 'sha256');
      const input = String(config.input || '""');
      const saveTo = String(config.saveTo || 'hash');
      if (alg === 'wyhash') return `${ind}const ${saveTo}${typeAnn(config)} = Bun.hash(${input});`;
      if (alg === 'bun_password') return `${ind}const ${saveTo}${typeAnn(config)} = await Bun.password.hash(${input}, { algorithm: "argon2id" });`;
      if (alg === 'bun_bcrypt') return `${ind}const ${saveTo}${typeAnn(config)} = await Bun.password.hash(${input}, { algorithm: "bcrypt" });`;
      return `${ind}const ${saveTo}${typeAnn(config)} = new Bun.CryptoHasher("${alg}").update(${input}).digest("hex");`;
    }
    case 'hash_verify': {
      const alg = String(config.algorithm || 'sha256');
      const input = String(config.input || '""');
      const hash = String(config.hash || '""');
      const saveTo = String(config.saveTo || 'valid');
      return `${ind}const ${saveTo}${typeAnn(config)} = new Bun.CryptoHasher("${alg}").update(${input}).digest("hex") === ${hash};`;
    }
    case 'generate_uuid': {
      const saveTo = String(config.saveTo || 'uuid');
      return `${ind}const ${saveTo}${typeAnn(config)} = crypto.randomUUID();`;
    }
    case 'encrypt_text': {
      const input = String(config.input || '""');
      const key = String(config.key || '');
      const iv = String(config.iv || '');
      const encoding = String(config.encoding || 'hex');
      const saveTo = String(config.saveTo || 'encrypted');
      return `${ind}const ${saveTo}${typeAnn(config)} = (() => { const c = createCipheriv("aes-256-cbc", Buffer.from("${key}", "hex"), Buffer.from("${iv}", "hex")); let e = c.update(${input}, "utf8", "${encoding}"); e += c.final("${encoding}"); return e; })();`;
    }
    case 'decrypt_text': {
      const di = String(config.input || '""');
      const dk = String(config.key || '');
      const div = String(config.iv || '');
      const dencoding = String(config.encoding || 'hex');
      const dsaveTo = String(config.saveTo || 'decrypted');
      return `${ind}const ${dsaveTo}${typeAnn(config)} = (() => { const c = createDecipheriv("aes-256-cbc", Buffer.from("${dk}", "hex"), Buffer.from("${div}", "hex")); let d = c.update(${di}, "${dencoding}", "utf8"); d += c.final("utf8"); return d; })();`;
    }
    case 'generate_key': {
      const saveKeyTo = String(config.saveKeyTo || 'encKey');
      const saveIvTo = String(config.saveIvTo || 'encIv');
      const enc = String(config.encoding || 'hex');
      return `${ind}const ${saveKeyTo} = randomBytes(32).toString("${enc}");\n${ind}const ${saveIvTo} = randomBytes(16).toString("${enc}");`;
    }
    case 'sign_hmac': {
      const si = String(config.input || '""');
      const ssec = String(config.secret || '');
      const salg = String(config.algorithm || 'sha256');
      const ssave = String(config.saveTo || 'signature');
      return `${ind}const ${ssave}${typeAnn(config)} = createHmac("${salg}", "${ssec}").update(${si}).digest("hex");`;
    }
    case 'verify_hmac': {
      const vi = String(config.input || '""');
      const vsig = String(config.signature || '""');
      const vsec = String(config.secret || '');
      const valg = String(config.algorithm || 'sha256');
      const vsave = String(config.saveTo || 'valid');
      return `${ind}const ${vsave}${typeAnn(config)} = createHmac("${valg}", "${vsec}").update(${vi}).digest("hex") === ${vsig};`;
    }
    case 'random_bytes': {
      const rlen = Number(config.length) || 32;
      const renc = String(config.encoding || 'hex');
      const rsave = String(config.saveTo || 'randomBytes');
      return `${ind}const ${rsave}${typeAnn(config)} = randomBytes(${rlen}).toString("${renc}");`;
    }
    case 'csrf_token': {
      const secret = String(config.secret || 'my-secret');
      const sid = String(config.sessionId || 'undefined');
      const expiresIn = Number(config.expiresIn) || 86400000;
      const saveTo = String(config.saveTo || 'csrfToken');
      const opts = sid === 'undefined' ? `{ expiresIn: ${expiresIn} }` : `{ sessionId: ${sid}, expiresIn: ${expiresIn} }`;
      return `${ind}const ${saveTo}${typeAnn(config)} = Bun.CSRF.generate("${secret}", ${opts});`;
    }
    case 'csrf_verify': {
      const tokenExpr = String(config.token || '""');
      const vsecret = String(config.secret || 'my-secret');
      const vsid = String(config.sessionId || 'undefined');
      const vsave = String(config.saveTo || 'valid');
      const opts = vsid === 'undefined' ? `{ secret: "${vsecret}" }` : `{ secret: "${vsecret}", sessionId: ${vsid} }`;
      return `${ind}const ${vsave}${typeAnn(config)} = Bun.CSRF.verify(${tokenExpr}, ${opts});`;
    }
    case 'start_ws_server': {
      const port = Number(config.port) || 8080;
      let code = `${ind}const server = Bun.serve<{ ws: WebSocket }>({\n`;
      code += `${ind}  port: ${port},\n`;
      code += `${ind}  fetch(req, server) {\n`;
      code += `${ind}    if (server.upgrade(req)) return;\n`;
      code += `${ind}    return new Response("WebSocket only", { status: 426 });\n`;
      code += `${ind}  },\n`;
      code += `${ind}  websocket: {\n`;
      code += `${ind}    open(ws) {\n`;
      const onOpen = children.filter(c => c.type === 'ws_on_open');
      if (onOpen.length > 0) {
        for (const o of onOpen) {
          const grandChildren = o.children || [];
          code += `${ind}      // On Open\n`;
          for (const g of grandChildren) {
            const gcode = generateBlock(g, indentLevel + 3, _depth + 1);
            if (gcode) code += `${ind}      ${gcode.trimStart()}\n`;
          }
        }
      } else {
        code += `${ind}      console.log("WebSocket connected");\n`;
      }
      code += `${ind}    },\n`;
      code += `${ind}    message(ws, message) {\n`;
      const onMessage = children.filter(c => c.type === 'ws_on_message');
      if (onMessage.length > 0) {
        for (const m of onMessage) {
          const grandChildren = m.children || [];
          code += `${ind}      // On Message\n`;
          for (const g of grandChildren) {
            const gcode = generateBlock(g, indentLevel + 3, _depth + 1);
            if (gcode) code += `${ind}      ${gcode.trimStart()}\n`;
          }
        }
      } else {
        code += `${ind}      console.log("Received:", message);\n`;
      }
      code += `${ind}    },\n`;
      code += `${ind}    close(ws, code, reason) {\n`;
      const onClose = children.filter(c => c.type === 'ws_on_close');
      if (onClose.length > 0) {
        for (const c of onClose) {
          const grandChildren = c.children || [];
          code += `${ind}      // On Close\n`;
          for (const g of grandChildren) {
            const gcode = generateBlock(g, indentLevel + 3, _depth + 1);
            if (gcode) code += `${ind}      ${gcode.trimStart()}\n`;
          }
        }
      } else {
        code += `${ind}      console.log("WebSocket disconnected");\n`;
      }
      code += `${ind}    },\n`;
      code += `${ind}  },\n`;
      code += `${ind}});\n`;
      code += `${ind}console.log("WebSocket server running on port", ${port});`;
      return code;
    }
    case 'ws_on_open':
    case 'ws_on_message':
    case 'ws_on_close':
      return '';
    case 'ws_send': {
      const wsws = String(config.ws || 'ws');
      const wsdata = String(config.data || '""');
      const wstype = String(config.type || 'text');
      if (wstype === 'binary') return `${ind}${wsws}.send(new TextEncoder().encode(${wsdata}));`;
      return `${ind}${wsws}.send(${wsdata});`;
    }
    case 'ws_broadcast': {
      const bserver = String(config.server || 'server');
      const bdata = String(config.data || '""');
      return `${ind}for (const ws of ${bserver}.websockets) { ws.send(${bdata}); }`;
    }
    case 'ws_get_clients': {
      const gserver = String(config.server || 'server');
      const gsave = String(config.saveTo || 'clientCount');
      return `${ind}const ${gsave}${typeAnn(config)} = [...${gserver}.websockets].length;`;
    }
    default: return `${ind}// Unknown block type: ${type}`;
  }
}

export async function createBlueprint(
  userId: number,
  name: string,
  description: string | undefined,
  projectData: Project,
  latestGeneratedCode?: string
): Promise<VisualEditorBlueprint> {
  const repo = AppDataSource.getRepository(VisualEditorBlueprint);
  const json = JSON.stringify(projectData);
  if (json.length > MAX_PROJECT_SIZE) {
    throw new Error(`Project data exceeds ${MAX_PROJECT_SIZE / 1024 / 1024}MB limit (${(json.length / 1024 / 1024).toFixed(1)}MB)`);
  }
  const blueprint = repo.create({
    userId,
    name: normalizeBlueprintName(name),
    description: clampText(description, MAX_VISUAL_EDITOR_DESCRIPTION_LENGTH),
    projectData: json,
    latestGeneratedCode: latestGeneratedCode || '',
  });
  return repo.save(blueprint);
}

export async function updateBlueprint(
  id: number,
  userId: number,
  data: { name?: string; description?: string; projectData?: Project; latestGeneratedCode?: string }
): Promise<VisualEditorBlueprint | null> {
  const repo = AppDataSource.getRepository(VisualEditorBlueprint);
  const blueprint = await repo.findOneBy({ id, userId });
  if (!blueprint) return null;

  if (data.name !== undefined) blueprint.name = normalizeBlueprintName(data.name);
  if (data.description !== undefined) blueprint.description = clampText(data.description, MAX_VISUAL_EDITOR_DESCRIPTION_LENGTH);
  if (data.projectData !== undefined) {
    const json = JSON.stringify(data.projectData);
    if (json.length > MAX_PROJECT_SIZE) {
      throw new Error(`Project data exceeds ${MAX_PROJECT_SIZE / 1024 / 1024}MB limit (${(json.length / 1024 / 1024).toFixed(1)}MB)`);
    }
    blueprint.projectData = json;
  }
  if (data.latestGeneratedCode !== undefined) blueprint.latestGeneratedCode = data.latestGeneratedCode;

  return repo.save(blueprint);
}

export async function deleteBlueprint(id: number, userId: number): Promise<boolean> {
  const repo = AppDataSource.getRepository(VisualEditorBlueprint);
  const result = await repo.delete({ id, userId });
  return (result.affected ?? 0) > 0;
}

export async function getBlueprint(id: number, userId: number): Promise<BlueprintResponse | null> {
  const repo = AppDataSource.getRepository(VisualEditorBlueprint);
  const blueprint = await repo.findOneBy({ id, userId });
  if (!blueprint) return null;
  return mapBlueprint(blueprint);
}

export async function getUserBlueprints(userId: number): Promise<BlueprintResponse[]> {
  const repo = AppDataSource.getRepository(VisualEditorBlueprint);
  const blueprints = await repo.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  return blueprints.map(mapBlueprint);
}

function mapBlueprint(b: VisualEditorBlueprint): BlueprintResponse {
  let projectData: Project;
  try {
    projectData = JSON.parse(b.projectData);
  } catch {
    projectData = { id: '', name: b.name, files: [], activeFileId: '' };
  }
  return {
    id: b.id,
    userId: b.userId,
    name: b.name,
    description: b.description,
    projectData,
    latestGeneratedCode: b.latestGeneratedCode,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export const CATEGORIES = [
  { id: 'basics', name: 'Basics', icon: 'Sparkles', color: '#10b981', description: 'Print, wait, comments' },
  { id: 'data', name: 'Store Data', icon: 'Box', color: '#8b5cf6', description: 'Variables, lists, objects' },
  { id: 'logic', name: 'Make Decisions', icon: 'GitBranch', color: '#3b82f6', description: 'If this, then that' },
  { id: 'loops', name: 'Repeat Things', icon: 'Repeat', color: '#f59e0b', description: 'Do something multiple times' },
  { id: 'functions', name: 'Reusable Actions', icon: 'Puzzle', color: '#a855f7', description: 'Create your own blocks' },
  { id: 'server', name: 'Web & API', icon: 'Server', color: '#0ea5e9', description: 'HTTP servers, requests' },
  { id: 'websocket', name: 'WebSocket', icon: 'Radio', color: '#06b6d4', description: 'Real-time connections' },
  { id: 'database', name: 'Database', icon: 'Database', color: '#f97316', description: 'Store and retrieve data' },
  { id: 'files', name: 'Files', icon: 'Folder', color: '#64748b', description: 'Read and write files' },
  { id: 'advanced', name: 'Advanced', icon: 'Cpu', color: '#7c3aed', description: 'Workers, memory, system' },
  { id: 'security', name: 'Security & Crypto', icon: 'Shield', color: '#06b6d4', description: 'Encryption, hashing, signatures' },
  { id: 'custom', name: 'Custom Code', icon: 'Code', color: '#374151', description: 'Write your own code' },
];

export interface LibraryItem {
  id: number;
  userId: number;
  name: string;
  blocks: Block[];
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapLibrary(l: VisualEditorLibrary): LibraryItem {
  let blocks: Block[];
  try { blocks = JSON.parse(l.blocksData) } catch { blocks = [] }
  return {
    id: l.id, userId: l.userId, name: l.name, blocks,
    description: l.description, createdAt: l.createdAt, updatedAt: l.updatedAt,
  };
}

export async function createLibraryItem(userId: number, name: string, blocks: Block[], description?: string): Promise<LibraryItem> {
  const repo = AppDataSource.getRepository(VisualEditorLibrary);
  const item = repo.create({
    userId,
    name: normalizeLibraryName(name),
    blocksData: JSON.stringify(blocks),
    description: clampText(description, MAX_VISUAL_EDITOR_DESCRIPTION_LENGTH) || null,
  });
  return mapLibrary(await repo.save(item));
}

export async function getUserLibraryItems(userId: number): Promise<LibraryItem[]> {
  const repo = AppDataSource.getRepository(VisualEditorLibrary);
  const items = await repo.find({ where: { userId }, order: { updatedAt: 'DESC' } });
  return items.map(mapLibrary);
}

export async function deleteLibraryItem(id: number, userId: number): Promise<boolean> {
  const repo = AppDataSource.getRepository(VisualEditorLibrary);
  const result = await repo.delete({ id, userId });
  return (result.affected ?? 0) > 0;
}

export async function exportBlueprintAsZip(id: number, userId: number): Promise<{ name: string; data: Buffer } | null> {
  const blueprint = await getBlueprint(id, userId);
  if (!blueprint) return null;

  const files: { name: string; content: string }[] = [];
  let projectFiles: ProjectFile[] = [];

  try {
    const data = blueprint.projectData as any;
    projectFiles = data.files || [];
  } catch {}

  for (const file of projectFiles) {
    const code = generateCode(file.blocks || []);
    files.push({ name: file.name || 'main.ts', content: code });
  }

  files.push({
    name: 'package.json',
    content: JSON.stringify({
      name: blueprint.name.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      type: 'module',
      main: 'main.ts',
      scripts: {
        dev: 'bun run --watch main.ts',
        start: 'bun run main.ts',
      },
      dependencies: {},
    }, null, 2),
  });

  files.push({
    name: 'README.md',
    content: `# ${blueprint.name}\n\n${blueprint.description || 'Visual Editor project exported from EcliPanel'}\n\n## Running\n\n\`\`\`bash\nbun run main.ts\n\`\`\`\n`,
  });

  files.push({
    name: '.eclipanel.json',
    content: JSON.stringify({
      blueprint: {
        id: blueprint.id,
        name: blueprint.name,
        description: blueprint.description,
        createdAt: blueprint.createdAt,
        updatedAt: blueprint.updatedAt,
      },
    }, null, 2),
  });

  const zipBuffer = await createZipBuffer(blueprint.name, files);
  return { name: `${blueprint.name.replace(/\s+/g, '-')}.zip`, data: zipBuffer };
}

async function createZipBuffer(projectName: string, files: { name: string; content: string }[]): Promise<Buffer> {
  try {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip();
    
    for (const file of files) {
      zip.addFile(file.name, Buffer.from(file.content, 'utf8'));
    }
    
    return zip.toBuffer();
  } catch {
    return createMinimalZip(files);
  }
}

function createMinimalZip(files: { name: string; content: string }[]): Buffer {
  const buffers: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const content = Buffer.from(file.content, 'utf8');
    const filename = Buffer.from(file.name, 'utf8');
    const crc = calculateCRC32(content);

    const lfh = Buffer.alloc(30 + filename.length);
    lfh.writeUInt32LE(0x04034b50, 0); // Signature
    lfh.writeUInt16LE(20, 4); // Version
    lfh.writeUInt16LE(0, 6); // Flags
    lfh.writeUInt16LE(0, 8); // Compression (0 = none)
    lfh.writeUInt16LE(0, 10); // Time
    lfh.writeUInt16LE(0, 12); // Date
    lfh.writeUInt32LE(crc, 14); // CRC-32
    lfh.writeUInt32LE(content.length, 18); // Compressed size
    lfh.writeUInt32LE(content.length, 22); // Uncompressed size
    lfh.writeUInt16LE(filename.length, 26); // Filename length
    lfh.writeUInt16LE(0, 28); // Extra field length
    filename.copy(lfh, 30);

    buffers.push(lfh);
    buffers.push(content);
    offset += lfh.length + content.length;

    const cdh = Buffer.alloc(46 + filename.length);
    cdh.writeUInt32LE(0x02014b50, 0); // Signature
    cdh.writeUInt16LE(20, 4); // Version made by
    cdh.writeUInt16LE(20, 6); // Version needed
    cdh.writeUInt16LE(0, 8); // Flags
    cdh.writeUInt16LE(0, 10); // Compression
    cdh.writeUInt16LE(0, 12); // Time
    cdh.writeUInt16LE(0, 14); // Date
    cdh.writeUInt32LE(crc, 16); // CRC-32
    cdh.writeUInt32LE(content.length, 20); // Compressed size
    cdh.writeUInt32LE(content.length, 24); // Uncompressed size
    cdh.writeUInt16LE(filename.length, 28); // Filename length
    cdh.writeUInt16LE(0, 30); // Extra field
    cdh.writeUInt16LE(0, 32); // Comment length
    cdh.writeUInt16LE(0, 34); // Disk number
    cdh.writeUInt16LE(0, 36); // Internal attributes
    cdh.writeUInt32LE(0, 38); // External attributes
    cdh.writeUInt32LE(offset - lfh.length - content.length, 42); // Local header offset
    filename.copy(cdh, 46);
    
    centralDirs.push(cdh);
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Disk with central dir
  eocd.writeUInt16LE(files.length, 8); // Entries on this disk
  eocd.writeUInt16LE(files.length, 10); // Total entries
  
  const cdSize = centralDirs.reduce((sum, cd) => sum + cd.length, 0);
  eocd.writeUInt32LE(cdSize, 12); // Central dir size
  eocd.writeUInt32LE(offset, 16); // Central dir offset
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...buffers, ...centralDirs, eocd]);
}

function calculateCRC32(data: Buffer): number {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}