import { Server, Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Inventory, UserData, UserState, UserId } from "./types";
import { InvalidInviteError, InviteManager } from "./inviteManager";
import { InvalidActionError, SocketErrorResponse, UserError } from "./errors";

type UserActions = {
    /**
     * Send the credentials to the server, validate them, and authenticate the user
     */
    authenticate: (userId: UserId) => void;
    /**
     * Send an invite to another user
     */
    sendInvite: (userId: UserId) => void;
    /**
     * Cancel an invite that was sent to another user
     */
    cancelInvite: (userId: UserId) => void;
    /**
     * Accept an invite from another user
     */
    acceptInvite: (userId: UserId) => void;
    /**
     * Reject an invite from another user
     */
    rejectInvite: (userId: UserId) => void;
    /**
     * Update the inventory that is being traded
     */
    updateInventory: (inventory: Inventory) => void;
    /**
     * Lock in the inventory that is being traded
     */
    lockIn: (inventory1: Inventory, inventory2: Inventory) => void;
    /**
     * Undo the lock-in of the inventory that is being traded
     */
    unlock: () => void;
    /**
     * Cancel the trade
     */
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
    /**
     * Notify the user that an action they attempted is invalid
     */
    error: (error: SocketErrorResponse) => void;
    /**
     * Notify the user that they have received an invite
     */
    inviteReceived: (userId: UserId) => void;
    /**
     * Notify the user that an invite they received was cancelled
     */
    inviteCancelled: (userId: UserId) => void;
    /**
     * Notify the user that the invite they sent was accepted
     */
    inviteAccepted: (userId: UserId) => void;
    /**
     * Notify the user that the invite they sent was rejected
     */
    inviteRejected: (userId: UserId) => void;
    /**
     * Notify the user that the other user's inventory was updated
     */
    inventoryUpdated: (inventory: Inventory) => void;
    /**
     * Notify the user that the other user has locked in their inventory
     */
    lockedIn: (inventory1: Inventory, inventory2: Inventory) => void;
    /**
     * Notify the user that the trade was unlocked
     */
    unlocked: () => void;
    /**
     * Notify the user that the trade was cancelled
     */
    tradeCancelled: () => void;
    /**
     * Notify the user that the trade was completed
     */
    tradeCompleted: () => void;
};

type TradeSocket = Socket<
    UserActions,
    DefaultEventsMap,
    Record<string, never>,
    UserData
>;

const validActions = new Map<UserState, (keyof UserActions)[]>([
    [UserState.noUserId, ["authenticate"]],
    [UserState.inLobby, ["sendInvite", "acceptInvite", "rejectInvite"]],
    [UserState.sentInvite, ["cancelInvite", "acceptInvite", "rejectInvite"]],
    [UserState.inTrade, ["updateInventory", "lockIn", "cancelTrade"]],
    [UserState.lockedIn, ["unlock"]],
]);

export class TradeServer {
    /**
     * The Socket.IO server instance.
     */
    io: Server<UserActions, ServerActions, Record<string, never>, UserData>;

    /**
     * The InviteManager instance, which handles sending and receiving invites.
     */
    inviteManager: InviteManager;

    /**
     * Map from authenticated user IDs to their corresponding sockets.
     */
    userIdToSocket = new Map<UserId, TradeSocket>();

    constructor(
        private _io: Server<
            UserActions,
            ServerActions,
            Record<string, never>,
            UserData
        >,
    ) {
        this.io = _io;
        this.setupSocketEvents();
        this.inviteManager = new InviteManager(
            this.notifyInviteSent.bind(this),
            this.notifyInviteAccepted.bind(this),
            this.notifyInviteRejected.bind(this),
            this.notifyInviteCancelled.bind(this),
        );
    }

