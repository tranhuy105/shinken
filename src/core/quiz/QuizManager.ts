import {
    ColorResolvable,
    EmbedBuilder,
    Message,
} from "discord.js";
import { JapaneseTextConverter } from "../../utils/JapaneseTextConverter";
import { getLogger } from "../../utils/logger";
import deckManagerInstance from "../deck/deckManagerInstance";
import settingsInstance from "../settings/settingsInstance";
import { QuizSession } from "./QuizSession";
import {
    QuizOptions,
    StudyMode,
    VocabularyItem,
} from "./QuizTypes";

// Get module logger
const logger = getLogger("QuizManager");

/**
 * Class to manage Japanese quiz sessions
 */
export class JapaneseQuizManager {
    private sessionMap: Map<string, QuizSession>;
    private textConverter: JapaneseTextConverter;
    private tempDecks: Map<string, VocabularyItem[]>;

    constructor() {
        this.sessionMap = new Map();
        this.textConverter = new JapaneseTextConverter();
        this.tempDecks = new Map();

        logger.info("Initializing quiz manager");
    }

    /**
     * List all available decks
     */
    public listAvailableDecks(): string[] {
        return deckManagerInstance.listAvailableDecks();
    }

    /**
     * Start a new quiz session with options
     */
    public async startSession(
        message: Message,
        options: QuizOptions
    ): Promise<void> {
        // Check if user already has an active session
        const userId = message.author.id;
        const existingSession = Array.from(
            this.sessionMap.values()
        ).find(
            (session) => session.getUserId?.() === userId
        );

        if (existingSession) {
            logger.info(
                `User ${userId} already has an active session`
            );
            const errorEmbed = new EmbedBuilder()
                .setColor("#ff9900" as ColorResolvable)
                .setTitle("⚠️ Phiên học đang hoạt động")
                .setDescription(
                    "Bạn đã có một phiên học đang hoạt động. Hãy hoàn thành hoặc dừng phiên đó trước khi bắt đầu phiên mới.\n\nGõ `stop` để kết thúc phiên học hiện tại."
                )
                .setTimestamp();

            await message.reply({
                embeds: [errorEmbed],
            });
            return;
        }

        // Get settings with defaults
        const quizSettings =
            settingsInstance.getQuizSettings();

        // Apply defaults if options are missing
        if (!options.deckName)
            options.deckName = quizSettings.defaultDeck;
        if (options.mode === undefined)
            options.mode = quizSettings.defaultMode as any;
        if (!options.timeoutSeconds)
            options.timeoutSeconds =
                quizSettings.defaultTimeoutSeconds;
        if (!options.studyMode)
            options.studyMode =
                quizSettings.defaultStudyMode as StudyMode;
        if (!options.range) options.range = "all";

        logger.info(
            `Starting session with options:`,
            JSON.stringify(options, null, 2)
        );

        try {
            // Check if it's a temporary deck
            const isTempDeck = this.tempDecks.has(
                options.deckName
            );

            // Check if deck exists (for non-temp decks)
            if (
                !isTempDeck &&
                !deckManagerInstance.deckExists(
                    options.deckName
                )
            ) {
                logger.warn(
                    `Deck not found: ${options.deckName}`
                );
                const errorEmbed = new EmbedBuilder()
                    .setColor("#ff0000" as ColorResolvable)
                    .setTitle("❌ Lỗi")
                    .setDescription(
                        `Không tìm thấy bộ thẻ "${options.deckName}". Sử dụng \`s!d\` để xem các bộ thẻ có sẵn.`
                    )
                    .setTimestamp();

                await message.reply({
                    embeds: [errorEmbed],
                });
                return;
            }

            // Get deck items - either from temporary storage or from deck manager
            let deck: VocabularyItem[];
            if (isTempDeck) {
                deck =
                    this.tempDecks.get(options.deckName) ||
                    [];
            } else {
                deck = deckManagerInstance.getDeckItems(
                    options.deckName
                );
            }

            if (deck.length === 0) {
                logger.warn(
                    `Deck is empty: ${options.deckName}`
                );
                const errorEmbed = new EmbedBuilder()
                    .setColor("#ff0000" as ColorResolvable)
                    .setTitle("❌ Lỗi")
                    .setDescription(
                        `Bộ thẻ "${options.deckName}" không có từ vựng nào.`
                    )
                    .setTimestamp();

                await message.reply({
                    embeds: [errorEmbed],
                });
                return;
            }

            // Create session
            const sessionId = `${
                message.author.id
            }-${Date.now()}`;
            logger.info(
                `Creating session with ID: ${sessionId}`
            );

            // Add temp deck items to message for QuizSession to access
            if (isTempDeck) {
                (message as any).tempDeckItems = deck;
            }

            const session = new QuizSession(
                sessionId,
                message,
                options,
                this.textConverter
            );

            // Save and start session
            this.sessionMap.set(sessionId, session);
            session.start();

            // Clean up when session ends
            session.on("end", () => {
                logger.info(`Session ended: ${sessionId}`);
                this.sessionMap.delete(sessionId);

                // Clean up temporary deck if used
                if (isTempDeck) {
                    this.tempDecks.delete(options.deckName);
                    logger.debug(
                        `Removed temporary deck: ${options.deckName}`
                    );
                }
            });
        } catch (error) {
            logger.error(
                "Error starting quiz session:",
                error
            );
            const errorEmbed = new EmbedBuilder()
                .setColor("#ff0000" as ColorResolvable)
                .setTitle("❌ Lỗi")
                .setDescription(
                    "Đã xảy ra lỗi khi khởi động phiên học."
                )
                .setTimestamp();

            await message.reply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Start a session with custom items
     */
    public async startSessionWithItems(
        message: Message,
        options: QuizOptions,
        items: VocabularyItem[]
    ): Promise<void> {
        // Create a temporary deck
        const tempDeckName =
            options.deckName ||
            `temp_${message.author.id}_${Date.now()}`;

        // Store items in the temporary deck map
        this.tempDecks.set(tempDeckName, [...items]);

        // Also store the items directly on the message for the QuizSession to access
        (message as any).tempDeckItems = [...items];

        // Update the deck name in options
        options.deckName = tempDeckName;

        logger.info(
            `Created temporary deck "${tempDeckName}" with ${items.length} items`
        );

        // Start a session with the temporary deck
        await this.startSession(message, options);
    }

    /**
     * Clean up all active sessions
     * Useful for bot shutdown or restart
     */
    public cleanupSessions(): void {
        logger.info(
            `Cleaning up ${this.sessionMap.size} active sessions`
        );
        this.sessionMap.clear();
        this.tempDecks.clear();
    }
}
