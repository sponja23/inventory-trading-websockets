import { UserError } from "./errors";
import jwt from "jsonwebtoken";

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
            throw new AuthError(token);
        }

        return decoded.id as string;
    } catch (e) {
        throw new AuthError(token);
    }
}
