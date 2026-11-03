import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChangeEmailSection } from '../ChangeEmailSection';
import type { ChangeEmailState } from '../changeEmail';

function render(initialState?: ChangeEmailState, authProvider = 'password') {
  const html = renderToStaticMarkup(
    <ChangeEmailSection
      currentEmail="old@example.com"
      authProvider={authProvider}
      onChanged={() => {}}
      initialState={initialState}
    />,
  );
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

describe('ChangeEmailSection', () => {
  it('opens on the form, asking for the new address and the password', () => {
    const text = render();

    expect(text).toContain('New Email');
    expect(text).toContain('Current Password');
    expect(text).toContain('Send Code');
    expect(text).not.toContain('Forgot password');
  });

  it('tells an account made with Google how to get a password', () => {
    expect(render(undefined, 'google')).toContain('Forgot password');
  });

  it('asks for the code sent to the new address', () => {
    const text = render({ step: 'code', email: 'new@example.com', expiresInSec: 600 });

    expect(text).toContain('We sent a code to new@example.com');
    expect(text).toContain('It expires in 10 minutes');
    expect(text).toContain('Confirm Email');
    expect(text).toContain('Use a different email');
  });

  it('confirms the change', () => {
    const text = render({ step: 'done', email: 'new@example.com' });

    expect(text).toContain('Your email is now new@example.com');
    expect(text).toContain('Change it again');
  });
});
