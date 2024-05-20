import { describe, test, expect } from "@jest/globals";
import { UserState } from "../src/types";
import { TradeServerTestHarness } from "./utils";
import { SocketErrorResponse } from "../src/errors";

describe("Authentication Tests", () => {
    const harness = new TradeServerTestHarness(["test-user"]);

    test("Authenticated user is in lobby", () => {
        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.inLobby,
        );
    });

    test("User can't authenticate twice", (done) => {
        harness.clients[0]!.emit(
            "authenticate",
            "test-user",
            (err: SocketErrorResponse) => {
                expect(err.errorName).toBe("InvalidActionError");
                done();
            },
        );
    });
});
