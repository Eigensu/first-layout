import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '../client';

function axiosError(status: number, data: unknown, message = 'Request failed') {
  return {
    isAxiosError: true,
    message,
    response: { status, data },
  };
}

describe('getErrorMessage', () => {
  it('routes structured object details through extractErrorMessage instead of stringifying them', () => {
    const error = axiosError(422, {
      detail: {
        message: 'Squad is invalid',
        violations: [
          {
            slot: { name: 'Batsman' },
            actual: 1,
            expected: { min_select: 2, max_select: 3 },
          },
        ],
      },
    });

    const result = getErrorMessage(error);

    expect(result).toBe('Squad is invalid\nBatsman: selected 1 (needs 2-3)');
    expect(result).not.toContain('{');
  });

  it('passes through a plain string detail unchanged', () => {
    const error = axiosError(400, { detail: 'Mobile number already registered' });
    expect(getErrorMessage(error)).toBe('Mobile number already registered');
  });

  it('joins a pydantic-style validation array', () => {
    const error = axiosError(422, {
      detail: [
        { loc: ['body', 'mobile'], msg: 'field required' },
        { msg: 'value is not a valid integer' },
      ],
    });
    expect(getErrorMessage(error)).toBe('field required; value is not a valid integer');
  });

  it('maps the 401 "incorrect credentials" detail to a friendlier message', () => {
    const error = axiosError(401, { detail: 'Incorrect username or password' });
    expect(getErrorMessage(error)).toBe('Invalid username or password. Please try again.');
  });

  it('maps the 401 "could not validate credentials" detail to a session-expired message', () => {
    const error = axiosError(401, { detail: 'Could not validate credentials' });
    expect(getErrorMessage(error)).toBe('Invalid or expired session. Please login again.');
  });

  it('falls back to a generic 401 message when there is no detail at all', () => {
    const error = axiosError(401, {});
    expect(getErrorMessage(error)).toBe('Authentication failed. Please check your credentials.');
  });

  it('returns a fixed message for 403', () => {
    const error = axiosError(403, {});
    expect(getErrorMessage(error)).toBe('Access denied. You do not have permission to perform this action.');
  });

  it('returns a fixed message for 404', () => {
    const error = axiosError(404, {});
    expect(getErrorMessage(error)).toBe('The requested resource was not found.');
  });

  it('returns a fixed message for 5xx', () => {
    const error = axiosError(503, {});
    expect(getErrorMessage(error)).toBe('Server error. Please try again later.');
  });

  it('falls back to the axios error message when there is no response detail and no matched status', () => {
    const error = axiosError(400, {}, 'Network Error');
    expect(getErrorMessage(error)).toBe('Network Error');
  });

  it('unwraps a plain Error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('falls back to a generic message for a non-Error, non-axios value', () => {
    expect(getErrorMessage('just a string')).toBe('An unknown error occurred');
  });
});
