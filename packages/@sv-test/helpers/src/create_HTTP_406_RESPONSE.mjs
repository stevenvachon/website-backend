import { CONTENT_TYPE, TEXT_CONTENT_TYPE } from '@sv-common/constants';
import createResponse from './createResponse.mjs';
import { expect } from 'vitest';
import stringStartingWith from './stringStartingWith.mjs';

expect.extend({ stringStartingWith });

export default (messageStartsWith) =>
  createResponse({
    body: expect.stringStartingWith(messageStartsWith),
    headers: { [CONTENT_TYPE]: TEXT_CONTENT_TYPE },
    statusCode: 406,
  });
