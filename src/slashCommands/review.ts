import {
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    SlashCommandBuilder,
} from "discord.js";
import quizManagerInstance from "../core/quiz/quizManagerInstance";
import {
    QuizMode,
    QuizOptions,
    StudyMode,
} from "../core/quiz/QuizTypes";
import reviewManagerInstance from "../core/quiz/reviewManagerInstance";
import { getLogger } from "../utils/logger";

const logger = getLogger("ReviewCommand");

export const data = new SlashCommandBuilder()
    .setName("review")
    .setDescription("Ôn tập từ vựng đã học sai")
    .addSubcommand((subcommand) =>
        subcommand
            .setName("list")
            .setDescription(
                "Hiển thị danh sách từ vựng cần ôn tập"
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("clear")
            .setDescription(
                "Xóa tất cả từ vựng trong danh sách ôn tập"
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("remove")
            .setDescription(
                "Xóa một hoặc nhiều từ vựng khỏi danh sách ôn tập"
            )
            .addStringOption((option) =>
                option
                    .setName("indices")
                    .setDescription(
                        "Chỉ số của các từ vựng cần xóa (vd: 1,2,3)"
                    )
                    .setRequired(true)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("start")
            .setDescription("Bắt đầu phiên ôn tập")
            .addIntegerOption((option) =>
                option
                    .setName("mode")
                    .setDescription("Chế độ ôn tập")
                    .addChoices(
                        { name: "Đọc", value: 1 },
                        { name: "Trắc nghiệm", value: 4 }
                    )
                    .setRequired(false)
            )
            .addStringOption((option) =>
                option
                    .setName("study")
                    .setDescription("Phương pháp học")
                    .addChoices(
                        {
                            name: "Standard",
                            value: "standard",
                        },
                        { name: "Spaced", value: "spaced" }
                    )
                    .setRequired(false)
            )
            .addIntegerOption((option) =>
                option
                    .setName("timeout")
                    .setDescription("Thời gian chờ (giây)")
                    .setMinValue(5)
                    .setMaxValue(60)
                    .setRequired(false)
            )
    );

/**
 * Handle starting a review session
 */
async function handleStartReview(
    interaction: ChatInputCommandInteraction,
    userId: string
): Promise<void> {
    // Check if user has any review items
    if (!reviewManagerInstance.hasReviewItems(userId)) {
        const errorEmbed = new EmbedBuilder()
            .setColor("#ff9900" as ColorResolvable)
            .setTitle("⚠️ Không có mục để ôn tập")
            .setDescription(
                "Bạn chưa có từ vựng nào trong danh sách ôn tập. Từ vựng sẽ tự động được thêm vào khi bạn trả lời sai trong các phiên học.\n\n" +
                    "Hãy thử lại sau khi bạn đã hoàn thành một vài phiên học.\n\n" +
                    "Bạn cũng có thể dùng `/quiz` để bắt đầu một phiên học mới."
            )
            .setFooter({
                text: "Shinken Japanese Learning Bot | /quiz để bắt đầu học",
            });

        await interaction.reply({ embeds: [errorEmbed] });
        return;
    }

    // Get review items
    const reviewItems =
        reviewManagerInstance.getReviewItems(userId);

    // Start a quiz session with these items
    try {
        // Create temporary deck name
        const tempDeckName = `review_${userId}`;

        // Get options from command
        const mode =
            interaction.options.getInteger("mode") ||
            QuizMode.Reading;
        const studyMode =
            (interaction.options.getString(
                "study"
            ) as StudyMode) || StudyMode.Spaced;
        const timeoutSeconds =
            interaction.options.getInteger("timeout") || 20;

        // Set up quiz options
        const quizOptions: QuizOptions = {
            deckName: tempDeckName,
            mode: mode as QuizMode,
            studyMode: studyMode,
            range: "all",
            timeoutSeconds: timeoutSeconds,
        };

        logger.info(
            `Starting review session for user ${userId} with ${reviewItems.length} items`
        );

        // Defer the reply as this might take time
        await interaction.deferReply();

        // Create temp deck in memory with review items
        await quizManagerInstance.startSessionWithItems(
            interaction,
            quizOptions,
            reviewItems
        );
    } catch (error) {
        logger.error(
            `Error starting review session for user ${userId}:`,
            error
        );

        const errorEmbed = new EmbedBuilder()
            .setColor("#ff0000" as ColorResolvable)
            .setTitle("❌ Lỗi")
            .setDescription(
                "Đã xảy ra lỗi khi khởi động phiên ôn tập. Vui lòng thử lại sau.\n\n" +
                    `Lỗi: ${(error as Error).message}`
            )
            .setFooter({
                text: "Shinken Japanese Learning Bot",
            });

        if (interaction.deferred) {
            await interaction.editReply({
                embeds: [errorEmbed],
            });
        } else {
            await interaction.reply({
                embeds: [errorEmbed],
            });
        }
    }
}

/**
 * Handle removing specific review items by index
 */
async function handleRemoveReviewItems(
    interaction: ChatInputCommandInteraction,
    userId: string,
    indices: number[]
): Promise<void> {
    const items =
        reviewManagerInstance.getReviewItems(userId);

    if (!items.length) {
        const embed = new EmbedBuilder()
            .setColor("#ff9900" as ColorResolvable)
            .setTitle("⚠️ Không có mục để xóa")
            .setDescription(
                "Bạn chưa có từ vựng nào trong danh sách ôn tập."
            )
            .setFooter({
                text: "Shinken Japanese Learning Bot",
            });

        await interaction.reply({ embeds: [embed] });
        return;
    }

    // Sort indices in descending order to avoid shifting issues when removing
    const validIndices = indices
        .filter(
            (index) => index > 0 && index <= items.length
        )
        .sort((a, b) => b - a);

    if (!validIndices.length) {
        const embed = new EmbedBuilder()
            .setColor("#ff9900" as ColorResolvable)
            .setTitle("⚠️ Chỉ số không hợp lệ")
            .setDescription(
                `Không tìm thấy mục nào với chỉ số đã cung cấp. Danh sách ôn tập có ${items.length} mục, từ 1 đến ${items.length}.`
            )
            .setFooter({
                text: "Shinken Japanese Learning Bot | /review list để xem danh sách",
            });

        await interaction.reply({ embeds: [embed] });
        return;
    }

    // Track removed items for the confirmation message
    const removedItems = [];

    // Remove items by index (converting to 0-based index)
    for (const index of validIndices) {
        const itemIndex = index - 1; // Convert to 0-based index
        const item = items[itemIndex];
        removedItems.push({
            japanese: item.japanese,
            reading: item.reading,
            index: index,
        });

        // Remove the item by its Japanese text
        reviewManagerInstance.removeReviewItem(
            userId,
            item.japanese
        );
    }

    // Create success message
    const itemsList = removedItems
        .map((item) => {
            return `**${item.japanese}** (${item.reading})`;
        })
        .join("\n");

    const embed = new EmbedBuilder()
        .setColor("#00cc99" as ColorResolvable)
        .setTitle(`✅ Đã xóa ${removedItems.length} mục`)
        .setDescription(
            `Các mục sau đã được xóa khỏi danh sách ôn tập của bạn:\n\n${itemsList}`
        )
        .setFooter({
            text: "Shinken Japanese Learning Bot | /review list để xem danh sách còn lại",
        });

    await interaction.reply({ embeds: [embed] });
}

/**
 * Handle clearing review items
 */
async function handleClearReview(
    interaction: ChatInputCommandInteraction,
    userId: string
): Promise<void> {
    reviewManagerInstance.clearReviewItems(userId);

    const embed = new EmbedBuilder()
        .setColor("#00cc99" as ColorResolvable)
        .setTitle("✅ Đã xóa danh sách ôn tập")
        .setDescription(
            "Tất cả các mục trong danh sách ôn tập của bạn đã được xóa thành công."
        )
        .setFooter({
            text: "Shinken Japanese Learning Bot",
        });

    await interaction.reply({ embeds: [embed] });
}

/**
 * Handle listing review items
 */
async function handleListReview(
    interaction: ChatInputCommandInteraction,
    userId: string
): Promise<void> {
    const items =
        reviewManagerInstance.getReviewItems(userId);

    if (!items.length) {
        const embed = new EmbedBuilder()
            .setColor("#ff9900" as ColorResolvable)
            .setTitle("⚠️ Không có mục để ôn tập")
            .setDescription(
                "Bạn chưa có từ vựng nào trong danh sách ôn tập."
            )
            .setFooter({
                text: "Shinken Japanese Learning Bot",
            });

        await interaction.reply({ embeds: [embed] });
        return;
    }

    // Format items for display
    const itemsList = items
        .map((item, index) => {
            return `${index + 1}. **${item.japanese}** (${
                item.reading
            }) - ${item.meaning}`;
        })
        .join("\n");

    const embed = new EmbedBuilder()
        .setColor("#0099ff" as ColorResolvable)
        .setTitle(
            `📋 Danh sách ôn tập (${items.length} mục)`
        )
        .setDescription(
            itemsList.length > 4000
                ? itemsList.substring(0, 4000) +
                      "...\n(Còn nhiều mục khác)"
                : itemsList
        )
        .setFooter({
            text: "Shinken Japanese Learning Bot | /review start để ôn tập, /review remove để xóa mục",
        });

    await interaction.reply({ embeds: [embed] });
}

/**
 * Main execute function for the review command
 */
export async function execute(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    try {
        switch (subcommand) {
            case "list":
                await handleListReview(interaction, userId);
                break;

            case "clear":
                await handleClearReview(interaction, userId);
                break;

            case "remove":
                const indicesString = interaction.options.getString("indices", true);
                // Parse indices from string (e.g., "1,2,3" -> [1, 2, 3])
                const indices = indicesString
                    .split(",")
                    .map(s => parseInt(s.trim()))
                    .filter(n => !isNaN(n));
                
                if (indices.length === 0) {
                    const embed = new EmbedBuilder()
                        .setColor("#ff9900" as ColorResolvable)
                        .setTitle("⚠️ Định dạng không hợp lệ")
                        .setDescription(
                            "Vui lòng nhập chỉ số hợp lệ (ví dụ: 1,2,3 hoặc 1)"
                        )
                        .setFooter({
                            text: "Shinken Japanese Learning Bot",
                        });
                    
                    await interaction.reply({ embeds: [embed] });
                    return;
                }
                
                await handleRemoveReviewItems(interaction, userId, indices);
                break;

            case "start":
                await handleStartReview(interaction, userId);
                break;

            default:
                const embed = new EmbedBuilder()
                    .setColor("#ff0000" as ColorResolvable)
                    .setTitle("❌ Lệnh không hợp lệ")
                    .setDescription("Subcommand không được hỗ trợ.")
                    .setFooter({
                        text: "Shinken Japanese Learning Bot",
                    });
                
                await interaction.reply({ embeds: [embed] });
                break;
        }
    } catch (error) {
        logger.error(`Error executing review command:`, error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor("#ff0000" as ColorResolvable)
            .setTitle("❌ Lỗi")
            .setDescription(
                "Đã xảy ra lỗi khi thực hiện lệnh. Vui lòng thử lại sau."
            )
            .setFooter({
                text: "Shinken Japanese Learning Bot",
            });

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [errorEmbed] });
        } else {
            await interaction.reply({ embeds: [errorEmbed] });
        }
    }
}