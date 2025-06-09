import {
    ColorResolvable,
    EmbedBuilder,
    Message,
} from "discord.js";
import quizManagerInstance from "../core/quiz/quizManagerInstance";
import {
    QuestionDirection,
    QuizMode,
    QuizOptions,
    StudyMode,
} from "../core/quiz/QuizTypes";
import settingsInstance from "../core/settings/settingsInstance";

export const data = {
    name: "q",
    aliases: ["study"],
    description:
        "Start a Japanese learning quiz session with flexible parameters",
};

// Helper function to parse named arguments
function parseNamedArgs(args: string[]): QuizOptions {
    const settings = settingsInstance.getQuizSettings();

    // Default values
    const config: QuizOptions = {
        deckName: settings.defaultDeck,
        mode:
            (settings.defaultMode as unknown as QuizMode) ||
            QuizMode.Mixed,
        studyMode:
            (settings.defaultStudyMode as StudyMode) ||
            StudyMode.Standard,
        range: "all",
        timeoutSeconds: settings.defaultTimeoutSeconds,
        direction: QuestionDirection.Forward,
        numChoices: 4,
    };

    // Parse named arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i].toLowerCase();

        // Check for named parameters with format --param=value or --param value
        if (arg.startsWith("--")) {
            const paramName = arg.substring(2);
            let value: string;

            // Handle --param=value format
            if (paramName.includes("=")) {
                const [key, val] = paramName.split("=", 2);
                value = val;

                switch (key) {
                    case "deck":
                    case "d":
                        config.deckName = value;
                        break;
                    case "mode":
                    case "m":
                        config.mode = parseInt(
                            value,
                            10
                        ) as QuizMode;
                        break;
                    case "range":
                    case "r":
                        config.range = value;
                        break;
                    case "timeout":
                    case "t":
                        config.timeoutSeconds =
                            parseInt(value, 10) ||
                            config.timeoutSeconds;
                        break;
                    case "study":
                    case "s":
                        config.studyMode =
                            value as StudyMode;
                        break;
                    case "direction":
                        if (
                            [
                                "forward",
                                "backward",
                                "both",
                            ].includes(value)
                        ) {
                            config.direction =
                                value as QuestionDirection;
                        }
                        break;
                    case "choices":
                        config.numChoices =
                            parseInt(value, 10) || 4;
                        break;
                }
            }
            // Handle --param value format
            else if (i + 1 < args.length) {
                value = args[i + 1];
                i++; // Skip next argument as it's the value

                switch (paramName) {
                    case "deck":
                    case "d":
                        config.deckName = value;
                        break;
                    case "mode":
                    case "m":
                        config.mode = parseInt(
                            value,
                            10
                        ) as QuizMode;
                        break;
                    case "range":
                    case "r":
                        config.range = value;
                        break;
                    case "timeout":
                    case "t":
                        config.timeoutSeconds =
                            parseInt(value, 10) ||
                            config.timeoutSeconds;
                        break;
                    case "study":
                    case "s":
                        config.studyMode =
                            value as StudyMode;
                        break;
                    case "direction":
                        if (
                            [
                                "forward",
                                "backward",
                                "both",
                            ].includes(value)
                        ) {
                            config.direction =
                                value as QuestionDirection;
                        }
                        break;
                    case "choices":
                        config.numChoices =
                            parseInt(value, 10) || 4;
                        break;
                }
            }
        }
        // Handle shorthand formats like -d=value or -m value
        else if (arg.startsWith("-") && arg.length > 1) {
            const paramChar = arg.substring(1, 2);
            let value: string;

            // Handle -d=value format
            if (arg.includes("=")) {
                value = arg.split("=", 2)[1];
            }
            // Handle -d value format
            else if (i + 1 < args.length) {
                value = args[i + 1];
                i++; // Skip next argument as it's the value
            } else {
                continue;
            }

            switch (paramChar) {
                case "d":
                    config.deckName = value;
                    break;
                case "m":
                    config.mode = parseInt(
                        value,
                        10
                    ) as QuizMode;
                    break;
                case "r":
                    config.range = value;
                    break;
                case "t":
                    config.timeoutSeconds =
                        parseInt(value, 10) ||
                        config.timeoutSeconds;
                    break;
                case "s":
                    config.studyMode = value as StudyMode;
                    break;
            }
        }
        // Handle positional arguments (backward compatibility)
        else {
            switch (i) {
                case 0:
                    config.deckName = arg;
                    break;
                case 1:
                    config.mode = parseInt(
                        arg,
                        10
                    ) as QuizMode;
                    break;
                case 2:
                    config.range = arg;
                    break;
                case 3:
                    config.timeoutSeconds =
                        parseInt(arg, 10) ||
                        config.timeoutSeconds;
                    break;
                case 4:
                    config.studyMode = arg as StudyMode;
                    break;
            }
        }
    }

    return config;
}

