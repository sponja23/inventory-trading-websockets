import {
    describe,
    beforeAll,
    afterAll,
    test,
    expect,
    beforeEach,
    afterEach,
} from "@jest/globals";
import { TradeServer } from "../src/tradeServer";
import { UserState } from "../src/types";

import http from "http";
import { Server } from "socket.io";
import ioc, { Socket } from "socket.io-client";
import { AddressInfo } from "net";

// Server setup

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

// Client setup

let client1: Socket;
let client2: Socket;

// Client 1 setup
beforeEach((done) => {
    client1 = ioc(`http://[${serverAddress.address}]:${serverAddress.port}`, {
        multiplex: false,
    });

    client1.on("connect", () => {
        client1.emit("authenticate", "test-user", () => {
            done();
        });
    });
});

afterEach((done) => {
    if (client1.connected) {
        client1.disconnect();
    }
    done();
});

// Client 2 setup
beforeEach((done) => {
    client2 = ioc(`http://[${serverAddress.address}]:${serverAddress.port}`, {
        multiplex: false,
    });

    client2.on("connect", () => {
        client2.emit("authenticate", "other-user", () => {
            done();
        });
    });
});

afterEach((done) => {
    if (client2.connected) {
        client2.disconnect();
    }
    done();
});

// Tests

describe("Invite Tests", () => {
    // Sending invite tests
    test("After sending invite, user is in sentInvite state and invite is pending", (done) => {
        client1.emit("sendInvite", "other-user", () => {
            expect(tradeSystem.getUserState("test-user")).toBe(
                UserState.sentInvite,
            );
            expect(
                tradeSystem.inviteManager.getPendingInvites("other-user"),
            ).toContain("test-user");
            done();
        });
    });

    test("After sending invite, other user receives invite", (done) => {
        client2.on("inviteReceived", (from) => {
            expect(from).toBe("test-user");
            done();
        });

        client1.emit("sendInvite", "other-user", () => {});
    });

    // Cancelling invite tests
    test("After cancelling invite, user is in lobby and invite is removed", (done) => {
        client1.emit("sendInvite", "other-user", () => {
            client1.emit("cancelInvite", "other-user", () => {
                expect(tradeSystem.getUserState("test-user")).toBe(
                    UserState.inLobby,
                );
                expect(
                    tradeSystem.inviteManager.getPendingInvites("other-user"),
                ).not.toContain("test-user");
                done();
            });
        });
    });

    test("After cancelling invite, other user is notified", (done) => {
        client2.on("inviteCancelled", (from) => {
            expect(from).toBe("test-user");
            expect(tradeSystem.getUserState("test-user")).toBe(
                UserState.inLobby,
            );
            done();
        });

        client1.emit("sendInvite", "other-user", () => {
            client1.emit("cancelInvite", "other-user", () => {});
        });
    });

    // Rejecting invite tests
    test("After rejecting invite, user is in lobby and invite is removed", (done) => {
        client1.emit("sendInvite", "other-user", () => {
            client2.emit("rejectInvite", "test-user", () => {
                expect(tradeSystem.getUserState("test-user")).toBe(
                    UserState.inLobby,
                );
                expect(
                    tradeSystem.inviteManager.getPendingInvites("other-user"),
                ).not.toContain("test-user");
                done();
            });
        });
    });

    test("After rejecting invite, other user is notified", (done) => {
        client1.on("inviteRejected", (to) => {
            expect(to).toBe("other-user");

            expect(tradeSystem.getUserState("test-user")).toBe(
                UserState.inLobby,
            );

            done();
        });

        client2.on("inviteReceived", () => {
            client2.emit("rejectInvite", "test-user", () => {});
        });

        client1.emit("sendInvite", "other-user", () => {});
    });
});
