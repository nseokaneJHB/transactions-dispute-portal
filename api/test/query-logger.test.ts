import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { connection } from "../src/database/config.js";
import { formatQuery } from "../src/database/query-logger.js";
import {
	AdminInviteModel,
	DisputeModel,
	SessionModel,
	VerificationModel,
} from "../src/database/schema/index.js";

const SECRET = "anPYtAUNkKrqqqJNDdHvhSu2cYNUxIig";

const logged = ({ sql, params }: { sql: string; params: unknown[] }): string =>
	formatQuery(sql, params);

describe("development query logger", () => {
	it("hides a session token looked up by the auth check", () => {
		const line = logged(
			connection
				.select()
				.from(SessionModel)
				.where(eq(SessionModel.token, SECRET))
				.toSQL(),
		);

		expect(line).not.toContain(SECRET);
		expect(line).toContain('from "session"');
		expect(line).toContain("-- params: [1 redacted]");
	});

	it("hides the values written to the verification and invite tables", () => {
		const verification = logged(
			connection
				.insert(VerificationModel)
				.values({
					id: "v1",
					identifier: "sign-in-otp-a@example.com",
					value: SECRET,
					expires_at: new Date(),
				})
				.toSQL(),
		);
		const invite = logged(
			connection
				.select()
				.from(AdminInviteModel)
				.where(eq(AdminInviteModel.token, SECRET))
				.toSQL(),
		);

		expect(verification).not.toContain(SECRET);
		expect(invite).not.toContain(SECRET);
	});

	it("keeps the parameters of every other query, for debugging", () => {
		const line = logged(
			connection
				.select()
				.from(DisputeModel)
				.where(eq(DisputeModel.status, "SUBMITTED"))
				.limit(11)
				.toSQL(),
		);

		expect(line).toContain('-- params: ["SUBMITTED",11]');
	});
});
