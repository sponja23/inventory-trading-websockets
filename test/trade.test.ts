import {
    describe,
    beforeAll,
    afterAll,
    test,
    expect,
    beforeEach,
    afterEach,
} from "@jest/globals";
import { TradeSystem, UserState } from "../tradeSystem";

import http from "http";
import { Server } from "socket.io";
import ioc, { Socket } from "socket.io-client";
import { AddressInfo } from "net";

let httpServer: http.Server;
let serverAddress: AddressInfo;
let tradeSystem: TradeSystem;

beforeAll((done) => {
    httpServer = http.createServer();
    serverAddress = httpServer.listen().address() as AddressInfo;

    tradeSystem = new TradeSystem(new Server(httpServer));

    done();
});

afterAll((done) => {
    tradeSystem.close();
    httpServer.close();

    done();
});

let client: Socket;

beforeEach((done) => {
    client = ioc(`http://[${serverAddress.address}]:${serverAddress.port}`, {
        multiplex: false,
    });

    client.on("connect", () => {
        client.emit("authenticate", "test-user", () => {
            done();
        });
    });
});

afterEach((done) => {
    // Cleanup
    if (client.connected) {
        client.disconnect();
    }
    done();
});

describe("Authentication Tests", () => {
    test("Authenticated user is in lobby", () => {
        expect(tradeSystem.getUserState("test-user")).toBe(UserState.inLobby);
    });
});
