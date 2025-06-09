import {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    SlashCommandBuilder,
} from "discord.js";
import quizManagerInstance from "../core/quiz/quizManagerInstance";
import {
    QuestionDirection,
    QuizMode,
    QuizOptions,
    StudyMode,
} from "../core/quiz/QuizTypes";
import settingsInstance from "../core/settings/settingsInstance";

export const data = new SlashCommandBuilder()
    .setName("quiz")
    .setDescription(
        "Bắt đầu phiên học tiếng Nhật tương tác"
    )
    .addStringOption((option) =>
        option
            .setName("deck")
            .setDescription("Tên bộ thẻ học")
            .setRequired(false)
            .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
        option
            .setName("mode")
            .setDescription(
                "Chế độ học (0=Hỗn hợp, 1=Đọc, 4=Trắc nghiệm)"
            )
            .setRequired(false)
            .addChoices(
                { name: "Hỗn hợp", value: 0 },
                { name: "Đọc (Kanji → Âm)", value: 1 },
                {
                    name: "Trắc nghiệm (Việt → Nhật)",
                    value: 4,
                }
            )
    )
    .addStringOption((option) =>
        option
            .setName("range")
            .setDescription("Phạm vi thẻ (all, 1-20, v.v.)")
            .setRequired(false)
    )
    .addIntegerOption((option) =>
        option
            .setName("timeout")
            .setDescription("Thời gian chờ (giây)")
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(300)
    )
    .addStringOption((option) =>
        option
            .setName("study")
            .setDescription("Chế độ học")
            .setRequired(false)
            .addChoices(
                {
                    name: "Standard - Tiêu chuẩn",
                    value: "standard",
                },
                {
                    name: "Conquest - Chinh phục",
                    value: "conquest",
                },
                {
                    name: "Spaced - Học cách quãng",
                    value: "spaced",
                },
                { name: "Learn - Học mới", value: "learn" }
            )
    )
    .addStringOption((option) =>
        option
            .setName("direction")
            .setDescription("Hướng câu hỏi")
            .setRequired(false)
            .addChoices(
                {
                    name: "Forward - Thuận",
                    value: "forward",
                },
                {
                    name: "Backward - Ngược",
                    value: "backward",
                },
                { name: "Both - Cả hai", value: "both" }
            )
    )
    .addIntegerOption((option) =>
        option
            .setName("choices")
            .setDescription("Số lựa chọn trong trắc nghiệm")
            .setRequired(false)
            .setMinValue(2)
            .setMaxValue(6)
    );

export async function execute(
    interaction: ChatInputCommandInteraction
) {
    const settings = settingsInstance.getQuizSettings();

    // Parse options from interaction
    const config: QuizOptions = {
        deckName:
            interaction.options.getString("deck") ||
            settings.defaultDeck,
        mode: (interaction.options.getInteger("mode") ??
            settings.defaultMode) as QuizMode,
        studyMode: (interaction.options.getString(
            "study"
        ) || settings.defaultStudyMode) as StudyMode,
        range:
            interaction.options.getString("range") || "all",
        timeoutSeconds:
            interaction.options.getInteger("timeout") ||
            settings.defaultTimeoutSeconds,
        direction: (interaction.options.getString(
            "direction"
        ) || "forward") as QuestionDirection,
        numChoices:
            interaction.options.getInteger("choices") || 4,
    };

    try {
        // Defer the reply since quiz sessions can take time to start
        await interaction.deferReply();

        // Start the session with the options
        await quizManagerInstance.startSession(
            interaction,
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
                value: "• Kiểm tra tên bộ thẻ với `/decks`\n• Thử lại với tham số mặc định\n• Liên hệ admin nếu lỗi vẫn tiếp diễn\n• Gõ `/help` để xem cách dùng",
                inline: false,
            })
            .setTimestamp()
            .setFooter({
                text: "Shinken Bot học tiếng Nhật • Trần Huy",
                iconURL:
                    "https://i.pinimg.com/736x/57/ff/2d/57ff2d7ae01ba227bb0e7f8d42033dc2.jpg",
            });

        if (interaction.deferred) {
            await interaction.editReply({
                embeds: [errorEmbed],
            });
        } else if (!interaction.replied) {
            await interaction.reply({
                embeds: [errorEmbed],
                ephemeral: true,
            });
        }
    }
}

export async function autocomplete(
    interaction: AutocompleteInteraction
) {
    const focusedOption =
        interaction.options.getFocused(true);
    let choices: { name: string; value: string }[] = [];

    if (focusedOption.name === "deck") {
        const decks =
            quizManagerInstance.listAvailableDecksNames();
        const focusedValue =
            focusedOption.value.toLowerCase();

        choices = decks
            .filter((deck) =>
                deck.toLowerCase().includes(focusedValue)
            )
            .map((deck) => ({ name: deck, value: deck }));
    }

    await interaction.respond(
        choices.slice(0, 25) // Discord has a limit of 25 options
    );
}
