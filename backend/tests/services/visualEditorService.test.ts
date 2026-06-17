import { describe, expect, it } from 'bun:test';
import {
  BLOCK_DEFINITIONS,
  CATEGORIES,
  generateCode,
  getBlockDefinition,
  validateProject,
} from '../../src/services/visualEditorService';
import type { Block, ProjectFile } from '../../src/services/visualEditorService';

function makeBlock(type: string, config: Record<string, unknown> = {}, children: Block[] = []): Block {
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    type,
    name: type,
    config,
    children,
    position: { x: 0, y: 0 },
  };
}

describe('visualEditorService', () => {
  describe('BLOCK_DEFINITIONS', () => {
    it('should have block definitions', () => {
      expect(Array.isArray(BLOCK_DEFINITIONS)).toBe(true);
      expect(BLOCK_DEFINITIONS.length).toBeGreaterThan(0);
    });

    it('should have required fields on each definition', () => {
      for (const def of BLOCK_DEFINITIONS) {
        expect(def.type).toBeTruthy();
        expect(def.category).toBeTruthy();
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.color).toBeTruthy();
        expect(def.icon).toBeTruthy();
        expect(typeof def.canHaveChildren).toBe('boolean');
        expect(Array.isArray(def.fields)).toBe(true);
      }
    });

    it('should have unique types', () => {
      const types = BLOCK_DEFINITIONS.map(d => d.type);
      expect(new Set(types).size).toBe(types.length);
    });
  });

  describe('CATEGORIES', () => {
    it('should have categories', () => {
      expect(Array.isArray(CATEGORIES)).toBe(true);
      expect(CATEGORIES.length).toBeGreaterThan(0);
    });

    it('should have required fields', () => {
      for (const cat of CATEGORIES) {
        expect(cat.id).toBeTruthy();
        expect(cat.name).toBeTruthy();
        expect(cat.icon).toBeTruthy();
        expect(cat.color).toBeTruthy();
      }
    });

    it('should have unique ids', () => {
      const ids = CATEGORIES.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getBlockDefinition', () => {
    it('should return definition for valid type', () => {
      const def = getBlockDefinition('print');
      expect(def).toBeDefined();
      expect(def?.type).toBe('print');
    });

    it('should return undefined for invalid type', () => {
      const def = getBlockDefinition('nonexistent_block_type');
      expect(def).toBeUndefined();
    });
  });

  describe('generateCode', () => {
    it('should generate code for print block', () => {
      const blocks = [makeBlock('print', { message: '"Hello World"' })];
      const code = generateCode(blocks);
      expect(code).toContain('console.log("Hello World")');
    });

    it('should generate code for variable creation', () => {
      const blocks = [makeBlock('create_variable', { name: 'myVar', value: '42', type: 'number', global: false })];
      const code = generateCode(blocks);
      expect(code).toContain('let myVar: number = 42');
    });

    it('should generate code for const variable', () => {
      const blocks = [makeBlock('create_variable', { name: 'CONST_VAR', value: '"test"', global: true })];
      const code = generateCode(blocks);
      expect(code).toContain('const CONST_VAR = "test"');
    });

    it('should generate code for if block with children', () => {
      const child = makeBlock('print', { message: '"inside if"' });
      const blocks = [makeBlock('if', { left: 'x', comparison: 'equals', right: '1' }, [child])];
      const code = generateCode(blocks);
      expect(code).toContain('if (x === 1)');
      expect(code).toContain('console.log("inside if")');
    });

    it('should generate code for wait block', () => {
      const blocks = [makeBlock('wait', { seconds: 2 })];
      const code = generateCode(blocks);
      expect(code).toContain('setTimeout(resolve, 2000)');
    });

    it('should generate code for comment block', () => {
      const blocks = [makeBlock('comment', { text: 'This is a comment' })];
      const code = generateCode(blocks);
      expect(code).toContain('// This is a comment');
    });

    it('should handle empty blocks array', () => {
      const code = generateCode([]);
      expect(typeof code).toBe('string');
    });

    it('should generate code for create_function block', () => {
      const child = makeBlock('print', { message: '"inside function"' });
      const blocks = [makeBlock('create_function', { name: 'myFunc', inputs: 'a: number, b: string' }, [child])];
      const code = generateCode(blocks);
      expect(code).toContain('const myFunc = (a: number, b: string) =>');
      expect(code).toContain('console.log("inside function")');
    });

    it('should generate code for start_server block', () => {
      const blocks = [makeBlock('start_server', { port: 3000 })];
      const code = generateCode(blocks);
      expect(code).toContain('Bun.serve');
      expect(code).toContain('3000');
    });

    it('should generate code for math block', () => {
      const blocks = [makeBlock('math', { left: '5', operator: '+', right: '3', saveTo: 'result' })];
      const code = generateCode(blocks);
      expect(code).toContain('let result');
      expect(code).toContain('5 + 3');
    });

    it('should handle unknown block types gracefully', () => {
      const blocks = [makeBlock('unknown_type_xyz', {})];
      const code = generateCode(blocks);
      expect(code).toContain('// Unknown block type');
    });
  });

  describe('validateProject', () => {
    it('should return empty report for valid project', () => {
      const files: ProjectFile[] = [{
        id: 'main',
        name: 'main.ts',
        type: 'main',
        icon: 'File',
        blocks: [makeBlock('print', { message: '"Hello"' })],
      }];
      const report = validateProject(files);
      expect(report.hasErrors).toBe(false);
      expect(report.issues).toHaveLength(0);
    });

    it('should detect duplicate variable names', () => {
      const files: ProjectFile[] = [{
        id: 'main',
        name: 'main.ts',
        type: 'main',
        icon: 'File',
        blocks: [
          makeBlock('create_variable', { name: 'myVar', value: '1' }),
          makeBlock('create_variable', { name: 'myVar', value: '2' }),
        ],
      }];
      const report = validateProject(files);
      expect(report.hasErrors).toBe(true);
      expect(report.issues.some(i => i.message.includes('already used'))).toBe(true);
    });

    it('should detect invalid identifiers', () => {
      const files: ProjectFile[] = [{
        id: 'main',
        name: 'main.ts',
        type: 'main',
        icon: 'File',
        blocks: [makeBlock('create_variable', { name: '123invalid', value: '1' })],
      }];
      const report = validateProject(files);
      expect(report.hasErrors).toBe(true);
      expect(report.issues.some(i => i.message.includes('not a valid'))).toBe(true);
    });

    it('should detect reserved names', () => {
      const files: ProjectFile[] = [{
        id: 'main',
        name: 'main.ts',
        type: 'main',
        icon: 'File',
        blocks: [makeBlock('create_variable', { name: 'Bun', value: '1' })],
      }];
      const report = validateProject(files);
      expect(report.hasErrors).toBe(true);
      expect(report.issues.some(i => i.message.includes('reserved'))).toBe(true);
    });

    it('should detect undefined function calls', () => {
      const files: ProjectFile[] = [{
        id: 'main',
        name: 'main.ts',
        type: 'main',
        icon: 'File',
        blocks: [makeBlock('run_function', { name: 'nonexistentFunc', inputs: '' })],
      }];
      const report = validateProject(files);
      expect(report.hasErrors).toBe(true);
      expect(report.issues.some(i => i.message.includes('not defined'))).toBe(true);
    });

    it('should detect function argument count mismatch', () => {
      const funcBlock = makeBlock('create_function', { name: 'myFunc', inputs: 'a: number, b: string' });
      const callBlock = makeBlock('run_function', { name: 'myFunc', inputs: '"only one"' });
      const files: ProjectFile[] = [{
        id: 'main',
        name: 'main.ts',
        type: 'main',
        icon: 'File',
        blocks: [funcBlock, callBlock],
      }];
      const report = validateProject(files);
      expect(report.hasErrors).toBe(true);
      expect(report.issues.some(i => i.message.includes('expects 2 argument(s)'))).toBe(true);
    });

    it('should warn about missing database connector', () => {
      const files: ProjectFile[] = [{
        id: 'main',
        name: 'main.ts',
        type: 'main',
        icon: 'File',
        blocks: [makeBlock('db_find', { db: 'myDb', table: 'users' })],
      }];
      const report = validateProject(files);
      expect(report.hasErrors).toBe(false);
      expect(report.issues.some(i => i.severity === 'warning' && i.message.includes('not found'))).toBe(true);
    });

    it('should handle empty files array', () => {
      const report = validateProject([]);
      expect(report.hasErrors).toBe(false);
      expect(report.issues).toHaveLength(0);
    });

    it('should handle files with no blocks', () => {
      const files: ProjectFile[] = [{
        id: 'main',
        name: 'main.ts',
        type: 'main',
        icon: 'File',
        blocks: [],
      }];
      const report = validateProject(files);
      expect(report.hasErrors).toBe(false);
    });

    it('should detect type mismatch in variable assignment', () => {
      const files: ProjectFile[] = [{
        id: 'main',
        name: 'main.ts',
        type: 'main',
        icon: 'File',
        blocks: [makeBlock('create_variable', { name: 'num', value: '"not a number"', type: 'number' })],
      }];
      const report = validateProject(files);
      expect(report.hasErrors).toBe(true);
      expect(report.issues.some(i => i.message.includes('expects number'))).toBe(true);
    });

    it('should validate nested blocks in children', () => {
      const invalidChild = makeBlock('create_variable', { name: '123bad', value: '1' });
      const parent = makeBlock('if', { left: 'x', comparison: 'equals', right: '1' }, [invalidChild]);
      const files: ProjectFile[] = [{
        id: 'main',
        name: 'main.ts',
        type: 'main',
        icon: 'File',
        blocks: [parent],
      }];
      const report = validateProject(files);
      expect(report.hasErrors).toBe(true);
    });
  });
});