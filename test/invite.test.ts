import { describe, test, expect } from "@jest/globals";
import { UserState } from "../src/types";

import { TradeServerTestHarness } from "./utils";
import { SocketErrorResponse } from "../src/errors";
import { fail } from "assert";

describe("Invite Tests", () => {
    const harness = new TradeServerTestHarness([
        "test-user",
        "other-user",
        "other-user-2",
    ]);

    // Sending invite tests
    test("After sending invite, user is in sentInvite state and invite is pending", async () => {
        await harness.clients["test-user"].emit("sendInvite", "other-user");

        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.sentInvite,
        );
        expect(harness.tradeSystem!.getSentInvite("test-user")).toBe(
            "other-user",
        );
        expect(harness.tradeSystem!.getPendingInvites("other-user")).toContain(
            "test-user",
        );
    });

    test("After sending invite, other user receives invite", (done) => {
        harness.clients["other-user"].on("inviteReceived", async (from) => {
            expect(from).toBe("test-user");
            done();
        });

        harness.clients["test-user"].emit("sendInvite", "other-user");
    });

    // Cancelling invite tests
    test("After cancelling invite, user is in lobby and invite is removed", async () => {
        await harness.clients["test-user"].emit("sendInvite", "other-user");
        await harness.clients["test-user"].emit("cancelInvite", "other-user");

        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.inLobby,
        );
        expect(
            harness.tradeSystem!.getPendingInvites("other-user"),
        ).not.toContain("test-user");
    });

    test("After cancelling invite, other user is notified", (done) => {
        harness.clients["other-user"].on("inviteCancelled", async (from) => {
            expect(from).toBe("test-user");
            done();
        });

        harness.clients["test-user"]
            .emit("sendInvite", "other-user")
            .then(() =>
                harness.clients["test-user"].emit("cancelInvite", "other-user"),
            );
    });

    // Rejecting invite tests
    test("After rejecting invite, user is in lobby and invite is removed", async () => {
        await harness.clients["test-user"].emit("sendInvite", "other-user");
        await harness.clients["other-user"].emit("rejectInvite", "test-user");

        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.inLobby,
        );

        expect(
            harness.tradeSystem!.getPendingInvites("other-user"),
        ).not.toContain("test-user");
    });

    test("After rejecting invite, other user is notified", (done) => {
        harness.clients["test-user"].on("inviteRejected", async (to) => {
            expect(to).toBe("other-user");

            expect(harness.tradeSystem!.getUserState("test-user")).toBe(
                UserState.inLobby,
            );

            done();
        });

        harness.clients["other-user"].on("inviteReceived", async () => {
            harness.clients["other-user"].emit("rejectInvite", "test-user");
        });

        harness.clients["test-user"].emit("sendInvite", "other-user");
    });

    // Accepting invite tests
    test("After accepting invite, both users are in trade", async () => {
        await harness.clients["test-user"].emit("sendInvite", "other-user");
        await harness.clients["other-user"].emit("acceptInvite", "test-user");

        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.inTrade,
        );

        expect(harness.tradeSystem!.getUserState("other-user")).toBe(
            UserState.inTrade,
        );
    });

    // More complex tests

    // After cancelling invite, another invite can be sent
    test("After cancelling invite, another invite can be sent", async () => {
        await harness.clients["test-user"].emit("sendInvite", "other-user");
        await harness.clients["test-user"].emit("cancelInvite", "other-user");
        await harness.clients["test-user"].emit("sendInvite", "other-user");

        expect(harness.tradeSystem!.getPendingInvites("other-user")).toContain(
            "test-user",
        );
    });

    // After invite rejected, another invite can be sent
    test("After rejecting invite, another invite can be sent", async () => {
        await harness.clients["test-user"].emit("sendInvite", "other-user");
        await harness.clients["other-user"].emit("rejectInvite", "test-user");
        await harness.clients["test-user"].emit("sendInvite", "other-user");

        expect(harness.tradeSystem!.getPendingInvites("other-user")).toContain(
            "test-user",
        );
    });

    // Multiple invites can be received
    test("Multiple invites can be received", (done) => {
        let receivedCount = 0;

        harness.clients["test-user"].on("inviteReceived", async () => {
            if (++receivedCount === 2) {
                done();
            }
        });

        harness.clients["other-user"].emit("sendInvite", "test-user");
        harness.clients["other-user-2"].emit("sendInvite", "test-user");
    });

    // Can't send multiple invites
    test("Can't send multiple invites", async () => {
        await harness.clients["test-user"].emit("sendInvite", "other-user");

        try {
            await harness.clients["test-user"].emit(
                "sendInvite",
                "other-user-2",
            );
            fail("Expected error to be thrown");
        } catch (err: unknown) {
            expect((err as SocketErrorResponse).errorName).toEqual(
                "InvalidActionError",
            );
        }
    });

    // Disconnected users
    test("After disconnecting, invites sent are cancelled", (done) => {
        harness.clients["test-user"].on("inviteCancelled", async (from) => {
            expect(from).toBe("new-user");
            done();
        });

        harness.withNewClient("new-user", async (newClient) => {
            await newClient.emit("sendInvite", "test-user");
        });
    });

    test("After disconnecting, invites received are not rejected, and are re-sent when connecting", (done) => {
        harness.withNewClient("new-user", async (newClient) => {
            await harness.clients["test-user"].emit("sendInvite", "new-user");

            newClient.disconnect();

            // Create new socket to connect
            // This is because the inviteReceived event must be handled, and this will be sent immediately
            // after connecting

            const newClient2 = harness.newSocket();
            newClient2.on("inviteReceived", async (from) => {
                expect(from).toBe("test-user");
                newClient2.disconnect();
                done();
            });
            newClient2.on("connect", async () => {
                await harness.authenticateSocketWithName(
                    newClient2,
                    "new-user",
                );
            });
        });
    });

    // Error handling

    // Can't send invite to self
    test("Can't send invite to self", async () => {
        try {
            await harness.clients["test-user"].emit("sendInvite", "test-user");
            fail("Expected error to be thrown");
        } catch (err: unknown) {
            expect((err as SocketErrorResponse).errorName).toEqual(
                "SelfInviteError",
            );
        }
    });

    // Can't cancel invite that doesn't exist
    test("Can't cancel invite that doesn't exist", async () => {
        try {
            await harness.clients["test-user"].emit(
                "cancelInvite",
                "other-user",
            );
            fail("Expected error to be thrown");
        } catch (err: unknown) {
            expect((err as SocketErrorResponse).errorName).toEqual(
                "InvalidActionError",
            );
        }
    });

    // Can't reject invite that doesn't exist
    test("Can't reject invite that doesn't exist", async () => {
        try {
            await harness.clients["test-user"].emit(
                "rejectInvite",
                "other-user",
            );
            fail("Expected error to be thrown");
        } catch (err: unknown) {
            expect((err as SocketErrorResponse).errorName).toEqual(
                "InvalidInviteError",
            );
        }
    });

    // Can't accept invite that doesn't exist
    test("Can't accept invite that doesn't exist", async () => {
        try {
            await harness.clients["test-user"].emit(
                "acceptInvite",
                "other-user",
            );
            fail("Expected error to be thrown");
        } catch (err: unknown) {
            expect((err as SocketErrorResponse).errorName).toEqual(
                "InvalidInviteError",
            );
        }
    });
});
