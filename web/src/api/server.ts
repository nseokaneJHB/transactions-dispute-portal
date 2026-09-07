import { getRequest } from "@tanstack/react-start/server";

import type { AxiosRequestConfig } from "axios";

/**
 * Axios options that forward the inbound request's `Cookie` header to the API
 * during SSR, so a `createServerFn` read carries the caller's session. A no-op
 * object on the client, where axios sends the cookie itself via
 * `withCredentials`.
 */
export const forwardCookie = (
	extra: AxiosRequestConfig = {},
): AxiosRequestConfig => {
	const cookie = getRequest().headers.get("cookie");
	if (!cookie) return extra;

	return { ...extra, headers: { ...extra.headers, cookie } };
};
