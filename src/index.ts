import { Server } from "socket.io";
import { TradeServer } from "./tradeSystem";

const io = new Server(3000, {
    cors: {
        // Any origin is allowed (for now)
        origin: "*",
    },
});

const system = new TradeServer(io);
