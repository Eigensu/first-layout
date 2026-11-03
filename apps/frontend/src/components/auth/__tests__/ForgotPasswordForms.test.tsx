import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ForgotPasswordRequestForm } from '../ForgotPasswordRequestForm';
import { ForgotPasswordVerifyForm } from '../ForgotPasswordVerifyForm';
import type { ResetChannels, ResetDestination } from '@/lib/api/emailCodes';

function text(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
}

function request(channels: ResetChannels) {
  return renderToStaticMarkup(<ForgotPasswordRequestForm channels={channels} onSent={() => {}} />);
}

function verify(destination: ResetDestination | null) {
  return renderToStaticMarkup(
    <ForgotPasswordVerifyForm destination={destination} onVerified={() => {}} />,
  );
}

describe('ForgotPasswordRequestForm', () => {
  it('offers both channels, opening on the mobile number', () => {
    const html = request({ sms: true, email: true });

    expect(html).toContain('role="radiogroup"');
    expect(text(html)).toContain('Mobile');
    expect(text(html)).toContain('Email');
    expect(html).toContain('type="tel"');
    expect(text(html)).toContain('Get OTP via Call');
  });

  it('asks for the email straight away where that is the only channel', () => {
    const html = request({ sms: false, email: true });

    expect(html).not.toContain('role="radiogroup"');
    expect(html).toContain('type="email"');
    expect(text(html)).toContain('Email me a code');
  });

  it('keeps the old SMS form where email is not set up', () => {
    const html = request({ sms: true, email: false });

    expect(html).not.toContain('role="radiogroup"');
    expect(html).toContain('type="tel"');
  });

  it('says reset is unavailable rather than pretending to send', () => {
    const html = request({ sms: false, email: false });

    expect(html).not.toContain('<form');
    expect(text(html)).toContain("Password reset isn't available on this site right now");
  });
});

describe('ForgotPasswordVerifyForm', () => {
  it('shows the address the code went to', () => {
    const html = verify({ email: 'rahul@example.com' });

    expect(html).toContain('value="rahul@example.com"');
    expect(html).toContain('placeholder="6-digit code"');
    expect(html).toContain('href="/auth/forgot-password"');
  });

  it('shows the number the code went to', () => {
    const html = verify({ phone: '9876543210' });

    expect(html).toContain('type="tel"');
    expect(html).toContain('placeholder="Enter OTP"');
  });

  it('cannot submit without knowing where the code went', () => {
    const html = verify(null);

    expect(html).toMatch(/<button[^>]*disabled/);
  });
});
