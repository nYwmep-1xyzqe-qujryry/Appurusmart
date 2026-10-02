const listeners = new Set();

export const subscribeExpertChanges = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const notifyExpertChange = (endpoint) => {
  listeners.forEach((listener) => listener(endpoint));
};
