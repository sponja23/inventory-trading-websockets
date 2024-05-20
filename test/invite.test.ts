import { describe, test, expect } from "@jest/globals";
import { UserState } from "../src/types";

import { TradeServerTestHarness } from "./utils";

describe("Invite Tests", () => {
    const harness = new TradeServerTestHarness(["test-user", "other-user"]);

    // Sending invite tests
    test("After sending invite, user is in sentInvite state and invite is pending", (done) => {
        harness.clients[0]!.emit("sendInvite", "other-user", () => {
            expect(harness.tradeSystem!.getUserState("test-user")).toBe(
                UserState.sentInvite,
            );
            expect(
                harness.tradeSystem!.inviteManager.getPendingInvites(
                    "other-user",
                ),
            ).toContain("test-user");
            done();
        });
    });

    test("After sending invite, other user receives invite", (done) => {
        harness.clients[1]!.on("inviteReceived", (from) => {
            expect(from).toBe("test-user");
            done();
        });

        harness.clients[0]!.emit("sendInvite", "other-user", () => {});
    });

    // Cancelling invite tests
    test("After cancelling invite, user is in lobby and invite is removed", (done) => {
        harness.clients[0]!.emit("sendInvite", "other-user", () => {
            harness.clients[0]!.emit("cancelInvite", "other-user", () => {
                expect(harness.tradeSystem!.getUserState("test-user")).toBe(
                    UserState.inLobby,
                );
                expect(
                    harness.tradeSystem!.inviteManager.getPendingInvites(
                        "other-user",
                    ),
                ).not.toContain("test-user");
                done();
            });
        });
    });

    test("After cancelling invite, other user is notified", (done) => {
        harness.clients[1]!.on("inviteCancelled", (from) => {
            expect(from).toBe("test-user");
            expect(harness.tradeSystem!.getUserState("test-user")).toBe(
                UserState.inLobby,
            );
            done();
        });

        harness.clients[0]!.emit("sendInvite", "other-user", () => {
            harness.clients[0]!.emit("cancelInvite", "other-user", () => {});
        });
    });

    // Rejecting invite tests
    test("After rejecting invite, user is in lobby and invite is removed", (done) => {
        harness.clients[0]!.emit("sendInvite", "other-user", () => {
            harness.clients[1]!.emit("rejectInvite", "test-user", () => {
                expect(harness.tradeSystem!.getUserState("test-user")).toBe(
                    UserState.inLobby,
                );
                expect(
                    harness.tradeSystem!.inviteManager.getPendingInvites(
                        "other-user",
                    ),
                ).not.toContain("test-user");
                done();
            });
        });
    });

    test("After rejecting invite, other user is notified", (done) => {
        harness.clients[0]!.on("inviteRejected", (to) => {
            expect(to).toBe("other-user");

            expect(harness.tradeSystem!.getUserState("test-user")).toBe(
                UserState.inLobby,
            );

            done();
        });

        harness.clients[1]!.on("inviteReceived", () => {
            harness.clients[1]!.emit("rejectInvite", "test-user", () => {});
        });

        harness.clients[0]!.emit("sendInvite", "other-user", () => {});
    });
});
