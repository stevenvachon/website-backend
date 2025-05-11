import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  test as it,
  vi,
} from 'vitest';
import {
  handler,
  PAGE_LOAD_EVENT,
  PAGE_UNLOAD_EVENT,
  SESSION_START_EVENT,
  SESSION_TIMEOUT_EVENT,
} from './';
import {
  CONTENT_TYPE,
  JSON_CONTENT_TYPE,
  TEXT_CONTENT_TYPE,
  UNPARSABLE_CONTENT,
  UNSUPPORTED_ACCEPT_TYPES,
  UNSUPPORTED_CONTENT_TYPE,
  VALIDATION_ERROR,
  WEBSITE_URL,
} from '@sv-common/constants';
import {
  create_HTTP_400_RESPONSE_JSON,
  create_HTTP_406_RESPONSE,
  create_HTTP_415_RESPONSE_JSON,
  create_HTTP_422_RESPONSE_JSON,
  createResponse,
  not_HTTP_4XX_RESPONSE,
  stubConsole,
} from '@sv-test/helpers';
import { PinpointClient, PutEventsCommand } from '@aws-sdk/client-pinpoint';

vi.mock('@aws-sdk/client-pinpoint');

const RANDOM_URL = 'https://domain/';
const UNDEFINED = Symbol();

/**
 * Calls the handler. While it *does* have valid default input values,
 * they're only in a complete form. Overriding the default will require
 * you to provide your own *completely*.
 * @todo use `Promise.try()`
 */
const callHandler = ({
  accept,
  contentType = JSON_CONTENT_TYPE,
  customBody,
  input = {
    event: PAGE_UNLOAD_EVENT, // The simplest event
    session_id: crypto.randomUUID(),
    timestamp: Date.now(),
  },
  lowerCaseAccept = false,
  lowerCaseContentType = false,
  omitContentTypeHeader = false,
} = {}) => {
  // Bypass default parameters
  if (contentType === UNDEFINED) contentType = undefined;
  if (input === UNDEFINED) input = undefined;

  return handler(
    {
      body:
        customBody !== undefined
          ? customBody === UNDEFINED
            ? undefined
            : customBody
          : contentType === JSON_CONTENT_TYPE
          ? JSON.stringify(input)
          : undefined,
      headers: {
        ...(accept ? (lowerCaseAccept ? { accept } : { Accept: accept }) : {}),
        ...(!omitContentTypeHeader
          ? lowerCaseContentType
            ? { [CONTENT_TYPE.toLowerCase()]: contentType }
            : { [CONTENT_TYPE]: contentType }
          : {}),
      },
    },
    {}
  );
};

beforeAll(() => stubConsole());
beforeEach(() => vi.restoreAllMocks());

