export function createInFlightRequestCoalescer<T>() {
  const inFlightRequests = new Map<string, Promise<T>>();

  return function coalesceRequest(key: string, work: () => Promise<T>) {
    let sharedRequest = inFlightRequests.get(key);

    if (!sharedRequest) {
      sharedRequest = Promise.resolve().then(work);
      inFlightRequests.set(key, sharedRequest);
      void sharedRequest
        .finally(() => {
          if (inFlightRequests.get(key) === sharedRequest) {
            inFlightRequests.delete(key);
          }
        })
        .catch(() => {});
    }

    return sharedRequest;
  };
}
