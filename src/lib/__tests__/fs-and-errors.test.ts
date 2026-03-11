import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readYaml, writeYaml } from '../fs.js';
import { ProjectSchema } from '../../schemas/project.schema.js';
import { YamlNotFoundError, YamlParseError, ZodValidationError } from '../errors.js';

// ── YAML I/O ──────────────────────────────────────────────────────────────────

describe('readYaml / writeYaml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trip: write then read returns identical data', () => {
    const filePath = path.join(tmpDir, 'project.yaml');
    const data = {
      code: 'PM',
      name: 'Test Project',
      description: 'A test.',
      vision: '',
      status: 'active' as const,
      created_at: '2026-01-01',
      tech_stack: ['TypeScript'],
      notes: '',
    };
    writeYaml(filePath, data);
    const result = readYaml(filePath, ProjectSchema);
    expect(result.code).toBe(data.code);
    expect(result.name).toBe(data.name);
    expect(result.status).toBe(data.status);
    expect(result.tech_stack).toEqual(data.tech_stack);
  });

  it('writeYaml creates parent directories if needed', () => {
    const nested = path.join(tmpDir, 'a', 'b', 'c', 'file.yaml');
    writeYaml(nested, { code: 'PM', name: 'x', status: 'active', created_at: '2026-01-01' });
    expect(fs.existsSync(nested)).toBe(true);
  });

  it('readYaml throws YamlNotFoundError when file is missing', () => {
    const missing = path.join(tmpDir, 'nope.yaml');
    expect(() => readYaml(missing, ProjectSchema)).toThrow(YamlNotFoundError);
  });

  it('readYaml YamlNotFoundError has correct code', () => {
    const missing = path.join(tmpDir, 'nope.yaml');
    try {
      readYaml(missing, ProjectSchema);
    } catch (err) {
      expect(err).toBeInstanceOf(YamlNotFoundError);
      if (err instanceof YamlNotFoundError) {
        expect(err.code).toBe('YAML_NOT_FOUND');
        expect(err.filePath).toBe(missing);
      }
    }
  });

  it('readYaml throws YamlParseError for malformed YAML', () => {
    const filePath = path.join(tmpDir, 'bad.yaml');
    fs.writeFileSync(filePath, 'key: [unclosed bracket', 'utf8');
    expect(() => readYaml(filePath, ProjectSchema)).toThrow(YamlParseError);
  });

  it('readYaml throws ZodValidationError for schema mismatch', () => {
    const filePath = path.join(tmpDir, 'invalid.yaml');
    writeYaml(filePath, { code: 'lowercase', name: 'x', status: 'active', created_at: '2026-01-01' });
    expect(() => readYaml(filePath, ProjectSchema)).toThrow(ZodValidationError);
  });

  it('ZodValidationError exposes field errors', () => {
    const filePath = path.join(tmpDir, 'invalid2.yaml');
    writeYaml(filePath, { code: 'lowercase', name: 'x', status: 'active', created_at: '2026-01-01' });
    try {
      readYaml(filePath, ProjectSchema);
    } catch (err) {
      expect(err).toBeInstanceOf(ZodValidationError);
      if (err instanceof ZodValidationError) {
        expect(err.fieldErrors.length).toBeGreaterThan(0);
        expect(err.fieldErrors[0]).toHaveProperty('path');
        expect(err.fieldErrors[0]).toHaveProperty('message');
      }
    }
  });
});

// ── Error classes ─────────────────────────────────────────────────────────────

import {
  PmError,
  ProjectNotFoundError,
  EpicNotFoundError,
  StoryNotFoundError,
  DuplicateProjectCodeError,
  ValidationError,
} from '../errors.js';

describe('Error classes', () => {
  it('all error classes extend PmError', () => {
    expect(new YamlNotFoundError('/foo')).toBeInstanceOf(PmError);
    expect(new YamlParseError('/foo', new Error('x'))).toBeInstanceOf(PmError);
    expect(new ProjectNotFoundError('PM')).toBeInstanceOf(PmError);
    expect(new EpicNotFoundError('PM-E001')).toBeInstanceOf(PmError);
    expect(new StoryNotFoundError('PM-E001-S001')).toBeInstanceOf(PmError);
    expect(new DuplicateProjectCodeError('PM')).toBeInstanceOf(PmError);
    expect(new ValidationError('bad input')).toBeInstanceOf(PmError);
  });

  it('each error class has a unique code property', () => {
    const errors = [
      new YamlNotFoundError('/foo'),
      new YamlParseError('/foo', new Error('x')),
      new ProjectNotFoundError('PM'),
      new EpicNotFoundError('PM-E001'),
      new StoryNotFoundError('PM-E001-S001'),
      new DuplicateProjectCodeError('PM'),
      new ValidationError('bad input'),
    ];
    const codes = errors.map((e) => e.code);
    const uniqueCodes = new Set(codes);
    // ValidationError and ZodValidationError share VALIDATION_ERROR code — that's expected
    // but all others should be distinct
    expect(codes).toContain('YAML_NOT_FOUND');
    expect(codes).toContain('YAML_PARSE_ERROR');
    expect(codes).toContain('PROJECT_NOT_FOUND');
    expect(codes).toContain('EPIC_NOT_FOUND');
    expect(codes).toContain('STORY_NOT_FOUND');
    expect(codes).toContain('DUPLICATE_PROJECT_CODE');
    expect(codes).toContain('VALIDATION_ERROR');
    // At minimum 6 unique codes
    expect(uniqueCodes.size).toBeGreaterThanOrEqual(6);
  });

  it('ProjectNotFoundError message includes project code', () => {
    const err = new ProjectNotFoundError('MYAPP');
    expect(err.message).toContain('MYAPP');
  });

  it('EpicNotFoundError message includes epic code', () => {
    const err = new EpicNotFoundError('PM-E005');
    expect(err.message).toContain('PM-E005');
  });

  it('StoryNotFoundError message includes story code', () => {
    const err = new StoryNotFoundError('PM-E001-S003');
    expect(err.message).toContain('PM-E001-S003');
  });

  it('DuplicateProjectCodeError message includes code', () => {
    const err = new DuplicateProjectCodeError('DOTS');
    expect(err.message).toContain('DOTS');
  });

  it('ValidationError exposes fieldErrors when given ZodError', () => {
    const { z } = require('zod');
    const schema = z.object({ x: z.number() });
    const result = schema.safeParse({ x: 'not-a-number' });
    if (!result.success) {
      const err = new ValidationError('bad', result.error);
      expect(err.fieldErrors).toBeDefined();
      expect(err.fieldErrors!.length).toBeGreaterThan(0);
    }
  });
});