describe('Request validation', () => {
  describe('Accept', () => {
    it('does not respond with HTTP 4xx for absent, empty and "*/*" values', () =>
      Promise.all(
        [undefined, '', '*/*']
          .map((accept) => [
            expect(callHandler({ accept })).resolves.toMatchObject(
              not_HTTP_4XX_RESPONSE
            ),
            expect(
              callHandler({ accept, lowerCaseAccept: true })
            ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE),
          ])
          .flat()
      ));

    it('does not respond with HTTP 4xx for supported values', () =>
      Promise.all([
        expect(
          callHandler({ accept: JSON_CONTENT_TYPE })
        ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE),

        expect(
          callHandler({ accept: JSON_CONTENT_TYPE, lowerCaseAccept: true })
        ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE),
      ]));

    it('supports q-factor weighting', async () => {
      const CAUSE_VALIDATION_ERROR = { input: UNDEFINED }; // So that there's content in the response
      const ACCEPT = `${TEXT_CONTENT_TYPE};q=0.9, ${JSON_CONTENT_TYPE};q=1`;
      const EXPECTED = createResponse({
        headers: {
          [CONTENT_TYPE]: JSON_CONTENT_TYPE,
        },
      });
      await Promise.all([
        expect(
          callHandler({ accept: ACCEPT, ...CAUSE_VALIDATION_ERROR })
        ).resolves.toMatchObject(EXPECTED),

        expect(
          callHandler({
            accept: ACCEPT,
            lowerCaseAccept: true,
            ...CAUSE_VALIDATION_ERROR,
          })
        ).resolves.toMatchObject(EXPECTED),
      ]);
    });

    it('responds with HTTP 406 for unsupported and unknown values', async () => {
      const RESPONSE = create_HTTP_406_RESPONSE(UNSUPPORTED_ACCEPT_TYPES);
      await Promise.all(
        [TEXT_CONTENT_TYPE, 'non-existent']
          .map((accept) => [
            expect(callHandler({ accept })).resolves.toMatchObject(RESPONSE),
            expect(
              callHandler({ accept, lowerCaseAccept: true })
            ).resolves.toMatchObject(RESPONSE),
          ])
          .flat()
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Content-Type', () => {
    it('responds with HTTP 415 for unsupported and unknown values', async () => {
      await Promise.all(
        [TEXT_CONTENT_TYPE, 'non-existent']
          .map((contentType) => [
            expect(callHandler({ contentType })).resolves.toMatchObject(
              create_HTTP_415_RESPONSE_JSON(UNSUPPORTED_CONTENT_TYPE)
            ),

            expect(
              callHandler({ contentType, lowerCaseContentType: true })
            ).resolves.toMatchObject(
              create_HTTP_415_RESPONSE_JSON(UNSUPPORTED_CONTENT_TYPE)
            ),
          ])
          .flat()
      );
      expect(console.error).toHaveBeenCalled();
    });

    it('does not respond with HTTP 4xx for supported values', () =>
      Promise.all([
        expect(
          callHandler({ contentType: JSON_CONTENT_TYPE })
        ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE),

        expect(
          callHandler({
            contentType: JSON_CONTENT_TYPE,
            lowerCaseContentType: true,
          })
        ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE),
      ]));
  });

  describe('content', () => {
    const HTTP_422_RESPONSE = create_HTTP_422_RESPONSE_JSON(VALIDATION_ERROR);
    const VALID_EVENT = PAGE_UNLOAD_EVENT;
    const VALID_SESSION_ID = crypto.randomUUID();
    const VALID_TIMESTAMP = Date.now();

    it('responds with HTTP 400 when content cannot be parsed', async () => {
      await Promise.all(
        [UNDEFINED, '', '{"key": "value'].map((customBody) =>
          expect(callHandler({ customBody })).resolves.toMatchObject(
            create_HTTP_400_RESPONSE_JSON(UNPARSABLE_CONTENT)
          )
        )
      );
      expect(console.error).toHaveBeenCalled();
    });

    describe('common (required) fields', () => {
      it('responds with HTTP 422 for any absent, empty or null', async () => {
        await Promise.all(
          [undefined, '', null]
            .map((fieldValue) => [
              expect(
                callHandler({
                  input: {
                    event: fieldValue,
                    session_id: VALID_SESSION_ID,
                    timestamp: VALID_TIMESTAMP,
                  },
                })
              ).resolves.toMatchObject(HTTP_422_RESPONSE),

              expect(
                callHandler({
                  input: {
                    event: VALID_EVENT,
                    session_id: fieldValue,
                    timestamp: VALID_TIMESTAMP,
                  },
                })
              ).resolves.toMatchObject(HTTP_422_RESPONSE),

              expect(
                callHandler({
                  input: {
                    event: VALID_EVENT,
                    session_id: VALID_SESSION_ID,
                    timestamp: fieldValue,
                  },
                })
              ).resolves.toMatchObject(HTTP_422_RESPONSE),
            ])
            .flat()
        );
        expect(console.error).toHaveBeenCalled();
      });

      it('responds with HTTP 422 for any invalid', async () => {
        await Promise.all([
          ...['NonExistent', true, 1, [], {}].map((event) =>
            expect(
              callHandler({
                input: {
                  event,
                  session_id: VALID_SESSION_ID,
                  timestamp: VALID_TIMESTAMP,
                },
              })
            ).resolves.toMatchObject(HTTP_422_RESPONSE)
          ),

          ...['non-uuid', true, 1, [], {}].map((session_id) =>
            expect(
              callHandler({
                input: {
                  event: VALID_EVENT,
                  session_id,
                  timestamp: VALID_TIMESTAMP,
                },
              })
            ).resolves.toMatchObject(HTTP_422_RESPONSE)
          ),

          ...[
            Date.now() - 26 * 60 * 60 * 1_001, // >26 hours into the past
            Date.now() + 26 * 60 * 60 * 1_001, // >26 hours into the future
            Date.now().toString(),
            true,
            [],
            {},
          ].map((timestamp) =>
            expect(
              callHandler({
                input: {
                  event: VALID_EVENT,
                  session_id: VALID_SESSION_ID,
                  timestamp,
                },
              })
            ).resolves.toMatchObject(HTTP_422_RESPONSE)
          ),
        ]);
        expect(console.error).toHaveBeenCalled();
      });
    });

    describe(`"${PAGE_LOAD_EVENT}" event`, () => {
      it('responds with HTTP 422 for any absent, empty or null required fields', async () => {
        await Promise.all(
          [undefined, '', null].map((fieldValue) =>
            expect(
              callHandler({
                input: { event: PAGE_LOAD_EVENT, url: fieldValue },
              })
            ).resolves.toMatchObject(HTTP_422_RESPONSE)
          )
        );
        expect(console.error).toHaveBeenCalled();
      });

      it('responds with HTTP 422 for any invalid fields', async () => {
        await Promise.all([
          ...[
            'non-url',
            new URL('a'.repeat(200), RANDOM_URL).href,
            true,
            1,
            [],
            {},
          ].map((referrer) =>
            expect(
              callHandler({
                input: {
                  event: PAGE_LOAD_EVENT,
                  referrer,
                  session_id: VALID_SESSION_ID,
                  timestamp: VALID_TIMESTAMP,
                  url: WEBSITE_URL,
                },
              })
            ).resolves.toMatchObject(HTTP_422_RESPONSE)
          ),

          ...[
            'non-url',
            'https://unsupported-domain.com/',
            new URL('a'.repeat(200), WEBSITE_URL).href,
            true,
            1,
            [],
            {},
          ].map((url) =>
            expect(
              callHandler({
                input: {
                  event: PAGE_LOAD_EVENT,
                  referrer: RANDOM_URL,
                  session_id: VALID_SESSION_ID,
                  timestamp: VALID_TIMESTAMP,
                  url,
                },
              })
            ).resolves.toMatchObject(HTTP_422_RESPONSE)
          ),
        ]);
        expect(console.error).toHaveBeenCalled();
      });

      it('does not respond with HTTP 4xx for all valid fields', () =>
        Promise.all(
          [undefined, RANDOM_URL].map((referrer) =>
            expect(
              callHandler({
                input: {
                  event: PAGE_LOAD_EVENT,
                  referrer,
                  session_id: VALID_SESSION_ID,
                  timestamp: VALID_TIMESTAMP,
                  url: WEBSITE_URL,
                },
              })
            ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE)
          )
        ));
    });

    describe(`"${PAGE_UNLOAD_EVENT}" event`, () => {
      //it.skip('responds with HTTP 422 for any absent, empty or null required fields', () => {});

      //it.skip('responds with HTTP 422 for any invalid fields', () => {});

      it('does not respond with HTTP 4xx for all valid fields', () =>
        expect(
          callHandler({
            input: {
              event: PAGE_UNLOAD_EVENT,
              session_id: VALID_SESSION_ID,
              timestamp: VALID_TIMESTAMP,
            },
          })
        ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE));
    });

    describe(`"${SESSION_START_EVENT}" event`, () => {
      const FIELD_NAMES = [
        'browser_name',
        'browser_version_major',
        'browser_version',
        'cpu_arch',
        'device_model',
        'device_type',
        'device_vendor',
        'os_name',
        'os_version',
        'screen_resolution',
      ];

      //it.skip('responds with HTTP 422 for any absent, empty or null required fields', () => {});

      it('responds with HTTP 422 for any invalid fields', async () => {
        await Promise.all(
          FIELD_NAMES.map((fieldName) =>
            ['a'.repeat(200), true, 1, [], {}].map((fieldValue) =>
              expect(
                callHandler({
                  input: {
                    event: SESSION_START_EVENT,
                    session_id: VALID_SESSION_ID,
                    timestamp: VALID_TIMESTAMP,
                    [fieldName]: fieldValue,
                    ...Object.fromEntries(
                      FIELD_NAMES.filter((f) => f !== fieldName).map((key) => [
                        key,
                        'valid value',
                      ])
                    ),
                  },
                })
              ).resolves.toMatchObject(HTTP_422_RESPONSE)
            )
          ).flat()
        );
        expect(console.error).toHaveBeenCalled();
      });

      it('does not respond with HTTP 4xx for all valid fields', () =>
        expect(
          callHandler({
            input: {
              event: SESSION_START_EVENT,
              session_id: VALID_SESSION_ID,
              timestamp: VALID_TIMESTAMP,
              ...Object.fromEntries(FIELD_NAMES.map((key) => [key, 'value'])),
            },
          })
        ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE));
    });

    describe(`"${SESSION_TIMEOUT_EVENT}" event`, () => {
      //it.skip('responds with HTTP 422 for any absent, empty or null required fields', () => {});

      //it.skip('responds with HTTP 422 for any invalid fields', () => {});

      it('does not respond with HTTP 4xx for all valid fields', () =>
        expect(
          callHandler({
            input: {
              event: SESSION_TIMEOUT_EVENT,
              session_id: VALID_SESSION_ID,
              timestamp: VALID_TIMESTAMP,
            },
          })
        ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE));
    });

    it('responds with HTTP 422 for unknown fields', async () => {
      await expect(
        callHandler({
          input: {
            event: VALID_EVENT,
            session_id: VALID_SESSION_ID,
            timestamp: VALID_TIMESTAMP,
            unknownField: 'some value',
          },
        })
      ).resolves.toMatchObject(HTTP_422_RESPONSE);

      expect(console.error).toHaveBeenCalled();
    });
  });
});

describe('AWS SDK', () => {
  const STUBBED_UUID = '647ca8f2-3ae4-4e24-b8c4-497203818371';

  const expectToMatchCommand = ({ event, timestamp, ...attrs }) =>
    expect.objectContaining({
      ApplicationId: expect.any(String),
      EventsRequest: {
        BatchItem: {
          'endpoint-id': {
            Endpoint: {},
            Events: {
              [STUBBED_UUID]: {
                EventType: event,
                Timestamp: new Date(timestamp).toISOString(),
                Attributes: attrs,
              },
            },
          },
        },
      },
    });

  beforeEach(() =>
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(STUBBED_UUID)
  );

  it(`sends "${PAGE_LOAD_EVENT}" event`, async () => {
    const INPUT = {
      event: PAGE_LOAD_EVENT,
      referrer: RANDOM_URL,
      session_id: crypto.randomUUID(),
      timestamp: Date.now(),
      url: WEBSITE_URL,
    };
    await callHandler({ input: INPUT });
    expect(PutEventsCommand).toHaveBeenCalledExactlyOnceWith(
      expectToMatchCommand(INPUT)
    );
    expect(PinpointClient).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ region: expect.any(String) })
    );
    expect(PinpointClient.prototype.send).toHaveBeenCalledExactlyOnceWith(
      expect.any(PutEventsCommand)
    );
  });

  it(`sends "${PAGE_UNLOAD_EVENT}" event`, async () => {
    const INPUT = {
      event: PAGE_UNLOAD_EVENT,
      session_id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    await callHandler({ input: INPUT });
    expect(PutEventsCommand).toHaveBeenCalledExactlyOnceWith(
      expectToMatchCommand(INPUT)
    );
    expect(PinpointClient).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ region: expect.any(String) })
    );
    expect(PinpointClient.prototype.send).toHaveBeenCalledExactlyOnceWith(
      expect.any(PutEventsCommand)
    );
  });

  it(`sends "${SESSION_START_EVENT}" event`, async () => {
    const INPUT = {
      browser_name: 'a',
      browser_version_major: 'b',
      browser_version: 'c',
      cpu_arch: 'd',
      device_model: 'e',
      device_type: 'f',
      device_vendor: 'g',
      event: SESSION_START_EVENT,
      os_name: 'h',
      os_version: 'i',
      screen_resolution: 'j',
      session_id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    await callHandler({ input: INPUT });
    expect(PutEventsCommand).toHaveBeenCalledExactlyOnceWith(
      expectToMatchCommand(INPUT)
    );
    expect(PinpointClient).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ region: expect.any(String) })
    );
    expect(PinpointClient.prototype.send).toHaveBeenCalledExactlyOnceWith(
      expect.any(PutEventsCommand)
    );
  });

  it(`sends "${SESSION_TIMEOUT_EVENT}" event`, async () => {
    const INPUT = {
      event: SESSION_TIMEOUT_EVENT,
      session_id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    await callHandler({ input: INPUT });
    expect(PutEventsCommand).toHaveBeenCalledExactlyOnceWith(
      expectToMatchCommand(INPUT)
    );
    expect(PinpointClient).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ region: expect.any(String) })
    );
    expect(PinpointClient.prototype.send).toHaveBeenCalledExactlyOnceWith(
      expect.any(PutEventsCommand)
    );
  });
});

describe('Success response', () => {
  it('is HTTP 204', async () => {
    await expect(callHandler()).resolves.toMatchObject(
      createResponse({ statusCode: 204 })
    );
    expect(console.log).toHaveBeenCalledTimes(4);
  });
});
