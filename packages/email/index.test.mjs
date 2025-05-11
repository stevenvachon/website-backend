import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  test as it,
  vi,
} from 'vitest';
import { Buffer } from 'node:buffer';
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
  EMAIL_ADDRESS,
  FORM_CONTENT_TYPE,
  handler,
  MISSING_CONTENT_TYPE,
} from './';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import {
  create_HTTP_400_RESPONSE_JSON,
  create_HTTP_406_RESPONSE,
  create_HTTP_415_RESPONSE_JSON,
  create_HTTP_422_RESPONSE_JSON,
  createResponse,
  not_HTTP_4XX_RESPONSE,
  stringStartingWith,
  stubConsole,
} from '@sv-test/helpers';

vi.mock('@aws-sdk/client-ses');

const UNDEFINED = Symbol();

/**
 * Calls the handler. It has valid default input values.
 * @todo use `Promise.try()`
 */
const callHandler = ({
  accept,
  base64Body = false,
  contentType = JSON_CONTENT_TYPE,
  customBody,
  email = 'first.last@domain.com',
  lowerCaseAccept = false,
  lowerCaseContentType = false,
  message = 'This is a test message',
  name = 'First Last',
  omitContentTypeHeader = false,
  redirect,
  unknownField,
} = {}) => {
  // Bypass default parameters
  if (contentType === UNDEFINED) contentType = undefined;
  if (email === UNDEFINED) email = undefined;
  if (message === UNDEFINED) message = undefined;
  if (name === UNDEFINED) name = undefined;

  let body;

  if (customBody !== undefined) {
    body = customBody === UNDEFINED ? undefined : customBody;
  } else if (contentType === FORM_CONTENT_TYPE) {
    const params = new URLSearchParams();
    if (email) params.set('email', email);
    if (message) params.set('message', message);
    if (name) params.set('name', name);
    if (redirect) params.set('redirect', redirect);
    if (unknownField) params.set('unknownField', unknownField);
    body = params.toString();
  } else if (contentType === JSON_CONTENT_TYPE) {
    body = JSON.stringify({ email, message, name, redirect, unknownField });
  }

  if (base64Body) {
    body = Buffer.from(body, 'utf-8').toString('base64');
  }

  return handler(
    {
      body,
      headers: {
        ...(accept ? (lowerCaseAccept ? { accept } : { Accept: accept }) : {}),
        ...(!omitContentTypeHeader
          ? lowerCaseContentType
            ? { [CONTENT_TYPE.toLowerCase()]: contentType }
            : { [CONTENT_TYPE]: contentType }
          : {}),
      },
      ...(base64Body ? { isBase64Encoded: true } : {}),
    },
    {}
  );
};

