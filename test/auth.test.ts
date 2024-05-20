import { describe, test, expect } from "@jest/globals";
import { UserState } from "../src/types";
import { TradeServerTestHarness } from "./utils";

describe("Authentication Tests", () => {
    const harness = new TradeServerTestHarness(["test-user"]);

    test("Authenticated user is in lobby", () => {
        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.inLobby,
        );
    });
});
