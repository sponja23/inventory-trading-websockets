import { Server, Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Inventory, UserData, UserState, UserId } from "./types";
import { InviteManager } from "./inviteManager";
import { InvalidActionError, SocketErrorResponse, UserError } from "./errors";
import { TradeInfo, TradeManager } from "./tradeManager";
import jwt from "jsonwebtoken";
import { verifyToken } from "./authentication";

type UserActions = {
    /**
     * Send the credentials to the server, validate them, and authenticate the user
     */
    authenticate: (token: string) => void;
    /**
     * Log out the user
     */
    logOut: () => void;
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
    /**
     * Accept the trade
     */
    completeTrade: () => void;
};

const userActionList = [
    "authenticate",
    "logOut",
    "sendInvite",
    "cancelInvite",
    "acceptInvite",
    "rejectInvite",
    "updateInventory",
    "lockIn",
    "unlock",
    "cancelTrade",
    "completeTrade",
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
     * Notify the user that the other user has unlocked their inventory
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
    [
        UserState.inLobby,
        ["sendInvite", "acceptInvite", "rejectInvite", "logOut"],
    ],
    [UserState.sentInvite, ["cancelInvite", "acceptInvite", "rejectInvite"]],
    [UserState.inTrade, ["updateInventory", "lockIn", "cancelTrade"]],
    [UserState.lockedIn, ["unlock", "completeTrade"]],
]);

/**
 * Configuration for the TradeServer.
 */
export type TradeServerConfig = {
    /**
     * The public key of the backend server.
     *
     * Used to verify the authenticity of auth tokens.
     *
     * If not provided, no authentication will be performed, and
     * `authenticate` will be called with the user ID.
     */
    backendPublicKey?: string;

    /**
     * The private key of the trading server.
     *
     * This is used to authenticate the trading server to the backend server.
     */
    privateKey?: string;

    /**
     * The endpoint used to perform trades.
     */
    performTradeEndpoint?: string;
};

export class TradeServer {
    /**
     * The configuration for the TradeServer.
     */
    config: TradeServerConfig;

    /**
     * The Socket.IO server instance.
     */
    io: Server<UserActions, ServerActions, Record<string, never>, UserData>;

    /**
     * The InviteManager instance, which handles sending and receiving invites.
     */
    inviteManager: InviteManager;

    /**
     * The TradeManager instance, which handles managing trades.
     */
    tradeManager: TradeManager;

    /**
     * Map from authenticated user IDs to their corresponding sockets.
     */
    userIdToSocket = new Map<UserId, TradeSocket>();

