import winston, { format } from "winston";
const { combine, timestamp, printf, colorize } = format;

require("dotenv").config();

// Define log levels with custom colors
const logLevels = {
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        debug: 4,
        trace: 5,
    },
    colors: {
        error: "red",
        warn: "yellow",
        info: "green",
        http: "cyan",
        debug: "blue",
        trace: "magenta",
    },
};

// Custom format for console output - SLF4J style
const consoleFormat = printf(
    ({ level, message, timestamp, module }) => {
        const moduleName = String(module || "app");

        // Remove color codes from level for proper padding calculation
        const cleanLevel = String(level).replace(
            /\u001b\[[0-9;]*m/g,
            ""
        );

        // Truncate module name if too long (like Spring Boot does)
        const maxModuleLength = 15;
        let displayModule = moduleName;
        if (moduleName.length > maxModuleLength) {
            displayModule =
                moduleName.substring(
                    0,
                    maxModuleLength - 3
                ) + "...";
        }

        // SLF4J style: timestamp [module] LEVEL - message
        const paddedModule =
            displayModule.padEnd(maxModuleLength);
        const paddedLevel = cleanLevel
            .toUpperCase()
            .padEnd(5);

        return `${timestamp} [${paddedModule}] ${paddedLevel} - ${message}`;
    }
);

// Determine log level from environment variable or default to info
const logLevel =
    process.env.LOG_LEVEL?.toLowerCase() || "info";

// Create the logger
const logger = winston.createLogger({
    levels: logLevels.levels,
    level: logLevel,
    format: combine(
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: "shinken-bot" },
    transports: [
        // Console transport with colors and alignment
        new winston.transports.Console({
            format: combine(
                consoleFormat,
                colorize({ all: true })
            ),
        }),
    ],
});

// Add colors to winston
winston.addColors(logLevels.colors);

// Helper function to create a logger for a specific module
export function getLogger(module: string) {
    return {
        error: (message: string, ...meta: any[]) =>
            logger.error(message, { module, ...meta }),
        warn: (message: string, ...meta: any[]) =>
            logger.warn(message, { module, ...meta }),
        info: (message: string, ...meta: any[]) =>
            logger.info(message, { module, ...meta }),
        http: (message: string, ...meta: any[]) =>
            logger.http
                ? logger.http(message, { module, ...meta })
                : logger.info(message, { module, ...meta }),
        debug: (message: string, ...meta: any[]) =>
            logger.debug(message, { module, ...meta }),
        trace: (message: string, ...meta: any[]) =>
            logger.isLevelEnabled("trace")
                ? (logger as any).trace(message, {
                      module,
                      ...meta,
                  })
                : logger.debug(message, {
                      module,
                      ...meta,
                  }),
    };
}

export default logger;
