import { describe, test, expect } from "@jest/globals";
import { UserState } from "../src/types";

import { TradeServerTestHarness } from "./utils";
import { SocketErrorResponse } from "../src/errors";

describe("Invite Tests", () => {
    const harness = new TradeServerTestHarness([
        "test-user",
        "other-user",
        "other-user-2",
    ]);

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

    // Accepting invite tests
    test("After accepting invite, both users are in trade", (done) => {
        harness.clients[0]!.emit("sendInvite", "other-user", () => {
            harness.clients[1]!.emit("acceptInvite", "test-user", () => {
                expect(harness.tradeSystem!.getUserState("test-user")).toBe(
                    UserState.inTrade,
                );
                expect(harness.tradeSystem!.getUserState("other-user")).toBe(
                    UserState.inTrade,
                );
                done();
            });
        });
    });

    // More complex tests

    // After cancelling invite, another invite can be sent
    test("After cancelling invite, another invite can be sent", (done) => {
        harness.clients[0]!.emit("sendInvite", "other-user", () => {
            harness.clients[0]!.emit("cancelInvite", "other-user", () => {
                harness.clients[0]!.emit("sendInvite", "other-user", () => {
                    expect(
                        harness.tradeSystem!.inviteManager.getPendingInvites(
                            "other-user",
                        ),
                    ).toContain("test-user");
                    done();
                });
            });
        });
    });

    // After invite rejected, another invite can be sent
    test("After rejecting invite, another invite can be sent", (done) => {
        harness.clients[0]!.emit("sendInvite", "other-user", () => {
            harness.clients[1]!.emit("rejectInvite", "test-user", () => {
                harness.clients[0]!.emit("sendInvite", "other-user", () => {
                    expect(
                        harness.tradeSystem!.inviteManager.getPendingInvites(
                            "other-user",
                        ),
                    ).toContain("test-user");
                    done();
                });
            });
        });
    });

    // Multiple invites can be received
    test("Multiple invites can be received", (done) => {
        let receivedCount = 0;

        harness.clients[0]!.on("inviteReceived", () => {
            if (++receivedCount === 2) {
                done();
            }
        });

        harness.clients[1]!.emit("sendInvite", "test-user", () => {});
        harness.clients[2]!.emit("sendInvite", "test-user", () => {});
    });

    // Can't send multiple invites
    test("Can't send multiple invites", (done) => {
        harness.clients[0]!.emit("sendInvite", "other-user", () => {
            harness.clients[0]!.emit(
                "sendInvite",
                "other-user-2",
                (err: SocketErrorResponse) => {
                    expect(err.errorName).toEqual("InvalidActionError");
                    done();
                },
            );
        });
    });

    // Error handling

    // Can't send invite to self
    test("Can't send invite to self", (done) => {
        harness.clients[0]!.emit(
            "sendInvite",
            "test-user",
            (err: SocketErrorResponse) => {
                expect(err.errorName).toEqual("SelfInviteError");
                done();
            },
        );
    });

    // Can't cancel invite that doesn't exist
    test("Can't cancel invite that doesn't exist", (done) => {
        harness.clients[0]!.emit(
            "cancelInvite",
            "other-user",
            (err: SocketErrorResponse) => {
                expect(err.errorName).toEqual("InvalidActionError");
                done();
            },
        );
    });

    // Can't reject invite that doesn't exist
    test("Can't reject invite that doesn't exist", (done) => {
        harness.clients[0]!.emit(
            "rejectInvite",
            "other-user",
            (err: SocketErrorResponse) => {
                expect(err.errorName).toEqual("InvalidInviteError");
                done();
            },
        );
    });

    // Can't accept invite that doesn't exist
    test("Can't accept invite that doesn't exist", (done) => {
        harness.clients[0]!.emit(
            "acceptInvite",
            "other-user",
            (err: SocketErrorResponse) => {
                expect(err.errorName).toEqual("InvalidInviteError");
                done();
            },
        );
    });
});
