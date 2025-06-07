import {
    ColorResolvable,
    EmbedBuilder,
    Message,
} from "discord.js";
import quizManagerInstance from "../services/quizManagerInstance";
import settingsInstance from "../services/settingsInstance";

export const data = {
    name: "q",
    aliases: ["study"],
    description:
        "Start a Japanese learning quiz session with flexible parameters",
};

// Helper function to parse named arguments
function parseNamedArgs(args: string[]) {
    const settings = settingsInstance.getQuizSettings();

    // Default values
    const config = {
        deck: settings.defaultDeck,
        mode: settings.defaultMode,
        range: "all",
        timeout: settings.defaultTimeoutSeconds,
        study: settings.defaultStudyMode,
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
                        config.deck = value;
                        break;
                    case "mode":
                    case "m":
                        config.mode = parseInt(value, 10);
                        break;
                    case "range":
                    case "r":
                        config.range = value;
                        break;
                    case "timeout":
                    case "t":
                        config.timeout =
                            parseInt(value, 10) ||
                            config.timeout;
                        break;
                    case "study":
                    case "s":
                        config.study = value;
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
                        config.deck = value;
                        break;
                    case "mode":
                    case "m":
                        config.mode = parseInt(value, 10);
                        break;
                    case "range":
                    case "r":
                        config.range = value;
                        break;
                    case "timeout":
                    case "t":
                        config.timeout =
                            parseInt(value, 10) ||
                            config.timeout;
                        break;
                    case "study":
                    case "s":
                        config.study = value;
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
                    config.deck = value;
                    break;
                case "m":
                    config.mode = parseInt(value, 10);
                    break;
                case "r":
                    config.range = value;
                    break;
                case "t":
                    config.timeout =
                        parseInt(value, 10) ||
                        config.timeout;
                    break;
                case "s":
                    config.study = value;
                    break;
            }
        }
        // Handle positional arguments (backward compatibility)
        else {
            switch (i) {
                case 0:
                    config.deck = arg;
                    break;
                case 1:
                    config.mode = parseInt(arg, 10);
                    break;
                case 2:
                    config.range = arg;
                    break;
                case 3:
                    config.timeout =
                        parseInt(arg, 10) || config.timeout;
                    break;
                case 4:
                    config.study = arg;
                    break;
            }
        }
    }

    return config;
}

// Helper function to show usage examples
function getUsageEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor("#FFA500" as ColorResolvable)
        .setTitle("📖 Cách sử dụng lệnh Quiz")
        .setDescription(
            "Bạn có thể sử dụng lệnh với nhiều cách khác nhau:"
        )
        .addFields(
            {
                name: "**1. Cách cũ (theo thứ tự):**",
                value: "```sk!q [deck] [mode] [range] [timeout] [study]```",
                inline: false,
            },
            {
                name: "**2. Cách mới (chỉ định tham số):**",
                value: "```sk!q --study=conquest\nsk!q -s conquest\nsk!q --mode=2 --study=conquest\nsk!q -m 2 -s conquest```",
                inline: false,
            },
            {
                name: "**Tham số có thể dùng:**",
                value: "• `--deck` hoặc `-d`: Tên bộ thẻ\n• `--mode` hoặc `-m`: Chế độ (1=đọc, 2=nghĩa)\n• `--range` hoặc `-r`: Phạm vi thẻ (all, 1-20, 1-100, ...)\n• `--timeout` hoặc `-t`: Thời gian (giây)\n• `--study` hoặc `-s`: Chế độ học\n• `help`: Hiển thị hướng dẫn sử dụng",
                inline: false,
            },
            {
                name: "**Ví dụ thực tế:**",
                value: "```sk!q -s conquest\nsk!q --study=conquest --timeout=45\nsk!q -m 1 -s review -t 20```",
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
        // Create an embed to confirm the study session
        const embed = new EmbedBuilder()
            .setColor("#45B7D1" as ColorResolvable)
            .setTitle("🚀 Bắt đầu phiên học tiếng Nhật")
            .setDescription(
                "```diff\n+ Chuẩn bị khởi động phiên học với cấu hình sau:\n```"
            )
            .addFields(
                {
                    name: "**Bộ thẻ**",
                    value: `\`${config.deck}\``,
                    inline: true,
                },
                {
                    name: "**Chế độ**",
                    value:
                        config.mode === 1
                            ? "📖 Đọc (Kanji → Âm)"
                            : "🔄 Nghĩa (2 chiều)",
                    inline: true,
                },
                {
                    name: "**Phạm vi**",
                    value: `📌 \`${config.range}\``,
                    inline: true,
                },
                {
                    name: "**Thời gian**",
                    value: `⏰ \`${config.timeout}s\`/câu`,
                    inline: true,
                },
                {
                    name: "**Chế độ học**",
                    value: `\`${config.study}\``,
                    inline: true,
                },
                {
                    name: "**Ghi chú**",
                    value: "Gõ `stop` để thoát quiz",
                    inline: true,
                }
            )
            .addFields({
                name: "**Sẵn sàng học tập?**",
                value: "Quiz sẽ bắt đầu ngay sau thông báo này...",
                inline: false,
            })
            .setThumbnail(
                "https://i.pinimg.com/736x/57/ff/2d/57ff2d7ae01ba227bb0e7f8d42033dc2.jpg"
            )
            .setTimestamp()
            .setFooter({
                text: "Shinken Bot học tiếng Nhật • Trần Huy",
                iconURL:
                    "https://i.pinimg.com/736x/57/ff/2d/57ff2d7ae01ba227bb0e7f8d42033dc2.jpg",
            });

        await message.reply({ embeds: [embed] });

        // Start the session
        await quizManagerInstance.startSession(
            message,
            config.deck,
            parseInt(config.mode.toString(), 10),
            config.range,
            config.timeout,
            config.study
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
                value: "• Kiểm tra tên bộ thẻ với `sk!d`\n• Thử lại với tham số mặc định\n• Liên hệ admin nếu lỗi vẫn tiếp diễn\n• Gõ `sk!q help` để xem cách dùng",
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
