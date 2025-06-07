import {
    ColorResolvable,
    EmbedBuilder,
    Message,
} from "discord.js";

export const data = {
    name: "help",
    description: "Hiển thị thông tin trợ giúp về bot",
};

export async function execute(message: Message) {
    const helpEmbed = new EmbedBuilder()
        .setColor("#45B7D1" as ColorResolvable)
        .setTitle("Shinken - Trợ lý học tiếng Nhật")
        .setDescription(
            "```diff\n+ Bot Discord tương tác để học từ vựng tiếng Nhật một cách hiệu quả\n```"
        )
        .addFields(
            {
                name: "**LỆNH CƠ BẢN**",
                value:
                    "```yaml\n" +
                    "sk!q     : Bắt đầu phiên học tương tác\n" +
                    "sk!q help : Hướng dẫn sử dụng sk!q\n" +
                    "sk!d     : Xem danh sách bộ từ vựng\n" +
                    "sk!help  : Hiển thị menu trợ giúp\n" +
                    "```",
                inline: false,
            },
            {
                name: "**GHI CHÚ**",
                value:
                    "• Gõ `stop` để thoát quiz\n" +
                    "• Chế độ `spaced` (SRS) phù hợp với deck mới, đang học\n" +
                    "• Chế độ `2` luân phiên giữa nghĩa và đọc, đánh giá bởi LLM\n",
                inline: false,
            }
        )
        .setThumbnail(
            "https://i.pinimg.com/736x/57/ff/2d/57ff2d7ae01ba227bb0e7f8d42033dc2.jpg"
        )
        .setFooter({
            text: "Shinken Bot học tiếng Nhật • Trần Huy",
            iconURL:
                "https://i.pinimg.com/736x/57/ff/2d/57ff2d7ae01ba227bb0e7f8d42033dc2.jpg",
        })
        .setTimestamp();

    await message.reply({ embeds: [helpEmbed] });
}
