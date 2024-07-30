import winston from "winston";

const logger = winston.createLogger({
    level: "info",
    format: winston.format.json(),
    silent: process.env.NODE_ENV === "test",
    defaultMeta: { service: "user-service" },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.colorize(),
                winston.format.simple(),
                winston.format.printf(
                    (info) =>
                        `${info.timestamp} ${info.level}: ${info.message}`,
                ),
            ),
        }),
        new winston.transports.File({ filename: "error.log", level: "error" }),
        new winston.transports.File({ filename: "combined.log" }),
    ],
});

export default logger;
