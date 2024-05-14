import { UserData, UserId } from "./types";

export class InviteManager {
    // users -> invites to that user
    pendingInvites: Map<UserId, Set<UserId>>;

    // users -> invites to that user that have not been sent
    pendingNotifications: Map<UserId, Set<UserId>>;

    // users that are connected
    connectedUsers: Set<UserId>;

    readonly notifyInviteSent: (from: UserId, to: UserId) => void;
    readonly notifyInviteAccepted: (from: UserId, to: UserId) => void;
    readonly notifyInviteRejected: (from: UserId, to: UserId) => void;
    readonly notifyInviteCancelled: (from: UserId, to: UserId) => void;

    readonly notifyError: (userId: UserId, message: string) => void;

    constructor(
        onInviteSent: (from: UserId, to: UserId) => void,
        onInviteAccepted: (from: UserId, to: UserId) => void,
        onInviteRejected: (from: UserId, to: UserId) => void,
        onInviteCancelled: (from: UserId, to: UserId) => void,
        onError: (userId: UserId, message: string) => void,
    ) {
        this.pendingInvites = new Map();
        this.pendingNotifications = new Map();
        this.connectedUsers = new Set();

        this.notifyInviteSent = onInviteSent;
        this.notifyInviteAccepted = onInviteAccepted;
        this.notifyInviteRejected = onInviteRejected;
        this.notifyInviteCancelled = onInviteCancelled;
        this.notifyError = onError;
    }

    userConnected(userId: UserId) {
        this.connectedUsers.add(userId);

        if (this.pendingNotifications.has(userId)) {
            for (const from of this.pendingNotifications.get(userId)!) {
                this.notifyInviteSent(from, userId);
            }

            this.pendingNotifications.delete(userId);
        }
    }

    userDisconnected(userId: UserId) {
        this.connectedUsers.delete(userId);

        if (this.pendingInvites.has(userId)) {
            for (const from of this.pendingInvites.get(userId)!) {
                this.notifyInviteCancelled(from, userId);
            }

            this.pendingInvites.delete(userId);
        }
    }

    sendInvite(fromData: UserData, to: UserId) {
        const from = fromData.userId!;

        if (fromData.inviteSentTo !== undefined) {
            this.notifyError(from, "You have already sent an invite");
            return;
        }

        this.addPendingInvite(from, to);

        fromData.inviteSentTo = to;

        if (this.connectedUsers.has(to)) {
            this.notifyInviteSent(from, to);
        } else {
            this.addPendingNotification(from, to);
        }
    }

    cancelInvite(fromData: UserData) {
        const from = fromData.userId!;
        const to = fromData.inviteSentTo;

        if (to === undefined) {
            this.notifyError(from, "You have not sent an invite");
            return;
        }

        if (this.inviteExists(from, to)) {
            this.removePendingInvite(from, to);

            fromData.inviteSentTo = undefined;

            this.notifyInviteCancelled(from, to);
        } else {
            this.notifyError(from, "No invite to this user");
        }
    }

    acceptInvite(fromData: UserData, to: UserId) {
        const from = fromData.userId!;

        if (this.inviteExists(from, to)) {
            this.removePendingInvite(from, to);

            fromData.inviteSentTo = undefined;

            this.notifyInviteAccepted(from, to);
        } else {
            this.notifyError(to, "No invite from this user");
        }
    }

    rejectInvite(fromData: UserData, to: UserId) {
        const from = fromData.userId!;

        if (this.inviteExists(from, to)) {
            this.removePendingInvite(from, to);

            fromData.inviteSentTo = undefined;

            this.notifyInviteRejected(from, to);
        } else {
            this.notifyError(to, "No invite from this user");
        }
    }

    // Helper methods
    private addPendingInvite(from: UserId, to: UserId) {
        if (!this.pendingInvites.has(to)) {
            this.pendingInvites.set(to, new Set());
        }

        this.pendingInvites.get(to)!.add(from);
    }

    private addPendingNotification(from: UserId, to: UserId) {
        if (!this.pendingNotifications.has(to)) {
            this.pendingNotifications.set(to, new Set());
        }

        this.pendingNotifications.get(to)!.add(from);
    }

    private removePendingInvite(from: UserId, to: UserId) {
        if (this.pendingInvites.has(to)) {
            this.pendingInvites.get(to)!.delete(from);
        }

        if (this.pendingNotifications.has(to)) {
            this.pendingNotifications.get(to)!.delete(from);
        }
    }

    private inviteExists(from: UserId, to: UserId): boolean {
        return (
            this.pendingInvites.has(to) &&
            this.pendingInvites.get(to)!.has(from)
        );
    }
}
