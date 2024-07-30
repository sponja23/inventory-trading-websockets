import { generateKeyPairSync } from "crypto";
import http from "http";
import { AddressInfo } from "net";
import jwt from "jsonwebtoken";

/**
 * Generate a new RSA key pair.
 * @returns A promise that resolves with the public and private keys.
 */
function generateRSAKeyPair() {
    return generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: "spki",
            format: "pem",
        },
        privateKeyEncoding: {
            type: "pkcs8",
            format: "pem",
        },
    });
}

function generateKeys() {
    return {
        backend: generateRSAKeyPair(),
        trading: generateRSAKeyPair(),
    };
}

/**
 * A simple backend server that can be used to test the trade server.
 */
export class BackendServer {
    private server: http.Server;
    public address: AddressInfo;
    private privateKey: string;
    private tradingPublicKey: string;

    constructor(backendPrivatekey: string, tradingPublicKey: string) {
        this.server = http.createServer((req, res) => {
            if (!this.verifyToken(req.headers.authorization!)) {
                res.writeHead(401, { "Content-Type": "text/plain" });
                res.end("Unauthorized");
                return;
            }

            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("Trade successful");
        });
        this.address = this.server.listen().address() as AddressInfo;

        this.privateKey = backendPrivatekey;
        this.tradingPublicKey = tradingPublicKey;
    }

    public signAuthToken(userId: string) {
        return jwt.sign({ id: userId }, this.privateKey, {
            algorithm: "RS256",
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public verifyToken(token: string) {
        // TODO
        return true;
    }

    public close() {
        this.server.close();
    }
}

export type BackendServerInfo = {
    server: BackendServer;
    backendPublicKey: string;
    tradingPrivateKey: string;
};

export function setupBackendServer() {
    const {
        backend: { publicKey: backendPublicKey, privateKey: backendPrivateKey },
        trading: { publicKey: tradingPublicKey, privateKey: tradingPrivateKey },
    } = generateKeys();
    return {
        server: new BackendServer(backendPrivateKey, tradingPublicKey),
        backendPublicKey,
        tradingPrivateKey,
    };
}
