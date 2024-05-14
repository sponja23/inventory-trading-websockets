export type Inventory = string[];

export type TradeInformation = {
    userId1: string;
    userId2: string;
    inventory1: Inventory;
    inventory2: Inventory;
};

export type UserId = string;

export type UserData = {
    // The user ID of the connected user
    userId?: UserId;
    // The current state of the user
    state: UserState;
    // The user ID to which an invite was sent (if any)
    inviteSentTo?: UserId;
    // The trade information for the current trade (if any)
    tradeInfo?: TradeInformation;
};

export enum UserState {
    noUserId,
    inLobby,
    sentInvite,
    inTrade,
    lockedIn,
}
