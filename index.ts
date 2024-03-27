import { Server } from "socket.io";
import { TradeSystem } from "./tradeSystem";

const io = new Server(3000, {
    cors: {
        // Any origin is allowed (for now)
        origin: "*",
    },
});

const system = new TradeSystem(io);
