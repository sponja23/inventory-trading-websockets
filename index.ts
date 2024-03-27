import { Server } from "socket.io";

const io = new Server(3000, {
    cors: {
        // Any origin is allowed (for now)
        origin: "*",
    },
});

io.on("connection", (socket) => {
    console.log("a user connected");

    socket.on("disconnect", () => {
        console.log("user disconnected");
    });
});