    constructor(
        config: TradeServerConfig,
        private _io: Server<
            UserActions,
            ServerActions,
            Record<string, never>,
            UserData
        >,
    ) {
        this.config = config;
        this.io = _io;
        this.setupSocketEvents();
        this.inviteManager = new InviteManager(
            this.inviteSent.bind(this),
            this.inviteAccepted.bind(this),
            this.inviteRejected.bind(this),
            this.inviteCancelled.bind(this),
        );

        this.tradeManager = new TradeManager(
            this.tradeStarted.bind(this),
            this.inventoryUpdated.bind(this),
            this.lockedIn.bind(this),
            this.unlocked.bind(this),
            this.notifyTradeCancelled.bind(this),
            this.performTrade.bind(this),
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
            ["logOut", this.handleLogOut.bind(this)],
            ["sendInvite", this.handleSendInvite.bind(this)],
            ["cancelInvite", this.handleCancelInvite.bind(this)],
            ["acceptInvite", this.handleAcceptInvite.bind(this)],
            ["rejectInvite", this.handleRejectInvite.bind(this)],
            ["updateInventory", this.handleUpdateInventory.bind(this)],
            ["lockIn", this.handleLockIn.bind(this)],
            ["unlock", this.handleUnlock.bind(this)],
            ["cancelTrade", this.handleCancelTrade.bind(this)],
            ["completeTrade", this.handleCompleteTrade.bind(this)],
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
                        callback(
                            new InvalidActionError(action, state).toResponse(),
                        );
                    }
                });
            }

            socket.on("disconnect", () => {
                if (socket.data.userId) this.handleLogOut(socket);
            });
        });
    }

    close() {
        this.io.close();
    }

    setUserState(userId: UserId, state: UserState) {
        const socket = this.userIdToSocket.get(userId);
        if (socket) {
            socket.data.state = state;
        }
    }

    /////////////////////////////////////////////
    //        Handlers for User Actions        //
    /////////////////////////////////////////////

    /**
     * Handler for the "authenticate" user action.
     * @param socket The socket that sent the action
     * @param userId The user ID to authenticate to
     */
    private handleAuthenticate(socket: TradeSocket, token: string) {
        let userId: UserId;

        if (this.config.backendPublicKey !== undefined) {
            // Verify the token
            userId = verifyToken(token, this.config.backendPublicKey);
        } else {
            userId = token;
        }

        this.userIdToSocket.set(userId, socket);

        socket.data.userId = userId;
        socket.data.state = UserState.inLobby;

        this.inviteManager.userConnected(userId);

        console.log(`User "${userId}" has connected`);

        this.setUserState(userId, UserState.inLobby);
    }

    /**
     * Handler for the "logOut" user action.
     * @param socket The socket that sent the action
     */
    private handleLogOut(socket: TradeSocket) {
        const userId = socket.data.userId!;

        this.inviteManager.userDisconnected(userId);
        this.tradeManager.userDisconnected(userId);

        this.setUserState(userId, UserState.noUserId);

        this.userIdToSocket.delete(userId);

        console.log(`User "${userId}" has logged out`);
    }

    /**
     * Handler for the "sendInvite" user action.
     * @param socket The socket that sent the action
     * @param toId The user ID to send the invite to
     */
    private handleSendInvite(socket: TradeSocket, toId: UserId) {
        const fromId = socket.data.userId!;

        this.inviteManager.sendInvite(fromId, toId);
    }

    /**
     * Handler for the "cancelInvite" user action.
     * @param socket The socket that sent the action
     */
    private handleCancelInvite(socket: TradeSocket) {
        const fromId = socket.data.userId!;

        this.inviteManager.cancelInvite(fromId);
    }

    /**
     * Handler for the "acceptInvite" user action.
     * @param socket The socket that sent the action
     * @param fromId The user ID that sent the invite that is being accepted
     */
    private handleAcceptInvite(socket: TradeSocket, fromId: UserId) {
        const toId = socket.data.userId!;

        this.inviteManager.acceptInvite(fromId, toId);

        this.tradeManager.startTrade(fromId, toId);
    }

    /**
     * Handler for the "rejectInvite" user action.
     * @param socket The socket that sent the action
     * @param fromId The user ID that sent the invite that is being rejected
     */
    private handleRejectInvite(socket: TradeSocket, fromId: UserId) {
        const toId = socket.data.userId!;

        this.inviteManager.rejectInvite(fromId, toId);
    }

    /**
     * Handler for the "updateInventory" user action.
     * @param socket The socket that sent the action
     * @param inventory The updated inventory
     */
    private handleUpdateInventory(socket: TradeSocket, inventory: Inventory) {
        const userId = socket.data.userId!;

        this.tradeManager.updateInventory(userId, inventory);
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
        const userId = socket.data.userId!;

        this.tradeManager.lockIn(userId, inventory1, inventory2);
    }

    /**
     * Handler for the "unlock" user action.
     * @param socket The socket that sent the action
     */
    private handleUnlock(socket: TradeSocket) {
        const userId = socket.data.userId!;

        this.tradeManager.unlock(userId);
    }

    /**
     * Handler for the "cancelTrade" user action.
     * @param socket The socket that sent the action
     */
    private handleCancelTrade(socket: TradeSocket) {
        const userId = socket.data.userId!;

        this.tradeManager.cancelTrade(userId);
    }

    /**
     * Handler for the "completeTrade" user action.
     */
    private handleCompleteTrade(socket: TradeSocket) {
        const userId = socket.data.userId!;

        this.tradeManager.completeTrade(userId);

        if (this.config.performTradeEndpoint && this.config.privateKey) {
            const tradeInfo = this.tradeManager.getTradeInfo(userId);

            // Perform the trade
            const payload = { tradeInfo };

            const userIds = tradeInfo.map((info) => info.userId);

            const token = jwt.sign({ userIds }, this.config.privateKey, {
                algorithm: "RS256",
                expiresIn: "1h",
            });

            fetch(this.config.performTradeEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            })
                .then((response) => {
                    if (response)
                        console.log("Trade performed between:", userIds);
                    else console.error("Trade failed between:", userIds);
                })
                .catch((error) => {
                    console.error("Trade failed between:", userIds, error);
                });
        }
    }

    //////////////////////////////////////////////
    //           Private Helper Methods         //
    //////////////////////////////////////////////

    // Invites

    private inviteSent(from: UserId, to: UserId) {
        this.setUserState(from, UserState.sentInvite);

        this.userIdToSocket.get(to)!.emit("inviteReceived", from);
    }

    private inviteCancelled(from: UserId, to: UserId) {
        this.setUserState(from, UserState.inLobby);

        this.userIdToSocket.get(to)?.emit("inviteCancelled", from);
    }

    private inviteAccepted(from: UserId, to: UserId) {
        this.setUserState(from, UserState.inTrade);
        this.setUserState(to, UserState.inTrade);

        this.userIdToSocket.get(from)!.emit("inviteAccepted", to);
    }

    private inviteRejected(from: UserId, to: UserId) {
        this.setUserState(from, UserState.inLobby);

        this.userIdToSocket.get(from)!.emit("inviteRejected", to);
    }

    // Trade

    private tradeStarted(user1: UserId, user2: UserId) {
        this.setUserState(user1, UserState.inTrade);
        this.setUserState(user2, UserState.inTrade);

        this.userIdToSocket.get(user1)!.emit("tradeStarted", user2);
        this.userIdToSocket.get(user2)!.emit("tradeStarted", user1);

        console.log("Trade started between", user1, "and", user2);
    }

    private inventoryUpdated(otherUserId: UserId, inventory: Inventory) {
        this.userIdToSocket
            .get(otherUserId)!
            .emit("inventoryUpdated", inventory);
    }

    private lockedIn(
        userId: UserId,
        otherUserId: UserId,
        selfInventory: Inventory,
        otherInventory: Inventory,
    ) {
        this.setUserState(userId, UserState.lockedIn);

        this.userIdToSocket
            .get(otherUserId)!
            .emit("lockedIn", selfInventory, otherInventory);
    }

    private unlocked(userId: UserId, otherUserId: UserId) {
        this.setUserState(userId, UserState.inTrade);

        this.userIdToSocket.get(otherUserId)!.emit("unlocked");
    }

    private notifyTradeCancelled(userId: UserId, otherUserId: UserId) {
        this.setUserState(userId, UserState.inLobby);
        this.setUserState(otherUserId, UserState.inLobby);

        this.userIdToSocket.get(otherUserId)!.emit("tradeCancelled");

        console.log("Trade cancelled between", userId, "and", otherUserId);
    }

    private performTrade([user1Info, user2Info]: TradeInfo) {
        const userId1 = user1Info.userId;
        const userId2 = user2Info.userId;

        this.setUserState(userId1, UserState.inLobby);
        this.setUserState(userId2, UserState.inLobby);

        this.userIdToSocket.get(userId1)!.emit("tradeCompleted");
        this.userIdToSocket.get(userId2)!.emit("tradeCompleted");

        console.log("Trade completed between", userId1, "and", userId2);

        // TODO
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

    // Invites

    getPendingInvites(userId: UserId): Set<UserId> {
        return this.inviteManager.getPendingInvites(userId);
    }

    getSentInvite(userId: UserId): UserId | undefined {
        return this.inviteManager.getSentInvite(userId);
    }

    // Trading

    getTradeInventory(userId: UserId): Inventory {
        return this.tradeManager.getTradeInventory(userId);
    }
}
