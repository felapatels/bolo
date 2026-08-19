import { scrubEvent } from '@/lib/sentry';

// The PII scrubber runs in beforeSend on every Sentry event. It has to strip
// sensitive values WITHOUT destroying the parts of the event that make an
// error debuggable, the depth guard used to sit at 6, which is exactly one
// level above a stack frame's own fields, so every trace arrived as
// '[depth-limit]' and told us nothing.
function errorEvent() {
  return {
    event_id: 'e1',
    exception: {
      values: [
        {
          type: 'AuthIncompleteStateError',
          value: 'sso.oauth_google stopped at needs_identifier',
          stacktrace: {
            frames: [
              {
                filename: 'app:///lib/ssoAuth.tsx',
                function: 'completeSsoFlow',
                lineno: 214,
                colno: 11,
                in_app: true,
              },
            ],
          },
        },
      ],
    },
  } as any;
}

describe('scrubEvent', () => {
  it('keeps stack frames readable', () => {
    const frame = scrubEvent(errorEvent()).exception.values[0].stacktrace.frames[0];

    expect(frame.filename).toBe('app:///lib/ssoAuth.tsx');
    expect(frame.function).toBe('completeSsoFlow');
    expect(frame.lineno).toBe(214);
    expect(frame.colno).toBe(11);
    expect(frame.in_app).toBe(true);
  });

  it('keeps the exception type and message', () => {
    const value = scrubEvent(errorEvent()).exception.values[0];

    expect(value.type).toBe('AuthIncompleteStateError');
    expect(value.value).toBe('sso.oauth_google stopped at needs_identifier');
  });

  it('still redacts sensitive keys, however deeply they are nested', () => {
    const event = {
      breadcrumbs: {
        values: [
          {
            category: 'xhr',
            data: {
              response: { attempt: { transcript: 'નમસ્તે', phrase: 'hello', score: 82 } },
            },
          },
        ],
      },
    } as any;

    const data = scrubEvent(event).breadcrumbs.values[0].data.response.attempt;
    expect(data.transcript).toBe('[redacted]');
    expect(data.phrase).toBe('[redacted]');
    expect(data.score).toBe(82);
  });

  it('still masks email addresses in free text', () => {
    const event = { message: 'failed for learner@example.com' } as any;
    expect(scrubEvent(event).message).toBe('failed for [email]');
  });

  it('survives a circular reference without recursing forever', () => {
    const event: any = { contexts: {} };
    event.contexts.self = event;

    expect(scrubEvent(event).contexts.self).toBe('[circular]');
  });
});
