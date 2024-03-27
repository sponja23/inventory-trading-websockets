import { Server, Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";

export type Inventory = string[];

export type TradeInformation = {
    name1: string;
    name2: string;
    inventory1: Inventory;
    inventory2: Inventory;
};

enum UserState {
    noName,
    inLobby,
    sentInvite,
    receivedInvite,
    inTrade,
    lockedIn,
}

type SocketData = {
    name?: string;
    state: UserState;
    tradeInfo?: TradeInformation;
};

type UserActions = {
    setName: (name: string) => void;
    sendInvite: (name: string) => void;
    cancelInvite: () => void;
    acceptInvite: () => void;
    rejectInvite: () => void;
    updateInventory: (inventory: Inventory) => void;
    lockIn: (inventory1: Inventory, inventory2: Inventory) => void;
    cancelTrade: () => void;
};

const actionList: (keyof UserActions)[] = [
    "setName",
    "sendInvite",
    "cancelInvite",
    "acceptInvite",
    "rejectInvite",
    "updateInventory",
    "lockIn",
    "cancelTrade",
];

export class TradeSystem {
    private nameToSocket = new Map<
        string,
        Socket<UserActions, DefaultEventsMap>
    >();
    private transitions = new Map<
        UserState,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Map<keyof UserActions, (socket: Socket, ...args: any[]) => void>
    >();

    constructor(
        private io: Server<
            UserActions,
            DefaultEventsMap,
            Record<string, never>,
            SocketData
        >,
    ) {
        this.setupTransitions();
        this.setupSocketEvents();
    }

    private setupTransitions() {
        this.transitions.set(
            UserState.noName,
            new Map([["setName", this.handleSetName.bind(this)]]),
        );
        this.transitions.set(
            UserState.inLobby,
            new Map([["sendInvite", this.handleSendInvite.bind(this)]]),
        );
        this.transitions.set(
            UserState.sentInvite,
            new Map([["cancelInvite", this.handleCancelInvite.bind(this)]]),
        );
        this.transitions.set(
            UserState.receivedInvite,
            new Map([
                ["acceptInvite", this.handleAcceptInvite.bind(this)],
                ["rejectInvite", this.handleRejectInvite.bind(this)],
            ]),
        );
        this.transitions.set(
            UserState.inTrade,
            new Map([
                ["updateInventory", this.handleUpdateInventory.bind(this)],
                ["lockIn", this.handleLockIn.bind(this)],
                ["cancelTrade", this.handleCancelTrade.bind(this)],
            ]),
        );
    }

    private setupSocketEvents() {
        this.io.on("connection", (socket) => {
            // Set initial state
            socket.data.state = UserState.noName;

            // Iterate over actions (keys of UserActions)
            for (const action of actionList) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                socket.on(action, (...args: any): void => {
                    const state = socket.data.state;
                    const transition = this.transitions.get(state)?.get(action);
                    if (transition) {
                        transition(socket, ...args);
                    } else {
                        socket.emit(
                            "error",
                            `Invalid action: "${action}" for state "${state}"`,
                        );
                    }
                });
            }

            socket.on("disconnect", () => {
                if (socket.data.name) {
                    this.nameToSocket.delete(socket.data.name);
                    console.log(`User "${socket.data.name}" has disconnected`);
                }
            });
        });
    }

    private handleSetName(socket: Socket, name: string) {
        if (this.nameToSocket.has(name)) {
            socket.emit("error", `Name "${name}" is already taken`);
            return;
        }

        this.nameToSocket.set(name, socket);
        socket.data.name = name;
        socket.data.state = UserState.inLobby;
        socket.emit("success", name);

        console.log(`User "${name}" has connected`);
    }

    private handleSendInvite(socket: Socket, name: string) {
        // TODO
    }

    private handleCancelInvite(socket: Socket) {
        // TODO
    }

    private handleAcceptInvite(socket: Socket) {
        // TODO
    }

    private handleRejectInvite(socket: Socket) {
        // TODO
    }

    private handleUpdateInventory(socket: Socket, inventory: Inventory) {
        // TODO
    }

    private handleLockIn(
        socket: Socket,
        inventory1: Inventory,
        inventory2: Inventory,
    ) {
        // TODO
    }

    private handleCancelTrade(socket: Socket) {
        // TODO
    }
}
