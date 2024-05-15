import { UserError } from "./errors";
import { UserData, UserId } from "./types";

/**
 * An error that is thrown when an invite does not exist.
 */
export class InvalidInviteError extends UserError {
    constructor(from: UserId, to: UserId) {
        super(
            `Invite from ${from} to ${to} does not exist`,
            "InvalidInviteError",
        );
    }
}

/**
 * A manager for handling invites between users.
 *
 * This class is responsible for managing the state of invites between users.
 */
export class InviteManager {
    /**
     * Map from user ID to the set of users that have sent them an invite.
     */
    pendingInvites: Map<UserId, Set<UserId>>;

    /**
     * Map from user ID to the set of invites that have not been sent to them yet
     * (because they were not connected at the time).
     */
    pendingNotifications: Map<UserId, Set<UserId>>;

    /**
     * Set of connected userIDs.
     */
    connectedUsers: Set<UserId>;

    readonly notifyInviteSent: (from: UserId, to: UserId) => void;
    readonly notifyInviteAccepted: (from: UserId, to: UserId) => void;
    readonly notifyInviteRejected: (from: UserId, to: UserId) => void;
    readonly notifyInviteCancelled: (from: UserId, to: UserId) => void;

    constructor(
        onInviteSent: (from: UserId, to: UserId) => void,
        onInviteAccepted: (from: UserId, to: UserId) => void,
        onInviteRejected: (from: UserId, to: UserId) => void,
        onInviteCancelled: (from: UserId, to: UserId) => void,
    ) {
        this.pendingInvites = new Map();
        this.pendingNotifications = new Map();
        this.connectedUsers = new Set();

        this.notifyInviteSent = onInviteSent;
        this.notifyInviteAccepted = onInviteAccepted;
        this.notifyInviteRejected = onInviteRejected;
        this.notifyInviteCancelled = onInviteCancelled;
    }

    /**
     * Called when a user connects.
     * @param userId The ID of the user that connected.
     */
    userConnected(userId: UserId) {
        this.connectedUsers.add(userId);

        if (this.pendingNotifications.has(userId)) {
            for (const from of this.pendingNotifications.get(userId)!) {
                this.notifyInviteSent(from, userId);
            }

            this.pendingNotifications.delete(userId);
        }
    }

    /**
     * Called when a user disconnects.
     * @param userId The ID of the user that disconnected.
     */
    userDisconnected(userId: UserId) {
        this.connectedUsers.delete(userId);

        if (this.pendingInvites.has(userId)) {
            for (const from of this.pendingInvites.get(userId)!) {
                this.notifyInviteCancelled(from, userId);
            }

            this.pendingInvites.delete(userId);
        }
    }

    /**
     * Sends an invite from one user to another.
     * @param fromData The data of the user sending the invite.
     * @param to The ID of the user to send the invite to.
     */
    sendInvite(fromData: UserData, to: UserId) {
        const from = fromData.userId!;

        if (fromData.inviteSentTo !== undefined) {
            throw new Error(
                "Internal error: user should not be able to send multiple invites",
            );
        }

        this.addPendingInvite(from, to);

        fromData.inviteSentTo = to;

        if (this.connectedUsers.has(to)) {
            this.notifyInviteSent(from, to);
        } else {
            this.addPendingNotification(from, to);
        }
    }

    /**
     * Cancels an invite sent by a user.
     * @param fromData The data of the user cancelling the invite.
     */
    cancelInvite(fromData: UserData) {
        const from = fromData.userId!;
        const to = fromData.inviteSentTo;

        if (to === undefined) {
            throw new Error(
                "Internal error: user should not be able to cancel non-existent invite",
            );
        }

        if (this.inviteExists(from, to)) {
            throw new InvalidInviteError(from, to);
        }

        this.removePendingInvite(from, to);

        fromData.inviteSentTo = undefined;

        this.notifyInviteCancelled(from, to);
    }

    /**
     * Accepts an invite sent to a user.
     * @param fromData The data of the user that sent the invite.
     * @param to The ID of the user that the invite was sent to.
     */
    acceptInvite(fromData: UserData, to: UserId) {
        const from = fromData.userId!;

        if (!this.inviteExists(from, to)) {
            throw new InvalidInviteError(from, to);
        }

        this.removePendingInvite(from, to);

        fromData.inviteSentTo = undefined;

        this.notifyInviteAccepted(from, to);
    }

    /**
     * Rejects an invite sent to a user.
     * @param fromData The data of the user that sent the invite.
     * @param to The ID of the user that the invite was sent to.
     */
    rejectInvite(fromData: UserData, to: UserId) {
        const from = fromData.userId!;

        if (!this.inviteExists(from, to)) {
            throw new InvalidInviteError(from, to);
        }

        this.removePendingInvite(from, to);

        fromData.inviteSentTo = undefined;

        this.notifyInviteRejected(from, to);
    }

    // Private methods
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