expect.extend({
  stringStartingWith,
  toBeURLEncodedMessage: (received, startingWith) => {
    try {
      const p = new URLSearchParams(received);
      return {
        pass: startingWith
          ? p.get('message').startsWith(startingWith)
          : p.has('message'),
      };
    } catch {
      return {
        message: () =>
          `expected ${received} to be a URL-encoded form with a "message" key${
            startingWith ? `'s value starting with "${startingWith}"` : ''
          }`,
        pass: false,
      };
    }
  },
});

beforeAll(() => stubConsole());
beforeEach(() => vi.restoreAllMocks());

describe('Request validation', () => {
  const create_HTTP_400_RESPONSE_FORM = (messageStartsWith) =>
    createResponse({
      body: expect.toBeURLEncodedMessage(messageStartsWith),
      headers: { [CONTENT_TYPE]: FORM_CONTENT_TYPE },
      statusCode: 400,
    });

  const create_HTTP_400_RESPONSE_TEXT = (messageStartsWith) =>
    createResponse({
      body: expect.stringStartingWith(messageStartsWith),
      headers: { [CONTENT_TYPE]: TEXT_CONTENT_TYPE },
      statusCode: 400,
    });

  const create_HTTP_415_RESPONSE_FORM = (messageStartsWith) =>
    createResponse({
      body: expect.toBeURLEncodedMessage(messageStartsWith),
      headers: { [CONTENT_TYPE]: FORM_CONTENT_TYPE },
      statusCode: 415,
    });

  const create_HTTP_415_RESPONSE_TEXT = (messageStartsWith) =>
    createResponse({
      body: expect.stringStartingWith(messageStartsWith),
      headers: { [CONTENT_TYPE]: TEXT_CONTENT_TYPE },
      statusCode: 415,
    });

  const create_HTTP_422_RESPONSE_FORM = (messageStartsWith) =>
    createResponse({
      body: expect.toBeURLEncodedMessage(messageStartsWith),
      headers: { [CONTENT_TYPE]: FORM_CONTENT_TYPE },
      statusCode: 422,
    });

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
      Promise.all(
        [FORM_CONTENT_TYPE, JSON_CONTENT_TYPE]
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

    it('supports q-factor weighting', async () => {
      const CAUSE_VALIDATION_ERROR = { email: UNDEFINED }; // So that there's content in the response
      const ACCEPT = `${FORM_CONTENT_TYPE};q=0.9, ${JSON_CONTENT_TYPE};q=1`;
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
    it('responds with HTTP 400 for absent and empty values', async () => {
      for (const contentType of [UNDEFINED, '']) {
        for (const { accept, response } of [
          {
            accept: undefined,
            response: create_HTTP_400_RESPONSE_TEXT(MISSING_CONTENT_TYPE),
          },
          {
            accept: FORM_CONTENT_TYPE,
            response: create_HTTP_400_RESPONSE_FORM(MISSING_CONTENT_TYPE),
          },
          {
            accept: JSON_CONTENT_TYPE,
            response: create_HTTP_400_RESPONSE_JSON(MISSING_CONTENT_TYPE),
          },
        ]) {
          await Promise.all([
            expect(callHandler({ accept, contentType })).resolves.toMatchObject(
              response
            ),
            expect(
              callHandler({ accept, contentType, lowerCaseContentType: true })
            ).resolves.toMatchObject(response),
          ]);
        }
      }
      expect(console.error).toHaveBeenCalled();
    });

    it('responds with HTTP 415 for unsupported and unknown values', async () => {
      for (const contentType of [TEXT_CONTENT_TYPE, 'non-existent']) {
        for (const { accept, response } of [
          {
            accept: undefined,
            response: create_HTTP_415_RESPONSE_TEXT(UNSUPPORTED_CONTENT_TYPE),
          },
          {
            accept: FORM_CONTENT_TYPE,
            response: create_HTTP_415_RESPONSE_FORM(UNSUPPORTED_CONTENT_TYPE),
          },
          {
            accept: JSON_CONTENT_TYPE,
            response: create_HTTP_415_RESPONSE_JSON(UNSUPPORTED_CONTENT_TYPE),
          },
        ]) {
          await Promise.all([
            expect(callHandler({ accept, contentType })).resolves.toMatchObject(
              response
            ),
            expect(
              callHandler({ accept, contentType, lowerCaseContentType: true })
            ).resolves.toMatchObject(response),
          ]);
        }
      }
      expect(console.error).toHaveBeenCalled();
    });

    it('does not respond with HTTP 4xx for supported values', async () => {
      for (const contentType of [FORM_CONTENT_TYPE, JSON_CONTENT_TYPE]) {
        for (const accept of [
          undefined,
          FORM_CONTENT_TYPE,
          JSON_CONTENT_TYPE,
        ]) {
          await Promise.all([
            expect(callHandler({ accept, contentType })).resolves.toMatchObject(
              not_HTTP_4XX_RESPONSE
            ),
            expect(
              callHandler({ accept, contentType, lowerCaseContentType: true })
            ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE),
          ]);
        }
      }
    });
  });

  describe('content', () => {
    const HTTP_422_RESPONSE_FORM =
      create_HTTP_422_RESPONSE_FORM(VALIDATION_ERROR);
    const HTTP_422_RESPONSE_JSON =
      create_HTTP_422_RESPONSE_JSON(VALIDATION_ERROR);

    it(`responds with HTTP 400 when ${JSON_CONTENT_TYPE} content cannot be parsed`, async () => {
      await Promise.all(
        [UNDEFINED, '', '{"key": "value'].map((customBody) =>
          expect(
            callHandler({ contentType: JSON_CONTENT_TYPE, customBody })
          ).resolves.toMatchObject(
            create_HTTP_400_RESPONSE_JSON(UNPARSABLE_CONTENT)
          )
        )
      );
      expect(console.error).toHaveBeenCalled();
    });

    it(`responds with HTTP 422 when ${FORM_CONTENT_TYPE} has no content to parse`, async () => {
      await Promise.all(
        [UNDEFINED, ''].map((customBody) =>
          expect(
            callHandler({ contentType: FORM_CONTENT_TYPE, customBody })
          ).resolves.toMatchObject(create_HTTP_422_RESPONSE_FORM())
        )
      );
      expect(console.error).toHaveBeenCalled();
    });

    it(`responds with HTTP 422 when there're absent, empty and null required (common) fields`, async () => {
      for (const fieldValue of [UNDEFINED, '', null]) {
        for (const contentType of [FORM_CONTENT_TYPE, JSON_CONTENT_TYPE]) {
          for (const { accept, response } of [
            {
              accept: undefined,
              response:
                contentType === FORM_CONTENT_TYPE
                  ? HTTP_422_RESPONSE_FORM
                  : contentType === JSON_CONTENT_TYPE
                  ? HTTP_422_RESPONSE_JSON
                  : undefined, // TODO: https://github.com/tc39/proposal-throw-expressions
            },
            {
              accept: FORM_CONTENT_TYPE,
              response: HTTP_422_RESPONSE_FORM,
            },
            {
              accept: JSON_CONTENT_TYPE,
              response: HTTP_422_RESPONSE_JSON,
            },
          ]) {
            await Promise.all([
              expect(
                callHandler({ accept, contentType, email: fieldValue })
              ).resolves.toMatchObject(response),

              expect(
                callHandler({ accept, contentType, message: fieldValue })
              ).resolves.toMatchObject(response),

              expect(
                callHandler({ accept, contentType, name: fieldValue })
              ).resolves.toMatchObject(response),
            ]);
          }
        }
      }
      expect(console.error).toHaveBeenCalled();
    });

    it(`responds with HTTP 422 when there're invalid fields`, async () => {
      for (const contentType of [FORM_CONTENT_TYPE, JSON_CONTENT_TYPE]) {
        for (const { accept, response } of [
          {
            accept: undefined,
            response:
              contentType === FORM_CONTENT_TYPE
                ? HTTP_422_RESPONSE_FORM
                : contentType === JSON_CONTENT_TYPE
                ? HTTP_422_RESPONSE_JSON
                : undefined, // TODO: https://github.com/tc39/proposal-throw-expressions
          },
          {
            accept: FORM_CONTENT_TYPE,
            response: HTTP_422_RESPONSE_FORM,
          },
          {
            accept: JSON_CONTENT_TYPE,
            response: HTTP_422_RESPONSE_JSON,
          },
        ]) {
          await Promise.all([
            ...[
              //true, 1, [], {},
              'a'.repeat(101),
              'person@.com',
              `person@${'a'.repeat(100)}.com`,
              '<strong>No</strong> HTML',
              'no\t@control-characters.com',
            ].map((email) =>
              expect(
                callHandler({ accept, contentType, email })
              ).resolves.toMatchObject(response)
            ),

            ...[
              //true, 1, [], {},
              'a'.repeat(10_001),
              'An unsafe message containing <script>window.close()</script>',
              'No \t control characters',
              `Aucune langue autre que l'anglais`,
            ].map((message) =>
              expect(
                callHandler({ accept, contentType, message })
              ).resolves.toMatchObject(response)
            ),

            ...[
              //true, 1, [], {},
              'a'.repeat(101),
              '<strong>No</strong> HTML',
              'No \t control characters',
            ].map((name) =>
              expect(
                callHandler({ accept, contentType, name })
              ).resolves.toMatchObject(response)
            ),
          ]);
        }
      }
      expect(console.error).toHaveBeenCalled();
    });

    it(`responds with HTTP 422 when the "redirect" field is invalid for ${FORM_CONTENT_TYPE}`, async () => {
      for (const contentType of [FORM_CONTENT_TYPE, JSON_CONTENT_TYPE]) {
        await Promise.all([
          expect(
            callHandler({
              accept: FORM_CONTENT_TYPE,
              contentType,
              redirect: 'https://unsupported-domain.com',
            })
          ).resolves.toMatchObject(HTTP_422_RESPONSE_FORM),

          expect(
            callHandler({
              accept: FORM_CONTENT_TYPE,
              contentType,
              redirect: `${WEBSITE_URL}/${'a'.repeat(100)}`,
            })
          ).resolves.toMatchObject(HTTP_422_RESPONSE_FORM),
        ]);
      }
      expect(console.error).toHaveBeenCalled();
    });

    it(`responds with HTTP 422 when there's a "redirect" field for ${JSON_CONTENT_TYPE}`, async () => {
      await Promise.all(
        [FORM_CONTENT_TYPE, JSON_CONTENT_TYPE].map((contentType) =>
          expect(
            callHandler({
              accept: JSON_CONTENT_TYPE,
              contentType,
              redirect: WEBSITE_URL,
            })
          ).resolves.toMatchObject(HTTP_422_RESPONSE_JSON)
        )
      );
      expect(console.error).toHaveBeenCalled();
    });

    it('responds with HTTP 422 for unknown fields', async () => {
      for (const contentType of [FORM_CONTENT_TYPE, JSON_CONTENT_TYPE]) {
        for (const { accept, response } of [
          {
            accept: undefined,
            response:
              contentType === FORM_CONTENT_TYPE
                ? HTTP_422_RESPONSE_FORM
                : contentType === JSON_CONTENT_TYPE
                ? HTTP_422_RESPONSE_JSON
                : null, // TODO: https://github.com/tc39/proposal-throw-expressions
          },
          {
            accept: FORM_CONTENT_TYPE,
            response: HTTP_422_RESPONSE_FORM,
          },
          {
            accept: JSON_CONTENT_TYPE,
            response: HTTP_422_RESPONSE_JSON,
          },
        ]) {
          await expect(
            callHandler({ accept, contentType, unknownField: 'some value' })
          ).resolves.toMatchObject(response);
        }
      }
      expect(console.error).toHaveBeenCalled();
    });

    it('does not respond with HTTP 4xx for all valid fields', async () => {
      for (const contentType of [FORM_CONTENT_TYPE, JSON_CONTENT_TYPE]) {
        for (const accept of [
          undefined,
          FORM_CONTENT_TYPE,
          JSON_CONTENT_TYPE,
        ]) {
          await expect(
            callHandler({
              accept,
              contentType,
              message: 'Some content with <strong>safe</strong> HTML',
            })
          ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE);

          if (accept === FORM_CONTENT_TYPE) {
            await expect(
              callHandler({
                accept,
                contentType,
                redirect: WEBSITE_URL,
              })
            ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE);

            await expect(
              callHandler({
                accept,
                contentType,
                redirect: 'relative-url',
              })
            ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE);
          }
        }
      }
    });

    it('decodes base64-encoded request bodies when necessary', () =>
      Promise.all(
        [undefined, FORM_CONTENT_TYPE, JSON_CONTENT_TYPE].map((accept) =>
          expect(
            callHandler({
              accept,
              base64Body: true,
              contentType: FORM_CONTENT_TYPE, // Never for JSON
            })
          ).resolves.toMatchObject(not_HTTP_4XX_RESPONSE)
        )
      ));
  });
});

