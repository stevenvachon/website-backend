import createResponse from './createResponse.mjs';
import { expect } from 'vitest';

/*const HTTP_4xx_RESPONSE = createResponse({
    statusCode: expect.toSatisfy((v) => {
      expect(v).toBeTypeOf('number');
      expect(v).toBeGreaterThanOrEqual(400);
      expect(v).toBeLessThanOrEqual(499);
      return true;
    }),
  });*/

// `expect().not.toMatchObject(HTTP_4xx_RESPONSE)` was not inverting its `expect.toSatisfy()`
export default createResponse({
  statusCode: expect.toSatisfy(
    (v) => typeof v === 'number' && (v <= 399 || v >= 500)
  ),
});
