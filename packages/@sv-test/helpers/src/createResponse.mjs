import { CORS_HEADERS } from '@sv-common/constants';

export default (response) => ({
  ...response,
  headers: {
    ...CORS_HEADERS,
    ...response.headers,
  },
});
