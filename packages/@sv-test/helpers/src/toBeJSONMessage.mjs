export default (received, startingWith) => {
  try {
    const j = JSON.parse(received);
    return {
      pass: startingWith ? j.message.startsWith(startingWith) : !!j.message,
    };
  } catch {
    return {
      message: () =>
        `expected ${received} to be JSON with a "message" key${
          startingWith ? `'s value starting with "${startingWith}"` : ''
        }`,
      pass: false,
    };
  }
};
