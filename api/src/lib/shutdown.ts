let shuttingDown = false;

/** Flag the process as shutting down (or not). */
export const setShuttingDown = (value: boolean): void => {
	shuttingDown = value;
};

/** Whether a graceful shutdown is in progress. */
export const isShuttingDown = (): boolean => shuttingDown;
