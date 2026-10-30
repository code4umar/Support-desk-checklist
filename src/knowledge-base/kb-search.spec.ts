import { escapeLike, excerpt, normalizeTags, searchTerms, MAX_TAGS } from './kb-search';

describe('normalizeTags', () => {
  it('lowercases, trims, hyphenates spaces and drops duplicates/blanks', () => {
    expect(normalizeTags([' Billing', 'billing ', 'Two Factor', '', '  '])).toEqual(['billing', 'two-factor']);
  });

  it('copes with no tags and caps the count', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS);
  });
});

describe('searchTerms', () => {
  it('splits on punctuation, drops one-letter words and repeats', () => {
    expect(searchTerms("Can't reset my password, password!")).toEqual(['can', 'reset', 'my', 'password']);
  });

  it('returns nothing for an empty box', () => {
    expect(searchTerms('')).toEqual([]);
    expect(searchTerms(undefined)).toEqual([]);
  });

  it('caps the number of terms', () => {
    expect(searchTerms('aa bb cc dd ee ff gg hh ii jj')).toHaveLength(8);
  });
});

describe('escapeLike', () => {
  it('makes LIKE wildcards literal', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});

describe('excerpt', () => {
  it('strips Markdown syntax', () => {
    const md = '# Reset\n\nGo to **Settings** and click [Forgot password](/forgot).\n\n- step one\n```\ncode\n```';
    expect(excerpt(md)).toBe('Reset Go to Settings and click Forgot password. step one');
  });

  it('cuts long text at a word boundary with an ellipsis', () => {
    const out = excerpt('word '.repeat(100), 30);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/wor…$/);
    expect(out.length).toBeLessThanOrEqual(31);
  });
});