// Helper function to get mode name
function getModeName(mode: QuizMode): string {
    switch (mode) {
        case QuizMode.Reading:
            return "📖 Đọc (Kanji → Âm)";
        case QuizMode.ReverseMCQ:
            return "📋 Trắc nghiệm (Việt → Nhật)";
        case QuizMode.Mixed:
            return "🎲 Hỗn hợp";
        default:
            return "Không xác định";
    }
}

// Helper function to show usage examples
function getUsageEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor("#FFA500" as ColorResolvable)
        .setTitle("Cách sử dụng lệnh Quiz")
        .setDescription(
            "Bạn có thể sử dụng các tham số sau:"
        )
        .addFields(
            {
                name: "**Tham số có thể dùng:**",
                value: "• `--deck` hoặc `-d`: Tên bộ thẻ\n• `--mode` hoặc `-m`: Chế độ (1=Đọc, 4=Trắc nghiệm, 0=Hỗn hợp)\n• `--range` hoặc `-r`: Phạm vi thẻ (all, 1-20, 1-100, ...)\n• `--timeout` hoặc `-t`: Thời gian (giây)\n• `--study` hoặc `-s`: Chế độ học (standard, conquest, spaced, learn)\n• `--choices`: Số lựa chọn trong trắc nghiệm (mặc định: 4)\n• `help`: Hiển thị hướng dẫn sử dụng",
                inline: false,
            },
            {
                name: "**Ví dụ thực tế:**",
                value: "```s!q -s conquest\ns!q --mode=4 --study=standard\ns!q -m 2 -t 20```",
                inline: false,
            }
        )
        .setFooter({
            text: "Shinken Bot học tiếng Nhật • Trần Huy",
            iconURL:
                "https://i.pinimg.com/736x/57/ff/2d/57ff2d7ae01ba227bb0e7f8d42033dc2.jpg",
        });
}

export async function execute(
    message: Message,
    args: string[]
) {
    // Show help if no args or help requested
    if (
        args.length === 0 ||
        args[0].toLowerCase() === "help"
    ) {
        await message.reply({ embeds: [getUsageEmbed()] });
        return;
    }

    // Parse arguments
    const config = parseNamedArgs(args);

    try {
        // Start the session with the new options
        await quizManagerInstance.startSession(
            message,
            config
        );
    } catch (error) {
        console.error(error);
        const errorEmbed = new EmbedBuilder()
            .setColor("#FF6B6B" as ColorResolvable)
            .setTitle("❌ Lỗi khởi động quiz")
            .setDescription(
                "```diff\n- Đã xảy ra lỗi khi khởi động phiên học\n```"
            )
            .addFields({
                name: "**Có thể do:**",
                value: "• Bộ thẻ không tồn tại\n• Tham số không hợp lệ\n• Lỗi hệ thống tạm thời",
                inline: false,
            })
            .addFields({
                name: "**Giải pháp:**",
                value: "• Kiểm tra tên bộ thẻ với `s!d`\n• Thử lại với tham số mặc định\n• Liên hệ admin nếu lỗi vẫn tiếp diễn\n• Gõ `s!q help` để xem cách dùng",
                inline: false,
            })
            .setTimestamp()
            .setFooter({
                text: "Shinken Bot học tiếng Nhật • Trần Huy",
                iconURL:
                    "https://i.pinimg.com/736x/57/ff/2d/57ff2d7ae01ba227bb0e7f8d42033dc2.jpg",
            });

        await message.reply({
            embeds: [errorEmbed],
        });
    }
}
