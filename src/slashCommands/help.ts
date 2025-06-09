import {
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Hiển thị thông tin trợ giúp về bot");

export async function execute(
    interaction: ChatInputCommandInteraction
) {
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
                    "/q     : Bắt đầu phiên học tương tác\n" +
                    "/d     : Xem danh sách bộ từ vựng\n" +
                    "/help  : Hiển thị menu trợ giúp\n" +
                    "/ping  : Kiểm tra độ trễ và trạng thái của bot\n" +
                    "/e     : Giải thích thuật ngữ/cụm từ/ngữ pháp tiếng Nhật\n" +
                    "/r     : Ôn lại từ vựng đã học (và sai)\n" +
                    "```",
                inline: false,
            },
            {
                name: "**GHI CHÚ**",
                value:
                    "• Gõ `stop` để thoát quiz\n" +
                    "• Chế độ `spaced` (SRS) phù hợp với deck mới, đang học\n" +
                    "• Chế độ `2` luân phiên giữa nghĩa và đọc, đánh giá bởi LLM\n" +
                    "• Các lệnh có thể dùng cả dạng `/command` và `s!command`",
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

    await interaction.reply({ embeds: [helpEmbed] });
}
