import { UserError } from "./errors";
import { UserId } from "./types";

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
 * An error that is thrown when a user attempts to send an invite to themselves.
 */
export class SelfInviteError extends UserError {
    constructor() {
        super("Cannot send invite to self", "SelfInviteError");
    }
}

/**
 * A user's information pertaining to the invite system.
 */
type InviteInfo = {
    /**
     * The user ID of the user to which an invite was sent.
     *
     * Can be `undefined` if no invite was sent.
     */
    inviteSentTo?: UserId;

    /**
     * The set of users that have sent an invite to this user.
     */
    pendingInvites: Set<UserId>;

    /**
     * Whether the user is connected.
     */
    connected: boolean;
};

/**
 * A manager for handling invites between users.
 *
 * This class is responsible for managing the state of invites between users.
 */
export class InviteManager {
    /**
     * Map from user IDs to their invite information.
     */
    private readonly inviteInfo: Map<UserId, InviteInfo>;

    readonly onSend: (from: UserId, to: UserId) => void;
    readonly onAccept: (from: UserId, to: UserId) => void;
    readonly onReject: (from: UserId, to: UserId) => void;
    readonly onCancel: (from: UserId, to: UserId) => void;

    constructor(
        onSend: (from: UserId, to: UserId) => void,
        onAccept: (from: UserId, to: UserId) => void,
        onReject: (from: UserId, to: UserId) => void,
        onCancel: (from: UserId, to: UserId) => void,
    ) {
        this.inviteInfo = new Map();

        this.onSend = onSend;
        this.onAccept = onAccept;
        this.onReject = onReject;
        this.onCancel = onCancel;
    }

    /**
     * Called when a user connects.
     * @param userId The ID of the user that connected.
     */
    userConnected(userId: UserId) {
        const info = this.getInfo(userId);

        // Send invites to the user
        for (const from of info.pendingInvites) {
            this.onSend(from, userId);
        }

        info.connected = true;
    }

    /**
     * Called when a user disconnects.
     * @param userId The ID of the user that disconnected.
     */
    userDisconnected(userId: UserId) {
        const info = this.getInfo(userId);
        const { inviteSentTo } = info;

        if (inviteSentTo !== undefined) {
            this.cancelInvite(userId);
        }

        info.connected = false;
    }

    /**
     * Sends an invite from one user to another.
     * @param fromData The data of the user sending the invite.
     * @param to The ID of the user to send the invite to.
     */
    sendInvite(from: UserId, to: UserId) {
        if (from === to) {
            throw new SelfInviteError();
        }

        this.addPendingInvite(from, to);

        const toInfo = this.getInfo(to);

        if (toInfo.connected) {
            this.onSend(from, to);
        }
    }

    /**
     * Cancels an invite sent by a user.
     * @param fromData The data of the user cancelling the invite.
     */
    cancelInvite(from: UserId) {
        const fromInfo = this.getInfo(from);
        const to = fromInfo.inviteSentTo;

        if (to === undefined) {
            throw new Error(
                "Internal error: user should not be able to cancel non-existent invite",
            );
        }

        if (!this.inviteExists(from, to)) {
            throw new InvalidInviteError(from, to);
        }

        this.removePendingInvite(from, to);

        this.onCancel(from, to);
    }

    /**
     * Accepts an invite sent to a user.
     * @param fromData The data of the user that sent the invite.
     * @param to The ID of the user that the invite was sent to.
     */
    acceptInvite(from: UserId, to: UserId) {
        if (!this.inviteExists(from, to)) {
            throw new InvalidInviteError(from, to);
        }

        this.removePendingInvite(from, to);

        this.onAccept(from, to);
    }

    /**
     * Rejects an invite sent to a user.
     * @param fromData The data of the user that sent the invite.
     * @param to The ID of the user that the invite was sent to.
     */
    rejectInvite(from: UserId, to: UserId) {
        if (!this.inviteExists(from, to)) {
            throw new InvalidInviteError(from, to);
        }

        this.removePendingInvite(from, to);

        this.onReject(from, to);
    }

    // Private methods
    private getInfo(userId: UserId): InviteInfo {
        if (!this.inviteInfo.has(userId)) {
            this.inviteInfo.set(userId, {
                pendingInvites: new Set(),
                connected: false,
            });
        }

        return this.inviteInfo.get(userId)!;
    }

    private addPendingInvite(from: UserId, to: UserId) {
        const fromInfo = this.getInfo(from);

        if (fromInfo.inviteSentTo !== undefined) {
            throw new Error(
                "Internal error: user should not be able to send multiple invites",
            );
        }

        fromInfo.inviteSentTo = to;

        const toInfo = this.getInfo(to);

        toInfo.pendingInvites.add(from);
    }

    private removePendingInvite(from: UserId, to: UserId) {
        const fromInfo = this.getInfo(from);

        fromInfo.inviteSentTo = undefined;

        const toInfo = this.getInfo(to);

        toInfo.pendingInvites.delete(from);
    }

    private inviteExists(from: UserId, to: UserId): boolean {
        const fromInfo = this.getInfo(from);

        return fromInfo.inviteSentTo === to;
    }

    // Public methods for testing

    getPendingInvites(userId: UserId): Set<UserId> {
        return this.getInfo(userId).pendingInvites;
    }

    getSentInvite(userId: UserId): UserId | undefined {
        return this.getInfo(userId).inviteSentTo;
    }
}
