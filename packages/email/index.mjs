import { Buffer } from 'node:buffer';
import BaseJoi from 'joi';
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
  WEBSITE_URL,
} from '@sv-common/constants';
import { inspect } from 'node:util';
import JoiSafe from '@sv-common/joi-safe';
import JoiTinyld from 'joi-tinyld'; // 'heavy' was using too much memory
import parseAcceptTypes from 'accepts';
import { parse as parseContentType } from 'content-type';
import sanitizeHTML from 'sanitize-html';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';

const Joi = BaseJoi.extend(JoiSafe, JoiTinyld);

// Exported for tests
export const EMAIL_ADDRESS = 'contact@svachon.com';
export const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';
export const MISSING_CONTENT_TYPE = 'Missing Content-Type header';

// Any uncaught exceptions will result in HTTP 502 with the the exception's message
export const handler = async (
  { body, headers, isBase64Encoded } /*, context*/
) => {
  const {
    accept,
    contentType,
    isFormRequest,
    isFormResponse,
    isJSONRequest,
    isJSONResponse,
    isUnknownContentType,
  } = tokenize(headers);

  if (isUnknownContentType) {
    const message = MISSING_CONTENT_TYPE;
    console.error(message);
    if (isFormResponse) {
      return formResponse({ content: { message }, statusCode: 400 });
    } else if (isJSONResponse) {
      return jsonResponse({ content: { message }, statusCode: 400 });
    } else {
      return textResponse({ content: message, statusCode: 400 });
    }
  }

  if (!isFormRequest && !isJSONRequest) {
    const message = `${UNSUPPORTED_CONTENT_TYPE}: ${contentType}`;
    console.error(message);
    if (isFormResponse) {
      return formResponse({ content: { message }, statusCode: 415 });
    } else if (isJSONResponse) {
      return jsonResponse({ content: { message }, statusCode: 415 });
    } else {
      return textResponse({ content: message, statusCode: 415 });
    }
  }

  if (!isFormResponse && !isJSONResponse) {
    const message = `${UNSUPPORTED_ACCEPT_TYPES}: ${accept}`;
    console.error(message);
    return textResponse({ content: message, statusCode: 406 });
  }

  console.log('Raw request body:', body);

  // API Gateway encoding for non-JSON
  if (isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf-8');
    console.log('Decoded request body:', body);
  }

  let input;

  try {
    if (isFormRequest) {
      input = Object.fromEntries(new URLSearchParams(body).entries());
    } else if (isJSONRequest) {
      input = JSON.parse(body);
    }
    // Else: error already thrown
  } catch {
    console.error(UNPARSABLE_CONTENT);
    // I couldn't find anything that would cause this code to be ran
    /*if (isFormResponse) {
      return formResponse({
        content: { message: UNPARSABLE_CONTENT },
        statusCode: 400,
      });
    } else*/ if (isJSONResponse) {
      return jsonResponse({
        content: { message: UNPARSABLE_CONTENT },
        statusCode: 400,
      });
    }
    // Else: error already thrown
  }

  console.log('Parsed request body:', input);

  const validationError = validate(input, isFormResponse);
  if (validationError) {
    const message = `${VALIDATION_ERROR}: ${validationError}`;
    console.error(message);
    if (isFormResponse) {
      return formResponse({ content: { message }, statusCode: 422 });
    } else if (isJSONResponse) {
      return jsonResponse({ content: { message }, statusCode: 422 });
    }
    // Else: error already thrown
  }

  console.log(
    'Result from SES:',
    await send(WEBSITE_HOSTNAME, EMAIL_ADDRESS, {
      email: input.email,
      message: input.message,
      name: input.name,
    })
  );

  if (isFormResponse && input.redirect) {
    return response({
      redirect: input.redirect,
      statusCode: 302,
    });
  } else {
    return response({ statusCode: 204 });
  }
};

