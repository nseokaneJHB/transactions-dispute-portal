let shuttingDown = false;

/**
 * Flag the process as shutting down. Readiness checks fail once this is set,
 * so the load balancer drains this instance before connections close.
 *
 * @param value - Whether the process is now shutting down.
 */
export const setShuttingDown = (value: boolean): void => {
	shuttingDown = value;
};

/**
 * @returns Whether a graceful shutdown is in progress.
 */
export const isShuttingDown = (): boolean => shuttingDown;
