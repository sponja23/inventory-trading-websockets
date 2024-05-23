import { beforeEach, describe, expect, test } from "@jest/globals";
import { TradeServerTestHarness } from "./utils";
import { UserState } from "../src/types";

describe("Trade Tests", () => {
    const harness = new TradeServerTestHarness(["test-user", "other-user"]);

    beforeEach(async () => {
        await harness.startTradeBetween("test-user", "other-user");
    });

    // Inventory Update
    test("User can update their inventory", async () => {
        await harness.clients["test-user"].emit("updateInventory", ["A"]);

        expect(harness.tradeSystem!.getTradeInventory("test-user")).toEqual([
            "A",
        ]);
    });

    test("Other user is notified of inventory update", (done) => {
        harness.clients["other-user"].on(
            "inventoryUpdated",
            async (inventory) => {
                expect(inventory).toEqual(["A"]);
                done();
            },
        );

        harness.clients["test-user"].emit("updateInventory", ["A"]);
    });

    // Lock-in
    test("User can lock in their inventory", async () => {
        await harness.clients["test-user"].emit("updateInventory", ["A"]);
        await harness.clients["other-user"].emit("updateInventory", ["B"]);
        await harness.clients["test-user"].emit("lockIn", ["A"], ["B"]);

        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.lockedIn,
        );
    });

    test("Other user is notified of lock-in", (done) => {
        harness.clients["other-user"].on("lockedIn", async () => done());

        harness.clients["test-user"]
            .emit("updateInventory", ["A"])
            .then(() =>
                harness.clients["other-user"]
                    .emit("updateInventory", ["B"])
                    .then(() =>
                        harness.clients["test-user"].emit(
                            "lockIn",
                            ["A"],
                            ["B"],
                        ),
                    ),
            );
    });
});
