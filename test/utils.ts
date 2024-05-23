import http from "http";
import { Server } from "socket.io";
import ioc, { Socket } from "socket.io-client";
import { AddressInfo } from "net";
import { TradeServer } from "../src/tradeServer";
import { afterAll, afterEach, beforeAll, beforeEach } from "@jest/globals";

export class TradeServerTestHarness {
    private httpServer: http.Server | null = null;
    private serverAddress: AddressInfo | null = null;
    public tradeSystem: TradeServer | null = null;
    public clients: (Socket | null)[] = [];

    constructor(clientNames: string[]) {
        this.clients = new Array(clientNames.length).fill(null);

        beforeAll((done) => {
            this.httpServer = http.createServer();
            this.serverAddress = this.httpServer
                .listen()
                .address() as AddressInfo;

            this.tradeSystem = new TradeServer(new Server(this.httpServer));

            done();
        });

        afterAll((done) => {
            this.tradeSystem!.close();
            this.httpServer!.close();

            done();
        });

        clientNames.forEach((name, i) => {
            beforeEach((done) => {
                const client = this.newSocket();

                client.on("connect", () => {
                    client.emit("authenticate", name, () => {
                        done();
                    });
                });

                this.clients[i] = client;
            });

            afterEach((done) => {
                if (this.clients[i]!.connected) {
                    this.clients[i]!.disconnect();
                }

                done();
            });
        });
    }

    public newSocket() {
        return ioc(
            `http://[${this.serverAddress!.address}]:${this.serverAddress!.port}`,
            {
                multiplex: false,
            },
        );
    }

    public withNewClient(
        newClientName: string,
        callback: (newClient: Socket, done: () => void) => void,
    ) {
        const newClient = this.newSocket();

        newClient.on("connect", () => {
            newClient.emit("authenticate", newClientName, () => {
                callback(newClient, () => {
                    if (newClient.connected) newClient.disconnect();
                });
            });
        });
    }
}
