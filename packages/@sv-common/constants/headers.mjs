import { WEBSITE_URL } from './misc.mjs';

export const CONTENT_TYPE = 'Content-Type';

export const CORS_HEADERS = {
  'Access-Control-Allow-Headers': `${CONTENT_TYPE}, X-Requested-With`,
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Origin': `${WEBSITE_URL}`,
};

export const JSON_CONTENT_TYPE = 'application/json';
export const TEXT_CONTENT_TYPE = 'text/plain';
