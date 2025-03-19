import { expect, test as it } from 'vitest';
import Joi from 'joi';
import JoiSafe from './';

const j = () => Joi.extend(JoiSafe);

const test = ({ disallowHTML, input, multiline, valid }) => {
  let error, value;
  if (multiline) {
    ({ error, value } = j()
      .string()
      .safeMultiline(disallowHTML)
      .validate(input));
  } else {
    ({ error, value } = j().string().safe(disallowHTML).validate(input));
  }
  if (valid) {
    expect(error).toBe(undefined);
  } else {
    expect(error).not.toBe(undefined);
  }
  expect(value).toBe(input);
};

it('can be loaded by Joi', () => expect(() => j()).not.toThrow());

it('only applies to string types', () => {
  for (const type of [
    j().alternatives(),
    j().any(),
    j().array(),
    j().binary(),
    j().boolean(),
    j().date(),
    j().function(),
    j().link(),
    j().number(),
    j().object(),
    j().symbol(),
  ]) {
    expect(() => type.safe()).toThrow();
    expect(() => type.safe(true)).toThrow();
    expect(() => type.safeMultiline()).toThrow();
    expect(() => type.safeMultiline(true)).toThrow();
  }

  expect(() => j().string().safe()).not.toThrow();
  expect(() => j().string().safe(true)).not.toThrow();
  expect(() => j().string().safeMultiline()).not.toThrow();
  expect(() => j().string().safeMultiline(true)).not.toThrow();
});

it('disallows unsafe characters', () => {
  test({
    input: 'safe\x00',
    multiline: false,
    valid: false,
  });
  test({
    input: 'safe\x00',
    multiline: true,
    valid: false,
  });
  test({
    input: 'safe\x0A\x0D',
    multiline: false,
    valid: false,
  });
  test({
    input: 'safe\x0A\x0D',
    multiline: true,
    valid: true,
  });
  test({
    input: 'safe\n\r',
    multiline: false,
    valid: false,
  });
  test({
    input: 'safe\n\r',
    multiline: true,
    valid: true,
  });
  test({
    input: 'safe\t',
    multiline: false,
    valid: false,
  });
  test({
    input: 'safe\t',
    multiline: true,
    valid: false,
  });
});

it('disallows unsafe HTML', () => {
  test({
    disallowHTML: false,
    input: '<div>safe html</div>',
    multiline: false,
    valid: true,
  });
  test({
    disallowHTML: false,
    input: '<div>safe\n\rhtml</div>',
    multiline: true,
    valid: true,
  });
  test({
    disallowHTML: false,
    input: `unsafe<script>alert('test');</script>html`,
    multiline: false,
    valid: false,
  });
});

it('can disallow HTML completely', () => {
  test({
    disallowHTML: true,
    input: '<div>safe html</div>',
    multiline: false,
    valid: false,
  });
  test({
    disallowHTML: true,
    input: 'safe\n\rhtml',
    multiline: true,
    valid: true,
  });
});
