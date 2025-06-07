import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once("ready", async () => {
    try {
        await client.user?.setAvatar(
            "./src/data/avatar.png"
        );
        console.log("✅ Avatar updated successfully!");
    } catch (error) {
        console.error("❌ Failed to update avatar:", error);
    } finally {
        client.destroy(); // Thoát sau khi xong
    }
});

client.login(process.env.BOT_TOKEN);
