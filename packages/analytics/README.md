# analytics

> An AWS Lambda function for sending analytics to AWS Pinpoint.

- Supports `application/json` I/O.
- Performs validations for:
  - Completeness
  - Correctness
  - Security

## Building

From the root of the project, run:

```shell
npm run build --workspace=analytics
```

## Testing

From the root of the project, run:

```shell
npm test --workspace=analytics
```

For watched tests:

```shell
npm run test:watch --workspace=analytics
```
