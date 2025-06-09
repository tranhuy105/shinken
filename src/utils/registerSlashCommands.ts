import { Client, REST, Routes } from "discord.js";
import fs from "fs";
import path from "path";
import { getLogger } from "./logger";

const logger = getLogger("SlashCommandRegistration");

/**
 * Register all slash commands with Discord
 * @param client The Discord client
 */
export async function registerSlashCommands(
    client: Client
) {
    // Make sure the client is ready
    if (!client.isReady()) {
        logger.error(
            "Client is not ready. Cannot register slash commands."
        );
        return;
    }

    try {
        logger.info(
            "Starting slash command registration process"
        );

        // Get the client ID
        const clientId = client.user.id;
        if (!clientId) {
            logger.error("Could not get client ID");
            return;
        }

        // Get all slash command files
        const slashCommandsPath = path.join(
            __dirname,
            "../slashCommands"
        );
        if (!fs.existsSync(slashCommandsPath)) {
            logger.warn(
                "Slash commands directory not found"
            );
            return;
        }

        const commandFiles = fs
            .readdirSync(slashCommandsPath)
            .filter(
                (file) =>
                    file.endsWith(".js") ||
                    file.endsWith(".ts")
            );

        logger.info(
            `Found ${commandFiles.length} slash command files`
        );

        // Prepare commands for registration
        const commands = [];
        for (const file of commandFiles) {
            try {
                const filePath = path.join(
                    slashCommandsPath,
                    file
                );
                const command = require(filePath);

                // If the file has a data property, it's a valid command
                if (command.data) {
                    // Add the primary command
                    commands.push(command.data.toJSON());
                    logger.info(
                        `Added command: ${command.data.name}`
                    );
                }
            } catch (error) {
                logger.error(
                    `Error loading command from ${file}:`,
                    error
                );
            }
        }

        // Create REST instance for registering commands
        const rest = new REST({ version: "10" }).setToken(
            process.env.DISCORD_TOKEN!
        );

        // Register commands with Discord API
        logger.info(
            `Registering ${commands.length} slash commands`
        );

        try {
            logger.info(
                `Started refreshing ${commands.length} application (/) commands.`
            );

            // The put method is used to fully refresh all commands
            const data = (await rest.put(
                Routes.applicationCommands(client.user!.id),
                { body: commands }
            )) as any[];

            logger.info(
                `Successfully reloaded ${data.length} application (/) commands.`
            );
        } catch (error) {
            logger.error(
                "Error registering slash commands:",
                error
            );
        }
    } catch (error) {
        logger.error(
            "Error registering slash commands:",
            error
        );
    }
}

/**
 * Delete all slash commands
 * Useful for development/testing
 */
export async function deleteAllSlashCommands() {
    try {
        const token = process.env.DISCORD_TOKEN;
        const clientId = process.env.CLIENT_ID;

        if (!token || !clientId) {
            logger.error("Missing token or client ID");
            return;
        }

        const rest = new REST({ version: "10" }).setToken(
            token
        );

        logger.info("Deleting all slash commands...");

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: [] }
        );

        logger.info(
            "Successfully deleted all slash commands"
        );
    } catch (error) {
        logger.error(
            "Error deleting slash commands:",
            error
        );
    }
}
