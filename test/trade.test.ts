import {
    describe,
    beforeAll,
    afterAll,
    test,
    expect,
    beforeEach,
    afterEach,
} from "@jest/globals";
import { TradeServer } from "../src/tradeSystem";
import { UserState } from "../src/types";

import http from "http";
import { Server } from "socket.io";
import ioc, { Socket } from "socket.io-client";
import { AddressInfo } from "net";

let httpServer: http.Server;
let serverAddress: AddressInfo;
let tradeSystem: TradeServer;

beforeAll((done) => {
    httpServer = http.createServer();
    serverAddress = httpServer.listen().address() as AddressInfo;

    tradeSystem = new TradeServer(new Server(httpServer));

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

describe("Invite Tests", () => {
    test("After sending invite, user is in sentInvite state and invite is pending", (done) => {
        client.emit("sendInvite", "other-user", () => {
            expect(tradeSystem.getUserState("test-user")).toBe(
                UserState.sentInvite,
            );
            expect(
                tradeSystem.inviteManager.pendingInvites.get("other-user"),
            ).toContain("test-user");
            done();
        });
    });
});
