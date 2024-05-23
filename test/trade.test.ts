import { beforeEach, describe, expect, test } from "@jest/globals";
import { TradeServerTestHarness } from "./utils";
import { UserState } from "../src/types";
import { SocketErrorResponse } from "../src/errors";
import { fail } from "assert";

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
            .then(async () => {
                await harness.clients["other-user"].emit("updateInventory", [
                    "B",
                ]);

                await harness.clients["test-user"].emit("lockIn", ["A"], ["B"]);
            });
    });

    test("Inventory in lock in can be in any order", async () => {
        await harness.clients["test-user"].emit("updateInventory", [
            "A",
            "B",
            "B",
        ]);
        await harness.clients["other-user"].emit("updateInventory", [
            "B",
            "B",
            "C",
        ]);
        await harness.clients["test-user"].emit(
            "lockIn",
            ["B", "A", "B"],
            ["C", "B", "B"],
        );

        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.lockedIn,
        );
    });

    // Unlock
    test("User can unlock their inventory", async () => {
        await harness.clients["test-user"].emit("updateInventory", ["A"]);
        await harness.clients["other-user"].emit("updateInventory", ["B"]);
        await harness.clients["test-user"].emit("lockIn", ["A"], ["B"]);
        await harness.clients["test-user"].emit("unlock");

        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.inTrade,
        );
    });

    test("Other user is notified of unlock", (done) => {
        harness.clients["other-user"].on("unlocked", async () => done());

        harness.clients["test-user"]
            .emit("updateInventory", ["A"])
            .then(async () => {
                await harness.clients["other-user"].emit("updateInventory", [
                    "B",
                ]);

                await harness.clients["test-user"].emit("lockIn", ["A"], ["B"]);

                await harness.clients["test-user"].emit("unlock");
            });
    });

    test("User is unlocked when other user changes inventory", async () => {
        await harness.clients["test-user"].emit("updateInventory", ["A"]);
        await harness.clients["other-user"].emit("updateInventory", ["B"]);
        await harness.clients["test-user"].emit("lockIn", ["A"], ["B"]);
        await harness.clients["other-user"].emit("updateInventory", ["C"]);

        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.inTrade,
        );
    });

    // Cancel
    test("User can cancel a trade", async () => {
        await harness.clients["test-user"].emit("cancelTrade");

        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.inLobby,
        );
    });

    test("Other user is notified of trade cancellation", (done) => {
        harness.clients["other-user"].on("tradeCancelled", async () => done());

        harness.clients["test-user"].emit("cancelTrade");
    });

    // Complete
    test("User can complete a trade", async () => {
        await harness.clients["test-user"].emit("updateInventory", ["A"]);
        await harness.clients["other-user"].emit("updateInventory", ["B"]);
        await harness.clients["test-user"].emit("lockIn", ["A"], ["B"]);
        await harness.clients["other-user"].emit("lockIn", ["B"], ["A"]);
        await harness.clients["test-user"].emit("completeTrade");
        await harness.clients["other-user"].emit("completeTrade");

        expect(harness.tradeSystem!.getUserState("test-user")).toBe(
            UserState.inLobby,
        );
    });

    test("Other user is notified of trade completion", (done) => {
        harness.clients["other-user"].on("tradeCompleted", async () => done());

        harness.clients["test-user"]
            .emit("updateInventory", ["A"])
            .then(async () => {
                await harness.clients["other-user"].emit("updateInventory", [
                    "B",
                ]);

                await harness.clients["test-user"].emit("lockIn", ["A"], ["B"]);

                await harness.clients["other-user"].emit(
                    "lockIn",
                    ["B"],
                    ["A"],
                );

                await harness.clients["test-user"].emit("completeTrade");

                await harness.clients["other-user"].emit("completeTrade");
            });
    });

    // Error Handling
    test("User can't lock in with incorrect inventories", async () => {
        await harness.clients["test-user"].emit("updateInventory", ["A"]);
        await harness.clients["other-user"].emit("updateInventory", ["B"]);

        try {
            await harness.clients["test-user"].emit("lockIn", ["C"], ["D"]);
            fail("Expected error to be thrown");
        } catch (err) {
            expect((err as SocketErrorResponse).errorName).toBe(
                "InventoryMismatchError",
            );
        }
    });

    test("User can't complete trade if they are not locked in", async () => {
        await harness.clients["test-user"].emit("updateInventory", ["A"]);
        await harness.clients["other-user"].emit("updateInventory", ["B"]);
        await harness.clients["test-user"].emit("lockIn", ["A"], ["B"]);
        await harness.clients["other-user"].emit("lockIn", ["B"], ["A"]);
        await harness.clients["test-user"].emit("unlock");

        try {
            await harness.clients["test-user"].emit("completeTrade");
            fail("Expected error to be thrown");
        } catch (err) {
            expect((err as SocketErrorResponse).errorName).toBe(
                "InvalidActionError",
            );
        }
    });

    test("User can't complete trade if other is not locked in", async () => {
        await harness.clients["test-user"].emit("updateInventory", ["A"]);
        await harness.clients["other-user"].emit("updateInventory", ["B"]);
        await harness.clients["test-user"].emit("lockIn", ["A"], ["B"]);

        try {
            await harness.clients["test-user"].emit("completeTrade");
            fail("Expected error to be thrown");
        } catch (err) {
            expect((err as SocketErrorResponse).errorName).toBe(
                "CantCompleteEitherUnlockedError",
            );
        }
    });
});
