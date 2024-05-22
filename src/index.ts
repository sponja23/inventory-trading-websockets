import { Server } from "socket.io";
import { TradeServer } from "./tradeServer";

const io = new Server(9000, {
    cors: {
        // Any origin is allowed (for now)
        origin: "*",
    },
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const system = new TradeServer(io);
