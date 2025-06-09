import axios from "axios";
import {
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    SlashCommandBuilder,
} from "discord.js";
import llmServiceInstance from "../core/llm/llmServiceInstance";
import { getLogger } from "../utils/logger";

const logger = getLogger("ExplainCommand");

export const data = new SlashCommandBuilder()
    .setName("explain")
    .setDescription(
        "Giải thích từ vựng hoặc ngữ pháp tiếng Nhật"
    )
    .addStringOption((option) =>
        option
            .setName("text")
            .setDescription(
                "Từ vựng hoặc ngữ pháp cần giải thích"
            )
            .setRequired(true)
    );

/**
 * Execute the explain command
 * @param interaction The slash command interaction
 */
export async function execute(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    // Get the text to explain
    const text = interaction.options.getString(
        "text",
        true
    );

    // Send initial response
    const loadingEmbed = new EmbedBuilder()
        .setColor("#0099ff" as ColorResolvable)
        .setTitle("🔍 Đang phân tích...")
        .setDescription(
            `Đang tìm kiếm thông tin chi tiết về **${text}**.\nVui lòng đợi trong giây lát...`
        )
        .setFooter({
            text: "Shinken Japanese Learning Bot",
        });

    await interaction.reply({
        embeds: [loadingEmbed],
    });

    try {
        logger.info(`Explaining: "${text}"`);

        // Call LLM service to get explanation using the simplified method
        const explanation =
            await llmServiceInstance.explainJapanese(text);

        // Check if the explanation is empty or undefined
        if (!explanation || explanation.trim() === "") {
            throw new Error(
                "AI không trả về kết quả. Vui lòng thử lại sau."
            );
        }

        // Create the explanation embed
        const responseEmbed = new EmbedBuilder()
            .setColor("#00cc99" as ColorResolvable)
            .setTitle(`${text}`)
            .setDescription(
                explanation.length > 4000
                    ? explanation.substring(0, 4000) + "..."
                    : explanation
            )
            .setFooter({
                text: "Shinken Japanese Learning Bot | Giải thích bằng AI",
            })
            .setTimestamp();

        // Edit the reply with the explanation
        await interaction.editReply({
            embeds: [responseEmbed],
        });
    } catch (error) {
        console.error(error);
        logger.error(`Error explaining "${text}":`, error);

        // Extract a more useful error message
        let errorMessage = "Đã xảy ra lỗi không xác định";

        if (error instanceof Error) {
            errorMessage = error.message;

            // Check for Axios errors
            if (axios.isAxiosError(error)) {
                if (error.response?.data?.error) {
                    errorMessage =
                        error.response.data.error.message ||
                        errorMessage;
                } else if (error.code === "ECONNABORTED") {
                    errorMessage =
                        "Yêu cầu đã quá thời gian chờ";
                } else if (error.code === "ECONNREFUSED") {
                    errorMessage =
                        "Không thể kết nối đến máy chủ AI";
                }
            }

            // Check for common error patterns
            if (
                errorMessage.includes("rate") &&
                errorMessage.includes("limit")
            ) {
                errorMessage =
                    "Đã vượt quá giới hạn yêu cầu. Vui lòng thử lại sau.";
            } else if (errorMessage.includes("quota")) {
                errorMessage =
                    "Đã vượt quá hạn mức API. Vui lòng thử lại sau.";
            } else if (
                errorMessage.includes("authenticate") ||
                errorMessage.includes("authorization")
            ) {
                errorMessage =
                    "Lỗi xác thực với máy chủ AI. Vui lòng báo cho quản trị viên.";
            }
        }

        // Create error embed
        const errorEmbed = new EmbedBuilder()
            .setColor("#ff0000" as ColorResolvable)
            .setTitle("❌ Lỗi")
            .setDescription(
                "Đã xảy ra lỗi khi tạo giải thích. Vui lòng thử lại sau.\n\n" +
                    `Lỗi: ${errorMessage}`
            )
            .setFooter({
                text: "Shinken Japanese Learning Bot",
            });

        await interaction.editReply({
            embeds: [errorEmbed],
        });
    }
}
