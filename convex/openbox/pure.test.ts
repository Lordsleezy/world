import { hashEmbedding, importanceOf, pacificHour, routineActivity, sanitizeFeed, sanitizeText, scriptedLine } from './pure';

describe('openbox privacy and routines', () => {
  test('strips emails, phones, and streets from text', () => {
    const clean = sanitizeText('Ship to jane@example.com at 12 Oak Street, call 415-555-1212');
    expect(clean).not.toContain('jane@');
    expect(clean).not.toContain('555');
    expect(clean).not.toContain('Oak Street');
    expect(clean).toContain('[private]');
  });

  test('sale feed keeps a price and drops buyer fields', () => {
    const feed = sanitizeFeed({
      jobs: [{ source: 'ebay-sync', level: 'error', message: 'desk late' }],
      sales: [{ channel: 'Depop', amount: 69, item: 'a fan', buyer_email: 'a@b.com', buyer_name: 'Pat' }],
    });
    expect(feed.jobs[0].status).toBe('red');
    expect(feed.sales[0].text).toBe('a fan sold on Depop for $69');
    expect(JSON.stringify(feed)).not.toContain('a@b.com');
    expect(JSON.stringify(feed)).not.toContain('Pat');
  });

  test('hash embeddings stay the same length and the same vector', () => {
    const a = hashEmbedding('the river was loud');
    const b = hashEmbedding('the river was loud');
    expect(a).toHaveLength(1024);
    expect(a[0]).toBeCloseTo(b[0]);
  });

  test('night is sleep and a red job is a collapse', () => {
    expect(routineActivity({ name: 'Moss', hour: 2, exhausted: false }).emoji).toBe('💤');
    expect(routineActivity({ name: 'Ellis', hour: 10, exhausted: false, job: 'ebay-sync', jobStatus: 'red' }).emoji).toBe('⚠️');
    expect(routineActivity({ name: 'Nia', hour: 11, exhausted: true }).description).toContain('tired');
  });

  test('importance and scripted lines stay small', () => {
    expect(importanceOf('an item sold on Depop')).toBe(8);
    expect(importanceOf('walked to the bakery')).toBe(2);
    expect(scriptedLine('Felix', 15).length).toBeGreaterThan(8);
    expect(pacificHour(Date.UTC(2026, 9, 15, 7, 0, 0))).toBeGreaterThanOrEqual(0);
  });
});