describe('AWS SDK', () => {
  it('includes my email address as sender and recipient', async () => {
    await callHandler();
    expect(SendEmailCommand).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        Source: expect.stringContaining(EMAIL_ADDRESS),
        Destination: {
          ToAddresses: [EMAIL_ADDRESS],
        },
      })
    );
  });

  it(`includes the (real) sender's name and email address`, async () => {
    await callHandler({ email: 'first.last@domain.com', name: 'First Last' });
    expect(SendEmailCommand).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        ReplyToAddresses: ['First Last <first.last@domain.com>'],
      })
    );
  });

  it('includes a text body with any HTML completely removed', async () => {
    await callHandler({
      message: 'A message containing <strong>HTML</strong> Text',
    });
    expect(SendEmailCommand).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        Message: expect.objectContaining({
          Body: expect.objectContaining({
            Text: {
              Data: expect.stringMatching(/A message containing HTML Text$/),
            },
          }),
        }),
      })
    );
  });

  it('sends an email', async () => {
    await callHandler({ contentType: FORM_CONTENT_TYPE });
    expect(SESClient).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ region: expect.any(String) })
    );
    expect(SESClient.prototype.send).toHaveBeenCalledExactlyOnceWith(
      expect.any(SendEmailCommand)
    );
  });
});

describe('Success response', () => {
  it(`is HTTP 204 for ${JSON_CONTENT_TYPE}`, async () => {
    await expect(
      callHandler({ contentType: JSON_CONTENT_TYPE })
    ).resolves.toMatchObject(createResponse({ statusCode: 204 }));
    expect(console.log).toHaveBeenCalledTimes(5);
  });

  it(`is HTTP 204 when there's no "redirect" field for ${FORM_CONTENT_TYPE}`, async () => {
    await expect(
      callHandler({ contentType: FORM_CONTENT_TYPE })
    ).resolves.toMatchObject(createResponse({ statusCode: 204 }));
    expect(console.log).toHaveBeenCalledTimes(5);
  });

  it(`redirects (HTTP 302) when there's a "redirect" field for ${FORM_CONTENT_TYPE}`, async () => {
    await expect(
      callHandler({ contentType: FORM_CONTENT_TYPE, redirect: WEBSITE_URL })
    ).resolves.toMatchObject(
      createResponse({
        headers: { Location: WEBSITE_URL },
        statusCode: 302,
      })
    );
    expect(console.log).toHaveBeenCalledTimes(5);
  });
});
