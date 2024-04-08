import { Server, Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

export type Inventory = string[];

export type TradeInformation = {
    userId1: string;
    userId2: string;
    inventory1: Inventory;
    inventory2: Inventory;
};

enum UserState {
    noUserId,
    inLobby,
    sentInvite,
    inTrade,
    lockedIn,
}

type SocketData = {
    // The user ID of the connected user
    userId?: string;
    // The current state of the user
    state: UserState;
    // The user ID to which an invite was sent (if any)
    inviteSentTo?: string;
    // The trade information for the current trade (if any)
    tradeInfo?: TradeInformation;
};

type UserActions = {
    // Send the credentials to the server, validate them, and authenticate the user
    authenticate: (userId: string) => void;
    // Send an invite to another user
    sendInvite: (userId: string) => void;
    // Cancel an invite that was sent to another user
    cancelInvite: (userId: string) => void;
    // Accept an invite from another user
    acceptInvite: (userId: string) => void;
    // Reject an invite from another user
    rejectInvite: (userId: string) => void;
    // Update the inventory that is being traded
    updateInventory: (inventory: Inventory) => void;
    // Lock in the inventory that is being traded
    lockIn: (inventory1: Inventory, inventory2: Inventory) => void;
    // Undo the lock-in of the inventory that is being traded
    unlock: () => void;
    // Cancel the trade
    cancelTrade: () => void;
};

const userActionList = [
    "authenticate",
    "sendInvite",
    "cancelInvite",
    "acceptInvite",
    "rejectInvite",
    "updateInventory",
    "lockIn",
    "unlock",
    "cancelTrade",
] as (keyof UserActions)[];

type ServerActions = {
    // Notify the user that the action was successful
    success: (message: string) => void;
    // Notify the user that the action was unsuccessful
    error: (message: string) => void;
    // Notify the user that they have received an invite
    inviteReceived: (userId: string) => void;
    // Notify the user that an invite they received was cancelled
    inviteCancelled: (userId: string) => void;
    // Notify the user that the invite they sent was accepted
    inviteAccepted: (userId: string) => void;
    // Notify the user that the invite they sent was rejected
    inviteRejected: (userId: string) => void;
    // Notify the user that the trade inventory was updated
    inventoryUpdated: (inventory: Inventory) => void;
    // Notify the user that the trade was locked in
    lockedIn: (inventory1: Inventory, inventory2: Inventory) => void;
    // Notify the user that the trade was unlocked
    unlocked: () => void;
    // Notify the user that the trade was cancelled
    tradeCancelled: () => void;
    // Notify the user that the trade was completed
    tradeCompleted: () => void;
};

type TradeSocket = Socket<
    UserActions,
    DefaultEventsMap,
    Record<string, never>,
    SocketData
>;

const validActions = new Map<UserState, (keyof UserActions)[]>([
    [UserState.noUserId, ["authenticate"]],
    [UserState.inLobby, ["sendInvite", "acceptInvite", "rejectInvite"]],
    [UserState.sentInvite, ["cancelInvite", "acceptInvite", "rejectInvite"]],
    [UserState.inTrade, ["updateInventory", "lockIn", "cancelTrade"]],
    [UserState.lockedIn, ["unlock"]],
]);

export class TradeSystem {
    // userId -> socket
    private userIdToSocket = new Map<string, TradeSocket>();
    // userId -> [userIDs that have sent an invite]
    private pendingInvites = new Map<string, Set<string>>();

    constructor(
        private io: Server<
            UserActions,
            ServerActions,
            Record<string, never>,
            SocketData
        >,
    ) {
        this.setupSocketEvents();
    }

    private setupSocketEvents() {
        const handlers = new Map<
            keyof UserActions,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (socket: TradeSocket, ...args: any) => UserState
        >([
            ["authenticate", this.handleAuthenticate],
            ["sendInvite", this.handleSendInvite],
            ["cancelInvite", this.handleCancelInvite],
            ["acceptInvite", this.handleAcceptInvite],
            ["rejectInvite", this.handleRejectInvite],
            ["updateInventory", this.handleUpdateInventory],
            ["lockIn", this.handleLockIn],
            ["unlock", this.handleUnlock],
            ["cancelTrade", this.handleCancelTrade],
        ]);

        this.io.on("connection", (socket) => {
            // Set initial state
            socket.data.state = UserState.noUserId;

            // Iterate over actions (keys of UserActions)
            for (const action of userActionList) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                socket.on(action, (...args: any): void => {
                    const state = socket.data.state;
                    if (validActions.get(state)?.includes(action)) {
                        socket.data.state = handlers.get(action)!(
                            socket,
                            ...args,
                        );
                    } else {
                        socket.emit(
                            "error",
                            `Invalid action: "${action}" for state "${state}"`,
                        );
                    }
                });
            }

            socket.on("disconnect", () => {
                if (socket.data.userId) {
                    this.userIdToSocket.delete(socket.data.userId);
                    // TODO: Reject pending invites?

                    // TODO: Cancel trade if in progress

                    console.log(
                        `User "${socket.data.userId}" has disconnected`,
                    );
                }
            });
        });
    }

    private handleAuthenticate(socket: TradeSocket, userId: string): UserState {
        if (this.userIdToSocket.has(userId)) {
            socket.emit("error", `User ID "${userId}" is already connected`);
            return UserState.noUserId;
        }

        this.userIdToSocket.set(userId, socket);

        socket.data.userId = userId;
        socket.data.state = UserState.inLobby;
        socket.data.inviteSentTo = undefined;
        socket.data.tradeInfo = undefined;

        for (const invitingUserId of this.pendingInvites.get(userId) || []) {
            socket.emit("inviteReceived", invitingUserId);
        }

        socket.emit("success", userId);

        console.log(`User "${userId}" has connected`);

        return UserState.inLobby;
    }

    private handleSendInvite(socket: TradeSocket, userId: string): UserState {
        if (!this.pendingInvites.has(userId)) {
            this.pendingInvites.set(userId, new Set());
        }

        this.pendingInvites.get(userId)!.add(socket.data.userId!);

        if (this.userIdToSocket.has(userId)) {
            this.userIdToSocket.get(userId)!.emit("inviteReceived", userId);
        }

        socket.data.inviteSentTo = userId;

        socket.emit("success", `Invite sent to "${userId}"`);

        return UserState.sentInvite;
    }

    private handleCancelInvite(socket: TradeSocket): UserState {
        const inviteSentTo = socket.data.inviteSentTo;
        if (!inviteSentTo) {
            socket.emit("error", "No invite to cancel");
            return socket.data.state;
        }

        this.pendingInvites.get(inviteSentTo)!.delete(socket.data.userId!);

        if (this.userIdToSocket.has(inviteSentTo)) {
            this.userIdToSocket
                .get(inviteSentTo)!
                .emit("inviteCancelled", socket.data.userId!);
        }

        socket.data.inviteSentTo = undefined;

        socket.emit("success", `Invite to "${inviteSentTo}" cancelled`);

        return UserState.inLobby;
    }

    private handleAcceptInvite(socket: TradeSocket): UserState {
        // TODO
    }

    private handleRejectInvite(socket: TradeSocket): UserState {
        // TODO
    }

    private handleUpdateInventory(
        socket: TradeSocket,
        inventory: Inventory,
    ): UserState {
        // TODO
    }

    private handleLockIn(
        socket: TradeSocket,
        inventory1: Inventory,
        inventory2: Inventory,
    ): UserState {
        // TODO
    }

    private handleUnlock(socket: TradeSocket): UserState {
        // TODO
    }

    private handleCancelTrade(socket: TradeSocket): UserState {
        // TODO
    }
}
