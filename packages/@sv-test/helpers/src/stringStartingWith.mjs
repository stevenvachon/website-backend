export default (received, startsWith) => {
  try {
    return { pass: received.startsWith(startsWith) };
  } catch {
    return {
      message: `expected "${received}" to start with "${startsWith}"`,
      pass: false,
    };
  }
};
