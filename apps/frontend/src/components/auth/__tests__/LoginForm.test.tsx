import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoginForm } from '../LoginForm';
import { loginSchema } from '../loginSchema';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), loginWithGoogle: vi.fn() }),
}));
vi.mock('../GoogleSignInButton', () => ({ GoogleSignInButton: () => null }));

const password = 'longenough';

function firstError(username: string, pwd = password) {
  const result = loginSchema.safeParse({ username, password: pwd });
  return result.success ? null : result.error.issues[0].message;
}

describe('loginSchema', () => {
  it('accepts a mobile number, an email, or an old username', () => {
    expect(firstError('9876543210')).toBeNull();
    expect(firstError('player@example.com')).toBeNull();
    expect(firstError('rahul')).toBeNull();
  });

  it('asks for a mobile number or email when the field is empty', () => {
    expect(firstError('')).toBe('Enter your mobile number or email');
  });

  it('rejects anything shorter than three characters, ignoring spaces', () => {
    expect(firstError('ab')).toBe('Enter a valid mobile number or email');
    expect(firstError('  ab  ')).toBe('Enter a valid mobile number or email');
  });

  it('still wants a password of eight characters', () => {
    expect(firstError('rahul', 'short')).toBe(
      'Password must be at least 8 characters',
    );
  });
});

describe('LoginForm', () => {
  it('asks for a mobile number or email and says one account covers every tournament', () => {
    const html = renderToStaticMarkup(<LoginForm />);

    expect(html).toContain('placeholder="Mobile number or email"');
    expect(html).toContain('One account for every WALL-E Arena tournament.');
    expect(html).toContain('Used a username');
    expect(html).not.toContain('Enter username or mobile number');
  });
});
