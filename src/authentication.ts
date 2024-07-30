import { UserError } from "./errors";
import jwt from "jsonwebtoken";
import logger from "./logger";

export class AuthError extends UserError {
    constructor(token: string) {
        super(`Invalid auth token: ${token}`, "AuthError");
    }
}

export function verifyToken(token: string, publicKey: string) {
    try {
        const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] });

        if (
            !(
                typeof decoded === "object" &&
                "id" in decoded &&
                typeof decoded.id === "string"
            )
        ) {
            logger.error(`Invalid token payload: ${JSON.stringify(decoded)}`);

            throw new AuthError(token);
        }

        return decoded.id as string;
    } catch (e) {
        logger.error(`Failed to verify token: ${e}`);

        throw new AuthError(token);
    }
}
