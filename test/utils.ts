/* eslint-disable @typescript-eslint/no-explicit-any */
import http from "http";
import { Server } from "socket.io";
import ioc, { Socket } from "socket.io-client";
import { AddressInfo } from "net";
import { TradeServer } from "../src/tradeServer";
import { afterAll, afterEach, beforeAll, beforeEach } from "@jest/globals";
import { BackendServer, setupBackendServer } from "./backend";

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

/**
 * A test harness for the trade server.
 */
export class TradeServerTestHarness {
    private httpServer: http.Server | null = null;
    private serverAddress: AddressInfo | null = null;

    private backendServer: BackendServer | null = null;

    public tradeSystem: TradeServer | null = null;
    public clients: Record<string, AsyncSocket>;

    constructor(clientNames: string[]) {
        this.clients = {};

        beforeAll((done) => {
            this.httpServer = http.createServer();
            this.serverAddress = this.httpServer
                .listen()
                .address() as AddressInfo;

            const { server, backendPublicKey, tradingPrivateKey } =
                setupBackendServer();

            this.backendServer = server;

            const { address, port } = this.backendServer.address;

            this.tradeSystem = new TradeServer(
                {
                    backendPublicKey,
                    privateKey: tradingPrivateKey,
                    performTradeEndpoint: `http://[${address}]:${port}`,
                },
                new Server(this.httpServer!),
            );

            done();
        });

        afterAll(() => {
            this.tradeSystem!.close();
            this.backendServer!.close();
            this.httpServer!.close();
        });

        clientNames.forEach((name) => {
            beforeEach((done) => {
                const client = this.newSocket();

                client.on("connect", async () => {
                    await this.authenticateClient(name);
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
            await this.authenticateSocketWithName(newClient, newClientName);

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

    public async authenticateSocketWithName(socket: AsyncSocket, name: string) {
        await socket.emit(
            "authenticate",
            this.backendServer!.signAuthToken(name),
        );
    }

    public async authenticateClient(clientName: string) {
        return this.authenticateSocketWithName(
            this.clients[clientName],
            clientName,
        );
    }
}
