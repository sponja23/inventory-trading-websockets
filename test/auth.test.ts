import { describe, test, expect } from "@jest/globals";
import { UserState } from "../src/types";
import { TradeServerTestHarness } from "./utils";
import { SocketErrorResponse } from "../src/errors";
import { fail } from "assert";

describe("Authentication Tests", () => {
    const harness = new TradeServerTestHarness(["test-user"]);

    test("Authenticated user is in lobby", () => {
        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.inLobby,
        );
    });

    test("User can't authenticate twice", async () => {
        try {
            await harness.authenticateClient("test-user");
            fail("Expected error to be thrown");
        } catch (err) {
            expect((err as SocketErrorResponse).errorName).toBe(
                "InvalidActionError",
            );
        }
    });

    test("Authenticated user can log out", async () => {
        await harness.clients["test-user"].emit("logOut");
        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.noUserId,
        );
    });

    test("Logged out user can authenticate again", async () => {
        await harness.clients["test-user"].emit("logOut");
        await harness.authenticateClient("test-user");

        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.inLobby,
        );
    });
});
