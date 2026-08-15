type HistoricalCodeClient = {
  getCode(args: {
    address: `0x${string}`;
    blockNumber: bigint;
  }): Promise<`0x${string}` | undefined>;
};

function hasContractCode(code: `0x${string}` | undefined) {
  return Boolean(code && code !== "0x" && code !== "0x0");
}

export async function findContractCreationBlock({
  client,
  address,
  lowerBound,
  upperBound,
}: {
  client: HistoricalCodeClient;
  address: `0x${string}`;
  lowerBound: bigint;
  upperBound: bigint;
}) {
  if (lowerBound > upperBound) {
    throw new Error("Contract creation lower bound exceeds upper bound");
  }

  if (
    !hasContractCode(await client.getCode({ address, blockNumber: upperBound }))
  ) {
    return null;
  }
  if (
    hasContractCode(await client.getCode({ address, blockNumber: lowerBound }))
  ) {
    return lowerBound;
  }

  let low = lowerBound + 1n;
  let high = upperBound;
  while (low < high) {
    const middle = low + (high - low) / 2n;
    if (hasContractCode(await client.getCode({ address, blockNumber: middle }))) {
      high = middle;
    } else {
      low = middle + 1n;
    }
  }
  return low;
}
