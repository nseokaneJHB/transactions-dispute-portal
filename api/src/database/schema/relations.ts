import { relations } from "drizzle-orm";

import { AccountModel } from "./account.js";
import { AdminInviteModel } from "./admin-invite.js";
import { AuthAuditLogModel } from "./auth-audit-log.js";
import { DisputeAuditLogModel } from "./dispute-audit-log.js";
import { DisputeModel } from "./dispute.js";
import { SessionModel } from "./session.js";
import { TransactionModel } from "./transaction.js";
import { UserModel } from "./user.js";

export const UserModelRelations = relations(UserModel, ({ many }) => ({
	accounts: many(AccountModel),
	sessions: many(SessionModel),
	transactions: many(TransactionModel),
	disputes: many(DisputeModel, { relationName: "dispute_owner" }),
	resolvedDisputes: many(DisputeModel, { relationName: "dispute_resolver" }),
	disputeAuditLogs: many(DisputeAuditLogModel),
	authAuditLogs: many(AuthAuditLogModel),
	adminInvitesSent: many(AdminInviteModel),
}));

export const SessionModelRelations = relations(SessionModel, ({ one }) => ({
	user: one(UserModel, {
		references: [UserModel.id],
		fields: [SessionModel.user_id],
	}),
}));

export const AccountModelRelations = relations(AccountModel, ({ one }) => ({
	user: one(UserModel, {
		references: [UserModel.id],
		fields: [AccountModel.user_id],
	}),
}));

export const TransactionModelRelations = relations(
	TransactionModel,
	({ one, many }) => ({
		owner: one(UserModel, {
			references: [UserModel.id],
			fields: [TransactionModel.user_id],
		}),
		disputes: many(DisputeModel),
	}),
);

export const DisputeModelRelations = relations(
	DisputeModel,
	({ one, many }) => ({
		owner: one(UserModel, {
			relationName: "dispute_owner",
			references: [UserModel.id],
			fields: [DisputeModel.user_id],
		}),
		resolver: one(UserModel, {
			relationName: "dispute_resolver",
			references: [UserModel.id],
			fields: [DisputeModel.resolved_by],
		}),
		transaction: one(TransactionModel, {
			references: [TransactionModel.id],
			fields: [DisputeModel.transaction_id],
		}),
		auditLogs: many(DisputeAuditLogModel),
	}),
);

export const DisputeAuditLogModelRelations = relations(
	DisputeAuditLogModel,
	({ one }) => ({
		actor: one(UserModel, {
			references: [UserModel.id],
			fields: [DisputeAuditLogModel.actor_id],
		}),
		dispute: one(DisputeModel, {
			references: [DisputeModel.id],
			fields: [DisputeAuditLogModel.dispute_id],
		}),
	}),
);

export const AdminInviteModelRelations = relations(
	AdminInviteModel,
	({ one }) => ({
		invitedBy: one(UserModel, {
			references: [UserModel.id],
			fields: [AdminInviteModel.invited_by],
		}),
	}),
);

export const AuthAuditLogModelRelations = relations(
	AuthAuditLogModel,
	({ one }) => ({
		user: one(UserModel, {
			references: [UserModel.id],
			fields: [AuthAuditLogModel.user_id],
		}),
	}),
);
