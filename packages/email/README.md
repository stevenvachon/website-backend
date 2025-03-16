# email

> An AWS Lambda function for sending email (to me) via AWS SES.

- Supports `application/json` and `application/x-www-form-urlencoded` I/O.
- Performs validations for:
  - Completeness
  - Correctness
  - Security
  - English

## Building

From the root of the project, run:

```shell
npm run build --workspace=email
```

## Testing

From the root of the project, run:

```shell
npm test --workspace=email
```

For watched tests:

```shell
npm run test:watch --workspace=email
```