const response = ({ content, contentType, redirect, statusCode }) => {
  const result = {
    ...(content
      ? {
          body:
            contentType === FORM_CONTENT_TYPE
              ? new URLSearchParams(content).toString()
              : contentType === JSON_CONTENT_TYPE
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
      ...(redirect ? { Location: new URL(redirect, WEBSITE_URL).href } : {}),
    },
    statusCode,
  };
  console.log('Response:', result);
  return result;
};

const formResponse = (config) =>
  response({ contentType: FORM_CONTENT_TYPE, ...config });

const jsonResponse = (config) =>
  response({ contentType: JSON_CONTENT_TYPE, ...config });

const textResponse = (config) =>
  response({ contentType: TEXT_CONTENT_TYPE, ...config });

const removeHTML = (str) =>
  sanitizeHTML(str, { allowedAttributes: {}, allowedTags: [] });

const send = (websiteName, targetEmail, { email, message, name }) => {
  const config = {
    Source: `${websiteName} <${targetEmail}>`, // Must have IAM permissions
    ReplyToAddresses: [`${name} <${email}>`],
    Destination: {
      ToAddresses: [targetEmail],
    },
    Message: {
      Subject: {
        Data: 'Contact form message',
      },
      Body: {
        Html: {
          Data: `<p>The following message was sent from the contact form on ${websiteName}:</p>${message}`,
        },
        Text: {
          Data: `The following message was sent from the contact form on ${websiteName}:\n\n${removeHTML(
            message
          )}`,
        },
      },
    },
  };
  console.log(
    'Sending to SES:',
    inspect(config, { depth: null, colors: false })
  );
  return new SESClient({ region: 'us-east-1' }).send(
    new SendEmailCommand(config)
  );
};

const tokenize = (headers) => {
  const accept = headers['Accept'] ?? headers['accept'];
  const parsedAccept = parseAcceptTypes({ headers: { accept } });

  const prefersFormResponse =
    parsedAccept.type(FORM_CONTENT_TYPE, JSON_CONTENT_TYPE) ===
      FORM_CONTENT_TYPE &&
    parsedAccept.type(JSON_CONTENT_TYPE, FORM_CONTENT_TYPE) ===
      FORM_CONTENT_TYPE;

  const prefersJSONResponse =
    parsedAccept.type(FORM_CONTENT_TYPE, JSON_CONTENT_TYPE) ===
      JSON_CONTENT_TYPE &&
    parsedAccept.type(JSON_CONTENT_TYPE, FORM_CONTENT_TYPE) ===
      JSON_CONTENT_TYPE;

  const acceptsOneSupportedType =
    parsedAccept.type(FORM_CONTENT_TYPE) === FORM_CONTENT_TYPE ||
    parsedAccept.type(JSON_CONTENT_TYPE) === JSON_CONTENT_TYPE;

  const indifferentAccept =
    (!prefersFormResponse && !prefersJSONResponse && acceptsOneSupportedType) ||
    parsedAccept.type('*/*') === '*/*';

  const contentType =
    // eslint-disable-next-line security/detect-object-injection
    headers[CONTENT_TYPE] ?? headers[CONTENT_TYPE.toLowerCase()];

  let isFormRequest,
    isFormResponse,
    isJSONRequest,
    isJSONResponse,
    isUnknownContentType;

  try {
    const { type } = parseContentType(contentType);
    isFormRequest = type === FORM_CONTENT_TYPE;
    isJSONRequest = type === JSON_CONTENT_TYPE;
    isUnknownContentType = false;
  } catch {
    isFormRequest = false;
    isJSONRequest = false;
    isUnknownContentType = !contentType;
  }

  if (indifferentAccept) {
    isFormResponse = isFormRequest;
    isJSONResponse = isJSONRequest;
  } else {
    isFormResponse = prefersFormResponse;
    isJSONResponse = prefersJSONResponse;
  }

  return {
    accept,
    contentType,
    isFormRequest,
    isFormResponse,
    isJSONRequest,
    isJSONResponse,
    isUnknownContentType,
  };
};

const validate = (input, isFormResponse = false) =>
  Joi.object({
    email: Joi.string().email().max(100).required(),
    message: Joi.string().max(10_000).safeMultiline().language('en').required(),
    name: Joi.string().max(100).safe(true).required(),
    // Empty string will be treated as `undefined`
    redirect: isFormResponse
      ? Joi.string()
          .max(100)
          .custom((value, { error }) => {
            try {
              if (new URL(value, WEBSITE_URL).hostname !== WEBSITE_HOSTNAME) {
                throw new Error();
              }
              return value;
            } catch {
              return error('string.uri');
            }
          })
      : Joi.forbidden(),
  }).validate(input, { abortEarly: false }).error?.message;
