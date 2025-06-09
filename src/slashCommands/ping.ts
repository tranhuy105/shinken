import {
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("ping")
    .setDescription(
        "Kiểm tra độ trễ và trạng thái của bot"
    );

export async function execute(
    interaction: ChatInputCommandInteraction
) {
    // Calculate ping
    const sentTimestamp = Date.now();

    // Create initial embed
    const initialEmbed = new EmbedBuilder()
        .setColor("#45B7D1" as ColorResolvable)
        .setTitle("🏓 Đang kiểm tra...")
        .setDescription("Đang tính toán độ trễ...")
        .setTimestamp();

    // Send initial message
    await interaction.reply({
        embeds: [initialEmbed],
    });

    // Calculate round trip time
    const roundTripTime = Date.now() - sentTimestamp;

    // Calculate websocket heartbeat
    const wsHeartbeat = interaction.client.ws.ping;

    // Create response embed
    const responseEmbed = new EmbedBuilder()
        .setColor("#4ECDC4" as ColorResolvable)
        .setTitle("🏓 Pong!")
        .setDescription(
            "```yaml\n" +
                `Độ trễ API: ${roundTripTime}ms\n` +
                `Độ trễ Websocket: ${wsHeartbeat}ms\n` +
                `Thời gian hoạt động: ${formatUptime(
                    process.uptime()
                )}\n` +
                "```"
        )
        .setFooter({
            text: "Shinken Bot học tiếng Nhật • Trần Huy",
            iconURL:
                "https://i.pinimg.com/736x/57/ff/2d/57ff2d7ae01ba227bb0e7f8d42033dc2.jpg",
        })
        .setTimestamp();

    // Edit the message with the response
    await interaction.editReply({
        embeds: [responseEmbed],
    });
}

/**
 * Format uptime in a human-readable format
 * @param seconds Uptime in seconds
 */
function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);

    const parts = [];

    if (days > 0) parts.push(`${days} ngày`);
    if (hours > 0) parts.push(`${hours} giờ`);
    if (minutes > 0) parts.push(`${minutes} phút`);
    if (seconds > 0 || parts.length === 0)
        parts.push(`${seconds} giây`);

    return parts.join(", ");
}
