/**
 * Wait for Status Utility
 *
 * Generic utility for polling resource status until target state is reached.
 */

export interface WaitOptions {
  /** Maximum wait time in seconds (default: 300) */
  timeoutSeconds?: number;
  /** Polling interval in seconds (default: 10) */
  intervalSeconds?: number;
  /** Status values that indicate failure */
  failureStatuses?: string[];
}

export type StatusGetter<T> = (resourceId: string) => Promise<T>;

/**
 * Wait for a resource to reach target status
 *
 * @param resourceId - Resource identifier
 * @param targetStatus - Target status to wait for
 * @param getStatus - Function to get current resource (must have 'status' property)
 * @param options - Wait options
 * @returns The resource object when target status is reached
 * @throws Error if timeout or failure status is reached
 */
export async function waitForStatus<T extends { status?: string }>(
  resourceId: string,
  targetStatus: string,
  getStatus: StatusGetter<T>,
  options: WaitOptions = {}
): Promise<T> {
  const {
    timeoutSeconds = 300,
    intervalSeconds = 10,
    failureStatuses = ['FAILED', 'DELETE_FAILED', 'CREATE_FAILED', 'UPDATE_FAILED'],
  } = options;

  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  const intervalMs = intervalSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    const resource = await getStatus(resourceId);
    const currentStatus = resource.status ?? 'UNKNOWN';

    console.log(`  [waitForStatus] ${resourceId}: ${currentStatus}`);

    if (currentStatus === targetStatus) {
      return resource;
    }

    if (failureStatuses.includes(currentStatus)) {
      throw new Error(
        `Resource ${resourceId} reached failure status: ${currentStatus}`
      );
    }

    await sleep(intervalMs);
  }

  throw new Error(
    `Timeout waiting for ${resourceId} to reach status ${targetStatus} after ${timeoutSeconds}s`
  );
}

/**
 * Wait for a resource to be deleted (ResourceNotFoundException)
 *
 * @param resourceId - Resource identifier
 * @param getStatus - Function to get current resource
 * @param options - Wait options
 */
export async function waitForDeletion<T>(
  resourceId: string,
  getStatus: StatusGetter<T>,
  options: WaitOptions = {}
): Promise<void> {
  const { timeoutSeconds = 300, intervalSeconds = 5 } = options;

  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  const intervalMs = intervalSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    try {
      await getStatus(resourceId);
      // Still exists, wait and retry
      await sleep(intervalMs);
    } catch (error: unknown) {
      // Check if resource not found (expected for deletion)
      if (isResourceNotFoundException(error)) {
        console.log(`  [waitForDeletion] ${resourceId}: Deleted`);
        return;
      }
      throw error;
    }
  }

  throw new Error(
    `Timeout waiting for ${resourceId} to be deleted after ${timeoutSeconds}s`
  );
}

/**
 * Check if error is a ResourceNotFoundException
 */
export function isResourceNotFoundException(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const errorObj = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
    return (
      errorObj.name === 'ResourceNotFoundException' ||
      errorObj.code === 'ResourceNotFoundException' ||
      errorObj.$metadata?.httpStatusCode === 404
    );
  }
  return false;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
