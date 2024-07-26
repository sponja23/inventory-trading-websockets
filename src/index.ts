import { Server } from "socket.io";
import { TradeServer, TradeServerConfig } from "./tradeServer";
import "dotenv/config";

console.log(`Starting server on port ${process.env.PORT}`);

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
    if (!isDevelopment)
        throw new Error("Missing BACKEND_PUBLIC_KEY environment variable");

    config.backendPublicKey = process.env.BACKEND_PUBLIC_KEY as string;
}

if (process.env.PRIVATE_KEY) {
    if (!isDevelopment)
        throw new Error("Missing PRIVATE_KEY environment variable");

    config.privateKey = process.env.PRIVATE_KEY as string;
}

if (process.env.PERFORM_TRADE_ENDPOINT) {
    if (!isDevelopment)
        throw new Error("Missing PERFORM_TRADE_ENDPOINT environment variable");

    config.performTradeEndpoint = process.env.PERFORM_TRADE_ENDPOINT as string;
}

new TradeServer(config, io);
