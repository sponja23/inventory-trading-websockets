/* eslint-disable @typescript-eslint/no-unused-vars */
import { InternalError, UserError } from "./errors";
import { Inventory, UserId } from "./types";

type UserTradeInfo = {
    userId: UserId;
    inventory: Inventory;
    lockedIn: boolean;
};

type TradeInfo = [UserTradeInfo, UserTradeInfo];

export class InventoryMistmatchError extends UserError {
    constructor(
        public expectedInventory: Inventory,
        public actualInventory: Inventory,
    ) {
        super("Inventory does not match", "InventoryMismatchError");
    }
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
    readonly onLockIn: (userId: UserId) => void;
    readonly onUnlock: (userId: UserId) => void;
    readonly onComplete: (userId: UserId) => void;
    readonly onCancel: (userId: UserId) => void;

    constructor(
        onStart: (user1: UserId, user2: UserId) => void,
        onUpdate: (userId: UserId, otherUserInventory: Inventory) => void,
        onLockIn: (userId: UserId) => void,
        onUnlock: (userId: UserId) => void,
        onComplete: (userId: UserId) => void,
        onCancel: (userId: UserId) => void,
    ) {
        this.trades = new Map();

        this.onStart = onStart;
        this.onUpdate = onUpdate;
        this.onLockIn = onLockIn;
        this.onUnlock = onUnlock;
        this.onComplete = onComplete;
        this.onCancel = onCancel;
    }

    /**
     * Starts a trade between two users.
     *
     * @param user1 The ID of the first user.
     * @param user2 The ID of the second user.
     */
    startTrade(user1: UserId, user2: UserId) {
        const tradeInfo: TradeInfo = [
            { userId: user1, inventory: [], lockedIn: false },
            { userId: user2, inventory: [], lockedIn: false },
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
        const [selfInfo, _] = this.getTradeInfo(userId);

        selfInfo.inventory = inventory;

        this.onUpdate(userId, inventory);
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

        if (selfInventory != selfInfo.inventory) {
            throw new InventoryMistmatchError(
                selfInfo.inventory,
                selfInventory,
            );
        }

        if (otherInventory != otherInfo.inventory) {
            throw new InventoryMistmatchError(
                otherInfo.inventory,
                otherInventory,
            );
        }

        selfInfo.lockedIn = true;

        // TODO
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
}
