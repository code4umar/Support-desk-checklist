import { findMentionedUsers } from './mentions';

const staff = [
  { id: 1, full_name: 'Ayesha Admin' },
  { id: 2, full_name: 'Bilal Agent' },
  { id: 3, full_name: 'Sara Agent' },
];

describe('findMentionedUsers', () => {
  it('finds one or several people', () => {
    expect(findMentionedUsers('Hi @Bilal Agent, please check', staff).map((u) => u.id)).toEqual([2]);
    expect(findMentionedUsers('@Sara Agent and @Ayesha Admin FYI', staff).map((u) => u.id).sort()).toEqual([1, 3]);
  });

  it('ignores case and extra spaces', () => {
    expect(findMentionedUsers('cc @bilal   agent', staff).map((u) => u.id)).toEqual([2]);
  });

  it('works at the very start and end of the text and before punctuation', () => {
    expect(findMentionedUsers('@Sara Agent', staff).map((u) => u.id)).toEqual([3]);
    expect(findMentionedUsers('thanks @Sara Agent.', staff).map((u) => u.id)).toEqual([3]);
    expect(findMentionedUsers('(@Sara Agent)', staff).map((u) => u.id)).toEqual([3]);
  });

  it('does not treat emails or partial names as mentions', () => {
    expect(findMentionedUsers('mail me at team@Sara Agent.com', staff)).toEqual([]);
    expect(findMentionedUsers('@Sara Agentx', staff)).toEqual([]);
    expect(findMentionedUsers('Sara Agent without the at sign', staff)).toEqual([]);
  });

  it('never returns the author and never returns duplicates', () => {
    expect(findMentionedUsers('@Bilal Agent @Bilal Agent', staff, 2)).toEqual([]);
    expect(findMentionedUsers('@Bilal Agent @Bilal Agent', staff).length).toBe(1);
  });

  it('is safe with odd input', () => {
    expect(findMentionedUsers('', staff)).toEqual([]);
    expect(findMentionedUsers('@Bil(al', [{ id: 9, full_name: 'Bil(al' }]).length).toBe(1); // regex characters in names are escaped
    expect(findMentionedUsers('@x', [{ id: 9, full_name: '   ' }])).toEqual([]);
  });
});
