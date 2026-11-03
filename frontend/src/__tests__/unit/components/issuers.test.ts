import { describe, expect, it } from 'vitest';
import { findIssuer } from '../../../components/shared/issuers';

const key = (...texts: (string | null)[]) => findIssuer(...texts)?.key ?? null;

describe('findIssuer', () => {
  it('recognises issuers from card names, including common misspellings', () => {
    expect(key('Amex Credit Card')).toBe('amex');
    expect(key('Platinum', 'American Express')).toBe('amex');
    expect(key('Chase Freedom')).toBe('chase');
    expect(key('Chase Saphire')).toBe('chase');
    expect(key('CapitolOne Venture X')).toBe('capitalone');
    expect(key('Capital One Quicksilver')).toBe('capitalone');
    expect(key('Citi Double Cash')).toBe('citi');
    expect(key('BofA Customized Cash')).toBe('bofa');
  });

  it('prefers the name, then the institution', () => {
    expect(key('Chase Sapphire', 'Bank of America')).toBe('chase');
    expect(key('Travel Card', 'Wells Fargo')).toBe('wellsfargo');
  });

  it('recognises banks and brokerages from the institution', () => {
    expect(key('Total Checking', 'Chase')).toBe('chase');
    expect(key('Online Savings', 'Ally Bank')).toBe('ally');
    expect(key('Brokerage', 'Charles Schwab')).toBe('schwab');
    expect(key('Everyday Checking', 'Wells Fargo')).toBe('wellsfargo');
    expect(key('Bank Of America')).toBe('bofa');
    expect(key('Chase Bank')).toBe('chase');
    expect(key('UFB Direct - HYS')).toBe('ufb');
    expect(key('Checking', 'U.S. Bank')).toBe('usbank');
    expect(key('Checking', 'US Bank')).toBe('usbank');
    expect(key('Savings', 'Navy Federal Credit Union')).toBe('navyfederal');
  });

  it('returns null when nothing matches', () => {
    expect(key('Rewards Card', 'Harbor Bank')).toBeNull();
    expect(key('Purchase card')).toBeNull(); // "chase" inside a word doesn't count
    expect(key(null, null)).toBeNull();
  });

  it('has a logo or a wordmark for every issuer', () => {
    for (const name of ['Amex', 'Chase', 'Capital One', 'Citi', 'Ally', 'Schwab', 'Fidelity']) {
      const issuer = findIssuer(name)!;
      expect(issuer.path ?? issuer.text).toBeTruthy();
    }
  });
});
