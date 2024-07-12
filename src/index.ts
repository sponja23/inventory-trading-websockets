import { Server } from "socket.io";
import { TradeServer } from "./tradeServer";
import "dotenv/config";

console.log(`Starting server on port ${process.env.PORT}`);

const io = new Server(parseInt(process.env.PORT as string), {
    cors: {
        // Any origin is allowed (for now)
        origin: "*",
    },
});

new TradeServer(io);
