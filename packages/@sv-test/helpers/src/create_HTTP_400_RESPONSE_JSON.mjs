import { CONTENT_TYPE, JSON_CONTENT_TYPE } from '@sv-common/constants';
import createResponse from './createResponse.mjs';
import { expect } from 'vitest';
import toBeJSONMessage from './toBeJSONMessage.mjs';

expect.extend({ toBeJSONMessage });

export default (messageStartsWith) =>
  createResponse({
    body: expect.toBeJSONMessage(messageStartsWith),
    headers: { [CONTENT_TYPE]: JSON_CONTENT_TYPE },
    statusCode: 400,
  });
