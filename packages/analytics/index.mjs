import {
  CONTENT_TYPE,
  CORS_HEADERS,
  JSON_CONTENT_TYPE,
  TEXT_CONTENT_TYPE,
  UNPARSABLE_CONTENT,
  UNSUPPORTED_ACCEPT_TYPES,
  UNSUPPORTED_CONTENT_TYPE,
  VALIDATION_ERROR,
  WEBSITE_HOSTNAME,
} from '@sv-common/constants';
import { inspect } from 'node:util';
import Joi from 'joi';
import parseAcceptTypes from 'accepts';
import { parse as parseContentType } from 'content-type';
import { PinpointClient, PutEventsCommand } from '@aws-sdk/client-pinpoint';

// Exported for tests
export const PAGE_LOAD_EVENT = 'PageLoad';
export const PAGE_UNLOAD_EVENT = 'PageUnload';
export const SESSION_START_EVENT = 'SessionStart';
export const SESSION_TIMEOUT_EVENT = 'SessionTimeout';

export const handler = async ({ body, headers } /*, context*/) => {
  const { accept, contentType, isJSONRequest, isJSONResponse } =
    tokenize(headers);

  if (!isJSONRequest && isJSONResponse) {
    const message = `${UNSUPPORTED_CONTENT_TYPE}: ${contentType}`;
    console.error(message);
    return jsonResponse({ content: { message }, statusCode: 415 });
  }

  if (!isJSONResponse) {
    const message = `${UNSUPPORTED_ACCEPT_TYPES}: ${accept}`;
    console.error(message);
    return response({
      content: message,
      contentType: TEXT_CONTENT_TYPE,
      statusCode: 406,
    });
  }

  let input;

  try {
    input = JSON.parse(body);
  } catch {
    console.error(UNPARSABLE_CONTENT);
    return jsonResponse({
      content: { message: UNPARSABLE_CONTENT },
      statusCode: 400,
    });
  }

  console.log('Parsed request body:', input);

  const validationError = validate(input);
  if (validationError) {
    const message = `${VALIDATION_ERROR}: ${validationError}`;
    console.error(message);
    return jsonResponse({ content: { message }, statusCode: 422 });
  }

  console.log('Result from Pinpoint:', await send(input));

  return response({ statusCode: 204 });
};

const jsonResponse = (config) =>
  response({ contentType: JSON_CONTENT_TYPE, ...config });

const response = ({ content, contentType, statusCode }) => {
  const result = {
    ...(content
      ? {
          body:
            contentType === JSON_CONTENT_TYPE
              ? JSON.stringify(content)
              : contentType === TEXT_CONTENT_TYPE
              ? content
              : /* v8 ignore next */
                undefined, // TODO: https://github.com/tc39/proposal-throw-expressions
        }
      : {}),
    headers: {
      ...CORS_HEADERS,
      ...(contentType ? { [CONTENT_TYPE]: contentType } : {}),
    },
    statusCode,
  };
  console.log('Response:', result);
  return result;
};

const send = ({ event, timestamp, ...attributes }) => {
  const config = {
    ApplicationId: '1ad4e6fb3d644c328f83f23f6821e541',
    EventsRequest: {
      BatchItem: {
        'endpoint-id': {
          Endpoint: {}, // Required
          Events: {
            [crypto.randomUUID()]: {
              EventType: event,
              Timestamp: new Date(timestamp).toISOString(),
              Attributes: attributes,
            },
          },
        },
      },
    },
  };
  console.log(
    'Sending to Pinpoint:',
    inspect(config, { depth: null, colors: false })
  );
  return new PinpointClient({ region: 'us-east-1' }).send(
    new PutEventsCommand(config)
  );
};

const tokenize = (headers) => {
  const accept = headers['Accept'] ?? headers['accept'];
  const parsedAccept = parseAcceptTypes({ headers: { accept } });
  const isJSONResponse =
    parsedAccept.type(JSON_CONTENT_TYPE) === JSON_CONTENT_TYPE ||
    parsedAccept.type('*/*') === '*/*';

  const contentType =
    // eslint-disable-next-line security/detect-object-injection
    headers[CONTENT_TYPE] ?? headers[CONTENT_TYPE.toLowerCase()];

  let isJSONRequest;

  try {
    isJSONRequest = parseContentType(contentType).type === JSON_CONTENT_TYPE;
  } catch {
    isJSONRequest = false;
  }

  return {
    accept,
    contentType,
    isJSONRequest,
    isJSONResponse,
  };
};

const validate = (input) =>
  Joi.object({
    event: Joi.string()
      .valid(
        PAGE_LOAD_EVENT,
        PAGE_UNLOAD_EVENT,
        SESSION_START_EVENT,
        SESSION_TIMEOUT_EVENT
      )
      .required(),
    session_id: Joi.string().uuid().required(),
    timestamp: Joi.number()
      .integer()
      .strict()
      .min(Date.now() - 26 * 60 * 60 * 1_000) // 26 hours into the past minimum
      .max(Date.now() + 26 * 60 * 60 * 1_000) // 26 hours into the future maximum
      .required(),
    ...(input.event === PAGE_LOAD_EVENT
      ? {
          referrer: Joi.string().uri().max(200),
          url: Joi.string()
            .uri()
            .max(200)
            .custom((value, { error }) => {
              try {
                if (new URL(value).hostname !== WEBSITE_HOSTNAME) {
                  throw new Error();
                }
                return value;
              } catch {
                return error('string.uri');
              }
            })
            .required(),
        }
      : {}),
    ...(input.event === SESSION_START_EVENT
      ? {
          browser_name: Joi.string().max(100),
          browser_version_major: Joi.string().max(100),
          browser_version: Joi.string().max(100),
          cpu_arch: Joi.string().max(100),
          device_model: Joi.string().max(100),
          device_type: Joi.string().max(100),
          device_vendor: Joi.string().max(100),
          os_name: Joi.string().max(100),
          os_version: Joi.string().max(100),
          screen_resolution: Joi.string().max(100),
        }
      : {
          browser_name: Joi.forbidden(),
          browser_version_major: Joi.forbidden(),
          browser_version: Joi.forbidden(),
          cpu_arch: Joi.forbidden(),
          device_model: Joi.forbidden(),
          device_type: Joi.forbidden(),
          device_vendor: Joi.forbidden(),
          os_name: Joi.forbidden(),
          os_version: Joi.forbidden(),
          screen_resolution: Joi.forbidden(),
        }),
  }).validate(input, { abortEarly: false }).error?.message;
