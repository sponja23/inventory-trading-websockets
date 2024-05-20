import { UserState } from "./types";

/**
 * The response to a socket request that resulted in an error.
 *
 * This response is meant to be sent to the client.
 */
export type SocketErrorResponse = {
    errorName: string;
    errorMessage: string;
};

/**
 * An error that is caused by the user's actions.
 *
 * This type of error is reported to the user.
 *
 * @param message - The error message
 * @param name - The name of the error
 */
export class UserError extends Error {
    constructor(
        message: string,
        public name: string = "ServerError",
    ) {
        super(`${name}: ${message}`);
    }

    /**
     * Converts the error to a response that can be sent to the client.
     * @returns
     */
    toResponse(): SocketErrorResponse {
        return {
            errorName: this.name,
            errorMessage: this.message,
        };
    }
}

/**
 * An error resulting from the user performing an invalid action for their current state.
 */
export class InvalidActionError extends UserError {
    constructor(
        public action: string,
        public state: UserState,
    ) {
        super(`${action} for state ${state} is invalid`, "InvalidActionError");
    }
}

/**
 * An internal error that is caused by the server malfunctioning.
 */
export class InternalError extends Error {
    constructor(message: string) {
        super(`InternalError: ${message}`);
    }
}
