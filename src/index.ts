import { Server } from "socket.io";
import { TradeServer, TradeServerConfig } from "./tradeServer";
import "dotenv/config";

import logger from "./logger";

logger.info(`Starting server on port ${process.env.PORT}`);

const io = new Server(parseInt(process.env.PORT as string), {
    cors: {
        // Any origin is allowed (for now)
        origin: "*",
    },
});

const env = process.env.NODE_ENV || "development";
const isDevelopment = env === "development";

const config: TradeServerConfig = {};

if (process.env.BACKEND_PUBLIC_KEY) {
    logger.info("Using backend public key from environment variable");

    config.backendPublicKey = process.env.BACKEND_PUBLIC_KEY as string;
} else {
    logger.warn(
        "No backend public key provided, user authentication will be disabled",
    );

    if (!isDevelopment)
        throw new Error("Missing BACKEND_PUBLIC_KEY environment variable");
}
if (process.env.PRIVATE_KEY) {
    logger.info("Using private key from environment variable");

    config.privateKey = process.env.PRIVATE_KEY as string;
} else {
    logger.warn("No private key provided, performing trades will be disabled");

    if (!isDevelopment)
        throw new Error("Missing PRIVATE_KEY environment variable");
}
if (process.env.PERFORM_TRADE_ENDPOINT) {
    logger.info("Reading perform trade endpoint from environment variable");

    config.performTradeEndpoint = process.env.PERFORM_TRADE_ENDPOINT as string;
} else {
    logger.warn(
        "No perform trade endpoint provided, performing trades will be disabled",
    );

    if (!isDevelopment)
        throw new Error("Missing PERFORM_TRADE_ENDPOINT environment variable");
}

if (
    !config.backendPublicKey &&
    config.privateKey &&
    config.performTradeEndpoint
) {
    logger.error(
        "Trade endpoint and private key provided, but user authentication is disabled",
    );

    throw new Error(
        "Invalid configuration: user authentication must be enabled if trades are to be performed",
    );
}

new TradeServer(config, io);
