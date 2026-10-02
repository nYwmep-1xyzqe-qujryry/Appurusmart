const listeners = new Set();

export const subscribeLrdChange = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const notifyLrdChange = (endpoint) => {
  listeners.forEach((listener) => listener(endpoint));
};
