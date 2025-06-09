import fs from "fs";
import path from "path";
import { getLogger } from "./logger";

const logger = getLogger("ConvertToSlashCommands");

/**
 * Utility to help convert traditional prefix commands to slash commands
 */
export async function convertPrefixCommandsToSlash() {
    const commandsDir = path.join(__dirname, "../commands");
    const slashCommandsDir = path.join(
        __dirname,
        "../slashCommands"
    );

    // Create slash commands directory if it doesn't exist
    if (!fs.existsSync(slashCommandsDir)) {
        fs.mkdirSync(slashCommandsDir, { recursive: true });
    }

    // Get all command files
    const commandFiles = fs
        .readdirSync(commandsDir)
        .filter(
            (file) =>
                file.endsWith(".js") || file.endsWith(".ts")
        );

    logger.info(
        `Found ${commandFiles.length} command files to convert`
    );

    // Process each command file
    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsDir, file);
            const command = require(filePath);

            // Skip if not a valid command
            if (
                !command.data ||
                !command.data.name ||
                !command.execute
            ) {
                logger.warn(
                    `Skipping ${file}: Missing required properties`
                );
                continue;
            }

            // Create slash command template
            const slashCommandTemplate =
                generateSlashCommandTemplate(command, file);

            // Write to new file
            const slashCommandPath = path.join(
                slashCommandsDir,
                file
            );

            // Don't overwrite existing files
            if (fs.existsSync(slashCommandPath)) {
                logger.warn(
                    `Skipping ${file}: Slash command already exists`
                );
                continue;
            }

            fs.writeFileSync(
                slashCommandPath,
                slashCommandTemplate
            );
            logger.info(
                `Created slash command template for ${file}`
            );
        } catch (error) {
            logger.error(
                `Error converting ${file}:`,
                error
            );
        }
    }

    logger.info(
        "Conversion process completed. Please review and modify the generated files as needed."
    );
}

/**
 * Generate a slash command template based on a prefix command
 */
function generateSlashCommandTemplate(
    command: any,
    fileName: string
): string {
    const commandName = command.data.name;
    const description =
        command.data.description ||
        "No description provided";

    return `import {
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("${commandName}")
    .setDescription("${description}");
    
// TODO: Add command options based on the prefix command parameters
// Example:
// .addStringOption(option =>
//     option.setName('parameter')
//         .setDescription('Description of parameter')
//         .setRequired(true))

/**
 * Execute the ${commandName} slash command
 * @param interaction The interaction object
 */
export async function execute(interaction: ChatInputCommandInteraction) {
    // TODO: Implement the slash command functionality
    // This is a template generated from the prefix command
    
    try {
        // Initial response
        await interaction.reply({
            content: "Processing ${commandName} command...",
            ephemeral: true
        });
        
        // TODO: Add your command implementation here
        // Note: You'll need to adapt the prefix command logic to work with interactions
        
        // Example response
        const responseEmbed = new EmbedBuilder()
            .setColor("#4ECDC4" as ColorResolvable)
            .setTitle("${commandName} Command")
            .setDescription("This is a template response. Please implement the actual command logic.")
            .setTimestamp();
            
        await interaction.editReply({
            content: null,
            embeds: [responseEmbed]
        });
        
    } catch (error) {
        console.error(\`Error executing ${commandName} command:\`, error);
        
        // Handle errors
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: "There was an error executing this command." });
        } else {
            await interaction.reply({ content: "There was an error executing this command.", ephemeral: true });
        }
    }
}
`;
}

// Run the conversion if this file is executed directly
if (require.main === module) {
    convertPrefixCommandsToSlash()
        .then(() => {
            logger.info("Conversion script completed");
            process.exit(0);
        })
        .catch((error) => {
            logger.error(
                "Error running conversion script:",
                error
            );
            process.exit(1);
        });
}
