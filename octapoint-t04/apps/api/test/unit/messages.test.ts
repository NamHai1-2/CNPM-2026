import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MESSAGES, formatMessage, isMsgCode, type MessageDef } from '../../src/lib/messages.js';

const readDoc = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../docs/${name}`, import.meta.url)), 'utf8');

describe('messages', () => {
  const entries = Object.entries(MESSAGES) as [string, MessageDef][];

  it('defines MSG01 to MSG41 with no gaps', () => {
    expect(entries.map(([code]) => code)).toEqual(
      Array.from({ length: 41 }, (_, i) => `MSG${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('matches the message table in the SRS (type, context, text)', () => {
    const rows = [...readDoc('PROJECT_REPORT_FIXED.md').matchAll(/^\| \d+ \| (MSG\d+) \| (.+?) \| (.+?) \| (.+) \|$/gm)];
    expect(rows).toHaveLength(41);
    for (const [, code, type, context, text] of rows) {
      const message = MESSAGES[code as keyof typeof MESSAGES] as MessageDef;
      expect(message.type).toBe(type!.trim());
      expect(message.context).toBe(context!.trim());
      expect(message.text).toBe(text!.replace(/\\_/g, '_').trim());
    }
  });

  it('matches the HTTP status table in api-spec.md', () => {
    const api = readDoc('api-spec.md');
    const section = api.split('**Message code → HTTP status**')[1]!.split('**Pagination**')[0]!;
    const expected = new Map<string, number>();
    for (const row of section.matchAll(/^\| (\d{3}) \| (.+?) \|$/gm)) {
      for (const code of row[2]!.match(/MSG\d+/g) ?? []) expected.set(code, Number(row[1]));
    }
    for (const [code, message] of entries) {
      expect(message.http).toBe(expected.get(code));
    }
  });

  it('formats placeholders and leaves unknown ones untouched', () => {
    expect(formatMessage('MSG09', { min_points: 50 })).toBe('Redemption amount must be at least 50 points.');
    expect(formatMessage('MSG09')).toBe('Redemption amount must be at least {min_points} points.');
  });

  it('recognises message codes', () => {
    expect(isMsgCode('MSG23')).toBe(true);
    expect(isMsgCode('MSG99')).toBe(false);
    expect(isMsgCode('toString')).toBe(false);
  });
});
