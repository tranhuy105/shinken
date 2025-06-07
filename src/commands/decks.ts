import {
    ColorResolvable,
    EmbedBuilder,
    Message,
} from "discord.js";
import quizManagerInstance from "../services/quizManagerInstance";

export const data = {
    name: "d",
    description:
        "List all available Japanese vocabulary decks",
};

export async function execute(message: Message) {
    const decks = quizManagerInstance.listAvailableDecks();

    if (decks.length === 0) {
        const noDecksEmbed = new EmbedBuilder()
            .setColor("#FF6B6B" as ColorResolvable)
            .setTitle("Danh sách bộ thẻ\n")
            .setDescription(
                "```diff\n- Không tìm thấy bộ thẻ nào trong hệ thống\n```\n" +
                    "Vui lòng thêm các bộ thẻ học trước khi sử dụng!"
            )
            .addFields({
                name: "**Hướng dẫn**",
                value: "• Liên hệ admin để thêm bộ thẻ\n• Kiểm tra lại đường dẫn file thẻ\n• Sử dụng `sk!help` để xem hướng dẫn",
                inline: false,
            })
            .setTimestamp()
            .setFooter({
                text: "Shinken Bot học tiếng Nhật • Trần Huy",
                iconURL:
                    "https://i.pinimg.com/736x/57/ff/2d/57ff2d7ae01ba227bb0e7f8d42033dc2.jpg",
            });

        await message.reply({
            embeds: [noDecksEmbed],
        });
        return;
    }

    const deckListEmbed = new EmbedBuilder()
        .setColor("#4ECDC4" as ColorResolvable)
        .setTitle("Danh sách bộ thẻ có sẵn")
        .setDescription(
            "```yaml\n" +
                decks
                    .map(
                        (deck, index) =>
                            `${(index + 1)
                                .toString()
                                .padStart(2, "0")}. ${deck}`
                    )
                    .join("\n") +
                "\n```"
        )

        .setTimestamp()
        .setFooter({
            text: "Shinken Bot học tiếng Nhật • Trần Huy",
            iconURL:
                "https://i.pinimg.com/736x/57/ff/2d/57ff2d7ae01ba227bb0e7f8d42033dc2.jpg",
        });

    await message.reply({
        embeds: [deckListEmbed],
    });
}
