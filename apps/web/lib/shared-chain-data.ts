import { zeroAddress } from "viem";

type ChainDataRequest = {
  curve: `0x${string}`;
  token?: `0x${string}`;
  pair?: `0x${string}`;
};

const inFlightRequests = new Map<string, Promise<unknown>>();

export function chainDataUrl({ curve, token, pair }: ChainDataRequest) {
  const search = new URLSearchParams({ curve });
  if (token) search.set("token", token);
  if (pair && pair !== zeroAddress) search.set("pair", pair);
  return `/api/chain-data?${search.toString()}`;
}

function abortError() {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function observeRequest<T>(request: Promise<T>, signal?: AbortSignal) {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(abortError());
  const abortSignal = signal;

  return new Promise<T>((resolve, reject) => {
    function cleanup() {
      abortSignal.removeEventListener("abort", handleAbort);
    }

    function handleAbort() {
      cleanup();
      reject(abortError());
    }

    abortSignal.addEventListener("abort", handleAbort, { once: true });
    request.then(
      (data) => {
        cleanup();
        resolve(data);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export function fetchSharedChainData<T>(
  request: ChainDataRequest,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return Promise.reject<T>(abortError());

  const url = chainDataUrl(request);
  let sharedRequest = inFlightRequests.get(url);

  if (!sharedRequest) {
    sharedRequest = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error("chain data unavailable");
      return response.json();
    });
    inFlightRequests.set(url, sharedRequest);
    void sharedRequest
      .finally(() => {
        if (inFlightRequests.get(url) === sharedRequest) {
          inFlightRequests.delete(url);
        }
      })
      .catch(() => {});
  }

  return observeRequest(sharedRequest as Promise<T>, signal);
}
