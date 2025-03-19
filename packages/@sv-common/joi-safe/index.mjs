import sanitizeHTML from 'sanitize-html';
import { stripLow } from 'validator';

const REMOVE_HTML_CONFIG = { allowedAttributes: {}, allowedTags: [] };

const createArgs = (joi) => [
  {
    name: 'disallowHTML',
    assert: joi.boolean(),
  },
];

const createMethod = (name) => {
  return function (disallowHTML = false) {
    return this.$_addRule({ name, args: { disallowHTML } });
  };
};

const createValidate = (multiline = false) => {
  return (value, { error }, { disallowHTML }) =>
    stripLow(value, multiline) !== value ||
    sanitizeHTML(value, disallowHTML ? REMOVE_HTML_CONFIG : undefined) !== value
      ? error('string.safe')
      : value;
};

export default (joi) => ({
  type: 'string',
  base: joi.string(),
  messages: {
    'string.safe': '{{#label}} contains unsafe characters',
  },
  rules: {
    safe: {
      args: createArgs(joi),
      method: createMethod('safe'),
      validate: createValidate(),
    },
    safeMultiline: {
      args: createArgs(joi),
      method: createMethod('safeMultiline'),
      validate: createValidate(true),
    },
  },
});
