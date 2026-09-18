// Express 4 does not forward a rejected promise from an async route handler
// to the error middleware on its own — without this, a thrown DB/MQTT error
// inside any `async (req, res) => {...}` handler becomes an unhandled
// rejection and the request just hangs instead of returning a 500.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
