import {
    ColorResolvable,
    EmbedBuilder,
    Message,
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

export const data = {
    name: "review",
    aliases: ["rv", "r"],
    description:
        "Review vocabulary items you've previously struggled with",
};

/**
 * Execute the review command
 * @param message Discord message
 * @param args Command arguments
 */
export async function execute(
    message: Message,
    args: string[]
): Promise<void> {
    const userId = message.author.id;

    // Parse options from args
    const options = parseReviewOptions(args);

    // Check for clear command
    if (options.clear) {
        return await handleClearReview(message, userId);
    }

    // Check for list command
    if (options.list) {
        return await handleListReview(message, userId);
    }

    // Check for remove command
    if (options.remove && options.remove.length > 0) {
        return await handleRemoveReviewItems(
            message,
            userId,
            options.remove
        );
    }

    // Check if user has any review items
    if (!reviewManagerInstance.hasReviewItems(userId)) {
        const errorEmbed = new EmbedBuilder()
            .setColor("#ff9900" as ColorResolvable)
            .setTitle("⚠️ Không có mục để ôn tập")
            .setDescription(
                "Bạn chưa có từ vựng nào trong danh sách ôn tập. Từ vựng sẽ tự động được thêm vào khi bạn trả lời sai trong các phiên học.\n\n" +
                    "Hãy thử lại sau khi bạn đã hoàn thành một vài phiên học.\n\n" +
                    "Bạn cũng có thể dùng `s!q` để bắt đầu một phiên học mới.\n\n" +
                    "Lưu ý: Chỉ hỗ trợ add từ vựng ở mode 1 (regconition)"
            )
            .setFooter({
                text: "Shinken Japanese Learning Bot | s!q để bắt đầu học",
            });

        await message.reply({ embeds: [errorEmbed] });
        return;
    }

    // Get review items
    const reviewItems =
        reviewManagerInstance.getReviewItems(userId);

    // Start a quiz session with these items
    try {
        // Create temporary deck name
        const tempDeckName = `review_${userId}`;

        // Set up quiz options
        const quizOptions: QuizOptions = {
            deckName: tempDeckName,
            mode: options.mode || QuizMode.Reading,
            studyMode:
                options.studyMode || StudyMode.Spaced,
            range: "all",
            timeoutSeconds: options.timeoutSeconds || 20,
        };

        logger.info(
            `Starting review session for user ${userId} with ${reviewItems.length} items`
        );

        // Create temp deck in memory with review items
        await quizManagerInstance.startSessionWithItems(
            message,
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

        await message.reply({ embeds: [errorEmbed] });
    }
}

/**
 * Handle removing specific review items by index
 */
async function handleRemoveReviewItems(
    message: Message,
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

        await message.reply({ embeds: [embed] });
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
                text: "Shinken Japanese Learning Bot | s!review -l để xem danh sách",
            });

        await message.reply({ embeds: [embed] });
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
            return `${item.index}. **${item.japanese}** (${item.reading})`;
        })
        .join("\n");

    const embed = new EmbedBuilder()
        .setColor("#00cc99" as ColorResolvable)
        .setTitle(`✅ Đã xóa ${removedItems.length} mục`)
        .setDescription(
            `Các mục sau đã được xóa khỏi danh sách ôn tập của bạn:\n\n${itemsList}`
        )
        .setFooter({
            text: "Shinken Japanese Learning Bot | s!review -l để xem danh sách còn lại",
        });

    await message.reply({ embeds: [embed] });
}

/**
 * Handle clearing review items
 */
async function handleClearReview(
    message: Message,
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

    await message.reply({ embeds: [embed] });
}

/**
 * Handle listing review items
 */
async function handleListReview(
    message: Message,
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

        await message.reply({ embeds: [embed] });
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
            text: "Shinken Japanese Learning Bot | s!review để ôn tập, s!review -r 1,2,3 để xóa mục",
        });

    await message.reply({ embeds: [embed] });
}

/**
 * Parse review options from command arguments
 */
function parseReviewOptions(args: string[]): {
    mode?: QuizMode;
    studyMode?: StudyMode;
    timeoutSeconds?: number;
    clear?: boolean;
    list?: boolean;
    remove?: number[];
} {
    const options: {
        mode?: QuizMode;
        studyMode?: StudyMode;
        timeoutSeconds?: number;
        clear?: boolean;
        list?: boolean;
        remove?: number[];
    } = {};

    // Check for simple commands first
    if (
        args.includes("clear") ||
        args.includes("--clear") ||
        args.includes("-c")
    ) {
        options.clear = true;
        return options;
    }

    if (
        args.includes("list") ||
        args.includes("--list") ||
        args.includes("-l")
    ) {
        options.list = true;
        return options;
    }

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i].toLowerCase();

        // Check for named parameters
        if (arg.startsWith("--") || arg.startsWith("-")) {
            const paramName = arg.startsWith("--")
                ? arg.substring(2)
                : arg.substring(1);

            let value: string;

            // Handle --param=value format
            if (paramName.includes("=")) {
                const [key, val] = paramName.split("=", 2);
                value = val;

                processParam(key, value, options);
            }
            // Handle --param value format
            else if (
                i + 1 < args.length &&
                !args[i + 1].startsWith("-")
            ) {
                value = args[i + 1];
                i++; // Skip next argument as it's the value

                processParam(paramName, value, options);
            }
            // Handle flags without values
            else {
                processParam(paramName, "", options);
            }
        }
    }

    return options;
}

/**
 * Process a parameter and update options
 */
function processParam(
    key: string,
    value: string,
    options: {
        mode?: QuizMode;
        studyMode?: StudyMode;
        timeoutSeconds?: number;
        clear?: boolean;
        list?: boolean;
        remove?: number[];
    }
): void {
    switch (key) {
        case "mode":
        case "m":
            options.mode = parseInt(value, 10) as QuizMode;
            break;
        case "study":
        case "s":
            options.studyMode = value as StudyMode;
            break;
        case "timeout":
        case "t":
            options.timeoutSeconds =
                parseInt(value, 10) || 20;
            break;
        case "clear":
        case "c":
            options.clear = true;
            break;
        case "list":
        case "l":
            options.list = true;
            break;
        case "remove":
        case "r":
            // Parse comma-separated list of indices
            if (value) {
                options.remove = value
                    .split(",")
                    .map((indexStr) =>
                        parseInt(indexStr.trim(), 10)
                    )
                    .filter((index) => !isNaN(index));
            }
            break;
    }
}
