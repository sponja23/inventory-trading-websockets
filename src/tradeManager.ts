/* eslint-disable @typescript-eslint/no-unused-vars */
import { InternalError, UserError } from "./errors";
import { Inventory, UserId } from "./types";

// TODO: Mutual exclusion of trade operations

export type UserTradeInfo = {
    userId: UserId;
    inventory: Inventory;
    lockedIn: boolean;
    accepted: boolean;
};

export type TradeInfo = [UserTradeInfo, UserTradeInfo];

export class InventoryMistmatchError extends UserError {
    constructor(
        public expectedInventory: Inventory,
        public actualInventory: Inventory,
    ) {
        super("Inventory does not match", "InventoryMismatchError");
    }
}

export class CantCompleteEitherUnlockedError extends UserError {
    constructor() {
        super(
            "Cannot complete trade if either user is unlocked",
            "CantCompleteEitherUnlockedError",
        );
    }
}

/**
 * Compare 2 inventories for equality.
 */
export function inventoriesEqual(inventory1: Inventory, inventory2: Inventory) {
    if (inventory1.length != inventory2.length) {
        return false;
    }

    const sortedInventory1 = inventory1.slice().sort();
    const sortedInventory2 = inventory2.slice().sort();

    for (let i = 0; i < inventory1.length; i++) {
        if (inventory1[i] != inventory2[i]) {
            return false;
        }
    }

    return true;
}

export class TradeManager {
    /**
     * Map from user IDs to their trade info.
     *
     * When two users are in a trade, they will both have an entry in this map
     * pointing to the same TradeInfo object.
     */
    trades: Map<UserId, TradeInfo>;

    readonly onStart: (user1: UserId, user2: UserId) => void;
    readonly onUpdate: (userId: UserId, otherUserInventory: Inventory) => void;
    readonly onLockIn: (
        userId: UserId,
        selfInventory: Inventory,
        otherInventory: Inventory,
    ) => void;
    readonly onUnlock: (userId: UserId) => void;
    readonly onCancel: (userId: UserId) => void;
    readonly onComplete: (tradeInfo: TradeInfo) => void;

    constructor(
        onStart: (user1: UserId, user2: UserId) => void,
        onUpdate: (userId: UserId, otherUserInventory: Inventory) => void,
        onLockIn: (
            userId: UserId,
            selfInventory: Inventory,
            otherInventory: Inventory,
        ) => void,
        onUnlock: (userId: UserId) => void,
        onCancel: (userId: UserId) => void,
        onComplete: (tradeInfo: TradeInfo) => void,
    ) {
        this.trades = new Map();

        this.onStart = onStart;
        this.onUpdate = onUpdate;
        this.onLockIn = onLockIn;
        this.onUnlock = onUnlock;
        this.onCancel = onCancel;
        this.onComplete = onComplete;
    }

    /**
     * Starts a trade between two users.
     *
     * @param user1 The ID of the first user.
     * @param user2 The ID of the second user.
     */
    startTrade(user1: UserId, user2: UserId) {
        const tradeInfo: TradeInfo = [
            { userId: user1, inventory: [], lockedIn: false, accepted: false },
            { userId: user2, inventory: [], lockedIn: false, accepted: false },
        ];

        this.trades.set(user1, tradeInfo);
        this.trades.set(user2, tradeInfo);

        this.onStart(user1, user2);
    }

    /**
     * Updates the inventory of a user in a trade.
     *
     * @param userId The ID of the user to update the inventory for.
     * @param inventory The new inventory for the user.
     */
    updateInventory(userId: UserId, inventory: Inventory) {
        const [selfInfo, { userId: otherId }] = this.getTradeInfo(userId);

        selfInfo.inventory = inventory;

        this.unlockBothUsersFromTradeOf(userId);

        this.onUpdate(otherId, inventory);
    }

    /**
     * Locks in a user's inventory in a trade.
     *
     * @param userId The ID of the user to lock in the inventory for.
     */
    lockIn(
        userId: UserId,
        selfInventory: Inventory,
        otherInventory: Inventory,
    ) {
        const [selfInfo, otherInfo] = this.getTradeInfo(userId);

        if (!inventoriesEqual(selfInfo.inventory, selfInventory)) {
            throw new InventoryMistmatchError(
                selfInfo.inventory,
                selfInventory,
            );
        }

        if (!inventoriesEqual(otherInfo.inventory, otherInventory)) {
            throw new InventoryMistmatchError(
                otherInfo.inventory,
                otherInventory,
            );
        }

        selfInfo.lockedIn = true;

        this.onLockIn(otherInfo.userId, selfInventory, otherInventory);
    }

    /**
     * Unlocks a user from a trade.
     *
     * @param userId The ID of the user to unlock from the trade.
     */
    unlock(userId: UserId) {
        const [selfInfo, { userId: otherId }] = this.getTradeInfo(userId);

        selfInfo.lockedIn = false;

        this.onUnlock(otherId);
    }

    /**
     * Cancels a trade for a user.
     *
     * @param userId The ID of the user to cancel the trade for.
     */
    cancelTrade(userId: UserId) {
        const [_, { userId: otherId }] = this.getTradeInfo(userId);

        this.trades.delete(userId);
        this.trades.delete(otherId);

        this.onCancel(otherId);
    }

    /**
     * Completes a trade for a user.
     *
     * @param userId The ID of the user to complete the trade for.
     */
    completeTrade(userId: UserId) {
        const [selfInfo, otherInfo] = this.getTradeInfo(userId);

        if (!selfInfo.lockedIn || !otherInfo.lockedIn) {
            throw new CantCompleteEitherUnlockedError();
        }

        selfInfo.accepted = true;

        if (otherInfo.accepted) {
            this.trades.delete(userId);
            this.trades.delete(otherInfo.userId);

            this.onComplete([selfInfo, otherInfo]);
        }
    }

    /**
     * Get trade info for a user.
     *
     * Returns an array of two UserTradeInfo objects.
     * - The first object is the user's trade info.
     * - The second object is the other user's trade info.
     *
     * @param userId The ID of the user to get trade info for.
     */
    private getTradeInfo(userId: UserId) {
        if (!this.trades.has(userId)) {
            throw new InternalError(`User ${userId} is not in a trade`);
        }

        const [info1, info2] = this.trades.get(userId)!;

        if (info1.userId === userId) {
            return [info1, info2];
        } else {
            return [info2, info1];
        }
    }

    /**
     * Unlocks both users from a trade.
     *
     * @param userId The ID of one of the participating users.
     */
    private unlockBothUsersFromTradeOf(userId: UserId) {
        const [selfInfo, otherInfo] = this.getTradeInfo(userId);

        if (selfInfo.lockedIn) {
            selfInfo.lockedIn = false;
            this.onUnlock(otherInfo.userId);
        }

        if (otherInfo.lockedIn) {
            otherInfo.lockedIn = false;
            this.onUnlock(userId);
        }
    }

    /**
     * Return the trade partner of a user.
     *
     * @param userId The ID of the user to get the trade partner for.
     */
    getTradePartner(userId: UserId) {
        const [_, { userId: otherId }] = this.getTradeInfo(userId);

        return otherId;
    }

    // Accessors for testing

    getTradeInventory(userId: UserId) {
        return this.getTradeInfo(userId)[0].inventory;
    }
}
