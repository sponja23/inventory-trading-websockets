import { describe, beforeAll, afterAll, test, expect } from "@jest/globals";
import { TradeSystem } from "../tradeSystem";

import { Server } from "socket.io";
import ioc, { Socket } from "socket.io-client";

describe("Invite System Tests", () => {
    let tradeSystem: TradeSystem;
    let client1: Socket;
    let client2: Socket;

    beforeAll((done) => {
        // Create a new server
        tradeSystem = new TradeSystem(
            new Server(3000, {
                cors: {
                    // Any origin is allowed (for now)
                    origin: "*",
                },
            }),
        );

        // Start clients and
        client1 = ioc("http://localhost:3000", { multiplex: false });
        client2 = ioc("http://localhost:3000", { multiplex: false });

        // TODO: Connect and authenticate the clients before proceeding
    });

    afterAll(() => {
        client1.close();
        client2.close();
    });
});
