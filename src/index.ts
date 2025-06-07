import {
    ActivityType,
    Client,
    Collection,
    GatewayIntentBits,
} from "discord.js";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";
import adminRoutes from "./routes/adminRoutes";
import settingsInstance from "./services/settingsInstance";

// Load environment variables
dotenv.config();

// Command prefixes from settings
const PREFIXES =
    settingsInstance.getDiscordSettings().prefixes;

// Initialize Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Initialize Express for potential web interface
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "../public")));

// Setup routes
app.use("/admin", adminRoutes);

// Setup command collection
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(
        (file) =>
            file.endsWith(".js") || file.endsWith(".ts")
    );

// Load all commands
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
        // Also register command aliases if they exist
        if (command.data.aliases) {
            for (const alias of command.data.aliases) {
                client.commands.set(alias, command);
            }
        }
    } else {
        console.log(
            `[WARNING] Command at ${filePath} is missing required properties.`
        );
    }
}

client.once("ready", () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    // Use activity status from settings
    const discordSettings =
        settingsInstance.getDiscordSettings();
    client.user?.setActivity(
        discordSettings.activityStatus,
        {
            type: discordSettings.activityType as ActivityType,
        }
    );
});

// Function to normalize text for mobile compatibility
function normalizeText(text: string) {
    return (
        text
            .normalize("NFC")
            // Replace full-width characters with half-width
            .replace(/！/g, "!")
            .replace(/？/g, "?")
            .replace(/（/g, "(")
            .replace(/）/g, ")")
            // Remove invisible characters and extra spaces
            .replace(/[\u200B-\u200D\uFEFF]/g, "")
            .replace(/\s+/g, " ")
            .trim()
    );
}

// Function to check if message starts with any valid prefix
function getUsedPrefix(content: string) {
    const normalizedContent = normalizeText(content);

    for (const prefix of PREFIXES) {
        const normalizedPrefix = normalizeText(prefix);
        if (
            normalizedContent
                .toLowerCase()
                .startsWith(normalizedPrefix.toLowerCase())
        ) {
            return normalizedPrefix;
        }
    }
    return null;
}

// Handle message events
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Normalize the entire message content
    const normalizedContent = normalizeText(
        message.content
    );

    // Check if message starts with any valid prefix
    const usedPrefix = getUsedPrefix(normalizedContent);

    if (usedPrefix) {
        // Remove the prefix and get command arguments
        const argsString = normalizedContent
            .slice(usedPrefix.length)
            .trim();

        // Split arguments and normalize each one
        const args = argsString
            .split(/ +/)
            .map((arg) => normalizeText(arg))
            .filter((arg) => arg.length > 0);

        const commandName = args.shift()?.toLowerCase();

        if (!commandName) return;

        // Debug log for troubleshooting
        // console.log(
        //     `[DEBUG] Original: "${message.content}"`
        // );
        // console.log(
        //     `[DEBUG] Normalized: "${normalizedContent}"`
        // );
        // console.log(`[DEBUG] Command: "${commandName}"`);
        // console.log(`[DEBUG] Args: [${args.join(", ")}]`);

        const command = client.commands.get(commandName);
        if (!command) {
            // Try to find similar commands (fuzzy matching)
            const availableCommands = Array.from(
                client.commands.keys()
            );
            const similarCommand = availableCommands.find(
                (cmd) =>
                    cmd
                        .toLowerCase()
                        .includes(commandName) ||
                    commandName.includes(cmd.toLowerCase())
            );

            if (similarCommand) {
                await message.reply(
                    `Did you mean \`${usedPrefix}${similarCommand}\`?`
                );
                return;
            }

            await message.reply(
                `Command \`${commandName}\` not found. Type \`${usedPrefix}help\` for available commands.`
            );
            return;
        }

        try {
            await command.execute(message, args);
        } catch (error) {
            console.error(
                `Error executing ${commandName}:`,
                error
            );
            await message.reply(
                "There was an error executing that command."
            );
        }
    }
});

// Start the Express server
app.get("/", (req, res) => {
    res.send(
        "Shinken Japanese Learning Discord Bot is running!"
    );
});

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "alive",
        uptime: process.uptime(),
        botReady: client.isReady(),
        timestamp: new Date().toISOString(),
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(
        `Admin dashboard available at: http://localhost:${PORT}/admin`
    );
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Add custom types to Discord.js Client
declare module "discord.js" {
    export interface Client {
        commands: Collection<string, any>;
    }
}
