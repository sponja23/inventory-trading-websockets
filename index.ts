import { Server } from "socket.io";

const io = new Server(3000, {
    cors: {
        // Any origin is allowed (for now)
        origin: "*",
    },
});

const nameToSocket = new Map<string, string>();

io.on("connection", (socket) => {
    console.log("a user connected");

    socket.on("setName", (name: string) => {
        nameToSocket.set(name, socket.id);
    });
});
