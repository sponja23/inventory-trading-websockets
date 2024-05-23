/* eslint-disable @typescript-eslint/no-explicit-any */
import http from "http";
import { Server } from "socket.io";
import ioc, { Socket } from "socket.io-client";
import { AddressInfo } from "net";
import { TradeServer } from "../src/tradeServer";
import { afterAll, afterEach, beforeAll, beforeEach } from "@jest/globals";

/**
 * A wrapper around a socket.io client that allows for async operations.
 */
export class AsyncSocket {
    private socket: Socket;

    constructor(socket: Socket) {
        this.socket = socket;
    }

    /**
     * Register a callback for an event.
     * @param event The event to listen for.
     * @param callback The callback to run when the event is received.
     */
    public on(event: string, callback: (...args: any[]) => Promise<void>) {
        this.socket.on(event, callback);
    }

    /**
     * Wait for an event to be received.
     * @param event The event to wait for.
     * @returns A promise that resolves when the event is received.
     */
    public waitFor(event: string) {
        return new Promise<void>((resolve) => {
            this.socket.on(event, () => {
                resolve();
            });
        });
    }

    /**
     * Emit an event.
     * @param event The event to emit.
     * @param args The arguments to send with the event.
     */
    public emit(event: string, ...args: any[]) {
        return new Promise<void>((resolve, reject) => {
            this.socket.emit(event, ...args, (err: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    public disconnect() {
        this.socket.disconnect();
    }

    public get connected() {
        return this.socket.connected;
    }
}

export class TradeServerTestHarness {
    private httpServer: http.Server | null = null;
    private serverAddress: AddressInfo | null = null;
    public tradeSystem: TradeServer | null = null;
    public clients: Record<string, AsyncSocket>;

    constructor(clientNames: string[]) {
        this.clients = {};

        beforeAll(() => {
            this.httpServer = http.createServer();
            this.serverAddress = this.httpServer
                .listen()
                .address() as AddressInfo;

            this.tradeSystem = new TradeServer(new Server(this.httpServer));
        });

        afterAll(() => {
            this.tradeSystem!.close();
            this.httpServer!.close();
        });

        clientNames.forEach((name) => {
            beforeEach((done) => {
                const client = this.newSocket();

                client.on("connect", async () => {
                    await client.emit("authenticate", name);
                    done();
                });

                this.clients[name] = client;
            });

            afterEach(() => {
                if (this.clients[name].connected) {
                    this.clients[name].disconnect();
                }
            });
        });
    }

    public newSocket() {
        return new AsyncSocket(
            ioc(
                `http://[${this.serverAddress!.address}]:${this.serverAddress!.port}`,
                {
                    multiplex: false,
                },
            ),
        );
    }

    public withNewClient(
        newClientName: string,
        callback: (newClient: AsyncSocket) => Promise<void>,
    ) {
        const newClient = this.newSocket();

        newClient.on("connect", async () => {
            await newClient.emit("authenticate", newClientName);

            await callback(newClient);

            newClient.disconnect();
        });
    }

    public startTradeBetween(client1: string, client2: string) {
        return new Promise<void>((resolve) => {
            this.clients[client2].on("inviteReceived", async () => {
                await this.clients[client2]!.emit("acceptInvite", "test-user");
                resolve();
            });

            this.clients[client1].emit("sendInvite", client2);
        });
    }
}
