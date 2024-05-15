export type Inventory = string[];

export type UserId = string;

export type UserData = {
    // The user ID of the connected user
    userId?: UserId;
    // The current state of the user
    state: UserState;
};

export enum UserState {
    noUserId,
    inLobby,
    sentInvite,
    inTrade,
    lockedIn,
}
