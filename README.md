# website-backend [![Coverage Status][codecov-image]][codecov-url]

> My website's backend.

**Note**: this repository/project is _UNLICENSED_. If you don't know what that means, Google it.

## Installation

Be sure that [Git](https://git-scm.com) `>= 2` is installed.

Open a command line at, or change directory (`cd`) to where you'd like the project to exist (as a sub-directory).

Checkout the repository:

```shell
git clone git@github.com:stevenvachon/website-backend.git
```

Open the project directory:

```shell
cd website-backend
```

Be sure that [Node.js](https://nodejs.org) `>= 22` is installed.

Install all dependencies:

```shell
npm install
```

## Building & Linting

For individual builds, see the README for each package.

To run all builds concurrently:

```shell
npm run build:all
```

To lint all files:

```shell
npm run lint:all
```

## Testing

For individual tests, see the README for each package.

To run all tests concurrently:

```shell
npm run test:all
```

## Deploying

Deployment will be performed automatically when pushing/merging to the "main" branch.

## To-do

- Search for "TODO" and "@todo".
- Set up alarms for each Lambda to detect abuse early.
- Set up throttling for API Gateway -- in YAML config?
- Maybe send Pinpoint data to S3 via Firehose for QuickSight to access.
  - Use S3 Lifecycle Policy to remove old data.
- Consider using environment variables for Lambda CORS.
- Consider using TypeScript since all tests are stubbing `@aws-sdk/*`.
- Add [spectral cli](https://npmjs.com/@stoplight/spectral-cli) to _packages/api_ when possible; it wasn't working, and the IBM validator is too opinionated.
- Set up coverage for each individual package, and one for the root (all packages).
  - https://docs.coveralls.io/parallel-builds
- Use `Promise.try()` in some places (such as tests) when Lambda supports Node v24.
- Try [negotiator](https://npmjs.com/negotiator) again. It wasn't conforming to my tests.
- Consider responding with HTTP 415 for `Content-Type` headers containing a non-UTF8 charset.

[codecov-image]: https://img.shields.io/codecov/c/github/stevenvachon/website-backend
[codecov-url]: https://app.codecov.io/github/stevenvachon/website-backend