    /**
     * Set up event listeners for the Socket.IO server.
     */
    private setupSocketEvents() {
        const handlers = new Map<
            keyof UserActions,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (socket: TradeSocket, ...args: any) => any
        >([
            ["authenticate", this.handleAuthenticate.bind(this)],
            ["sendInvite", this.handleSendInvite.bind(this)],
            ["cancelInvite", this.handleCancelInvite.bind(this)],
            ["acceptInvite", this.handleAcceptInvite.bind(this)],
            ["rejectInvite", this.handleRejectInvite.bind(this)],
            ["updateInventory", this.handleUpdateInventory.bind(this)],
            ["lockIn", this.handleLockIn.bind(this)],
            ["unlock", this.handleUnlock.bind(this)],
            ["cancelTrade", this.handleCancelTrade.bind(this)],
        ]);

        this.io.on("connection", (socket) => {
            // Set initial state
            socket.data.state = UserState.noUserId;

            // Iterate over actions (keys of UserActions)
            for (const action of userActionList) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                socket.on(action, (...args: any): void => {
                    const state = socket.data.state;

                    const callback = args.pop();

                    if (validActions.get(state)?.includes(action)) {
                        try {
                            callback(handlers.get(action)!(socket, ...args));
                        } catch (error: unknown) {
                            if (error instanceof UserError) {
                                callback(error.toResponse());
                            } else {
                                throw error;
                            }
                        }
                    } else {
                        socket.emit(
                            "error",
                            new InvalidActionError(action, state).toResponse(),
                        );
                    }
                });
            }

            socket.on("disconnect", () => {
                if (socket.data.userId) {
                    this.inviteManager.userDisconnected(socket.data.userId);

                    this.userIdToSocket.delete(socket.data.userId);

                    console.log(
                        `User "${socket.data.userId}" has disconnected`,
                    );
                }
            });
        });
    }

    close() {
        this.io.close();
    }

    /////////////////////////////////////////////
    //        Handlers for User Actions        //
    /////////////////////////////////////////////

    /**
     * Handler for the "authenticate" user action.
     * @param socket The socket that sent the action
     * @param userId The user ID to authenticate to
     */
    private handleAuthenticate(socket: TradeSocket, userId: UserId) {
        if (this.userIdToSocket.has(userId)) {
            throw new UserError(userId);
        }

        this.userIdToSocket.set(userId, socket);

        socket.data.userId = userId;
        socket.data.state = UserState.inLobby;
        socket.data.inviteSentTo = undefined;
        socket.data.tradeInfo = undefined;

        this.inviteManager.userConnected(userId);

        console.log(`User "${userId}" has connected`);

        this.setUserState(userId, UserState.inLobby);
    }

    /**
     * Handler for the "sendInvite" user action.
     * @param socket The socket that sent the action
     * @param userId The user ID to send the invite to
     */
    private handleSendInvite(socket: TradeSocket, userId: UserId) {
        this.inviteManager.sendInvite(socket.data, userId);

        this.setUserState(socket.data.userId!, UserState.sentInvite);
    }

    /**
     * Handler for the "cancelInvite" user action.
     * @param socket The socket that sent the action
     */
    private handleCancelInvite(socket: TradeSocket) {
        this.inviteManager.cancelInvite(socket.data);

        this.setUserState(socket.data.userId!, UserState.inLobby);
    }

    /**
     * Handler for the "acceptInvite" user action.
     * @param socket The socket that sent the action
     * @param fromId The user ID that sent the invite that is being accepted
     */
    private handleAcceptInvite(socket: TradeSocket, fromId: UserId) {
        const fromSocket = this.userIdToSocket.get(fromId);
        const toId = socket.data.userId!;

        if (fromSocket === undefined) {
            throw new InvalidInviteError(fromId, toId);
        }

        this.inviteManager.acceptInvite(fromSocket.data, toId);

        this.setUserState(fromId, UserState.inTrade);
        this.setUserState(toId, UserState.inTrade);
    }

    /**
     * Handler for the "rejectInvite" user action.
     * @param socket The socket that sent the action
     * @param fromId The user ID that sent the invite that is being rejected
     */
    private handleRejectInvite(socket: TradeSocket, fromId: UserId) {
        const fromSocket = this.userIdToSocket.get(fromId);
        const toId = socket.data.userId!;

        if (fromSocket === undefined) {
            throw new InvalidInviteError(fromId, toId);
        }

        this.inviteManager.rejectInvite(fromSocket.data, toId);

        this.setUserState(fromId, UserState.inLobby);
    }

    /**
     * Handler for the "updateInventory" user action.
     * @param socket The socket that sent the action
     * @param inventory The updated inventory
     */
    private handleUpdateInventory(socket: TradeSocket, inventory: Inventory) {
        // TODO
    }

    /**
     * Handler for the "lockIn" user action.
     * @param socket The socket that sent the action
     * @param inventory1 The inventory of the first user
     * @param inventory2 The inventory of the second user
     */
    private handleLockIn(
        socket: TradeSocket,
        inventory1: Inventory,
        inventory2: Inventory,
    ) {
        // TODO
    }

    /**
     * Handler for the "unlock" user action.
     * @param socket The socket that sent the action
     */
    private handleUnlock(socket: TradeSocket) {
        // TODO
    }

    /**
     * Handler for the "cancelTrade" user action.
     * @param socket The socket that sent the action
     */
    private handleCancelTrade(socket: TradeSocket) {
        // TODO
    }

    //////////////////////////////////////////////
    //           Private Helper Methods         //
    //////////////////////////////////////////////

    // Invites

    private notifyInviteSent(from: UserId, to: UserId) {
        this.userIdToSocket.get(to)!.emit("inviteReceived", from);
    }

    private notifyInviteCancelled(from: UserId, to: UserId) {
        this.userIdToSocket.get(to)!.emit("inviteCancelled", from);
    }

    private notifyInviteAccepted(from: UserId, to: UserId) {
        this.userIdToSocket.get(from)!.emit("inviteAccepted", to);
    }

    private notifyInviteRejected(from: UserId, to: UserId) {
        this.userIdToSocket.get(from)!.emit("inviteRejected", to);
    }

    /////////////////////////////////////////////
    //           Accessors for Tests           //
    /////////////////////////////////////////////

    // User State

    getUserState(userId: UserId): UserState {
        return (
            this.userIdToSocket.get(userId)?.data.state || UserState.noUserId
        );
    }

    setUserState(userId: UserId, state: UserState) {
        const socket = this.userIdToSocket.get(userId);
        if (socket) {
            socket.data.state = state;
        }
    }
}
