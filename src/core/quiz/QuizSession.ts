import { createCanvas } from "canvas";
import {
    AttachmentBuilder,
    ColorResolvable,
    DMChannel,
    EmbedBuilder,
    Message,
    MessageCollector,
    NewsChannel,
    TextChannel,
    ThreadChannel,
} from "discord.js";
import { EventEmitter } from "events";
import { JapaneseTextConverter } from "../../utils/JapaneseTextConverter";
import { getLogger } from "../../utils/logger";
import deckManagerInstance from "../deck/deckManagerInstance";
import { QuizGenerator } from "./QuizGenerator";
import {
    BaseQuestion,
    MultipleChoiceQuestion,
    QuizMode,
    QuizOptions,
    QuizQuestion,
    VocabularyItem,
} from "./QuizTypes";
import reviewManagerInstance from "./reviewManagerInstance";
import {
    IStudyStrategy,
    StudySessionStatistics,
} from "./strategies/StudyStrategy";
import { StudyStrategyFactory } from "./strategies/StudyStrategyFactory";

// Get module logger
const logger = getLogger("QuizSession");

/**
 * Class representing a quiz session
 */
export class QuizSession extends EventEmitter {
    private message: Message;
    private options: QuizOptions;
    private questions: BaseQuestion[] = [];
    private currentQuestion: BaseQuestion | null = null;
    private collector: MessageCollector | null = null;
    private timeout: NodeJS.Timeout | null = null;
    private sessionId: string;
    private correctCount: number = 0;
    private incorrectCount: number = 0;
    private streakCount: number = 0;
    private startTime: Date;
    private textConverter: JapaneseTextConverter;
    private studyStrategy!: IStudyStrategy;

    constructor(
        sessionId: string,
        message: Message,
        options: QuizOptions,
        textConverter: JapaneseTextConverter
    ) {
        super();
        this.sessionId = sessionId;
        this.message = message;
        this.options = options;
        this.textConverter = textConverter;
        this.startTime = new Date();

        logger.debug(
            `[QuizSession:${sessionId}] Created new session with options:`,
            JSON.stringify(options, null, 2)
        );
    }

    /**
     * Get the user ID associated with this session
     */
    public getUserId(): string {
        return (this.message as any).isInteraction
            ? (this.message as any).user.id
            : this.message.author.id;
    }

    /**
     * Start the quiz session
     */
    public async start(): Promise<void> {
        logger.debug(
            `[QuizSession:${this.sessionId}] Starting session`
        );

        try {
            // Load deck items
            const items = await this.loadDeckItems();
            if (!items.length) {
                await this.sendError(
                    "Không có từ vựng nào trong bộ thẻ này."
                );
                this.emit("end");
                return;
            }

            logger.debug(
                `[QuizSession:${this.sessionId}] Loaded ${items.length} vocabulary items`
            );

            // Generate questions
            const quizGenerator = new QuizGenerator();
            this.questions =
                quizGenerator.generateQuestions(
                    items,
                    this.options
                );

            if (!this.questions.length) {
                await this.sendError(
                    "Không thể tạo câu hỏi từ bộ thẻ này."
                );
                this.emit("end");
                return;
            }

            logger.debug(
                `[QuizSession:${this.sessionId}] Generated ${this.questions.length} questions from ${items.length} vocabulary items`
            );

            // Create appropriate study strategy
            this.studyStrategy =
                StudyStrategyFactory.createStrategy(
                    this.options.studyMode,
                    this.questions
                );

            // Send welcome message
            const embed = this.createStartEmbed();

            // Check if message is actually an interaction
            if ((this.message as any).isInteraction) {
                const interaction = this.message as any;
                if (interaction.deferred) {
                    await interaction.editReply({
                        embeds: [embed],
                    });
                } else if (!interaction.replied) {
                    await interaction.reply({
                        embeds: [embed],
                    });
                }
            } else {
                // It's a regular message
                await this.message.reply({
                    embeds: [embed],
                });
            }

            // Ask first question
            await this.askNextQuestion();
        } catch (error) {
            logger.error(
                `[QuizSession:${this.sessionId}] Error starting session:`,
                error
            );
            await this.sendError(
                "Đã xảy ra lỗi khi khởi động phiên học."
            );
            this.emit("end");
        }
    }

    /**
     * Load deck items from the deck manager
     */
    private async loadDeckItems(): Promise<
        VocabularyItem[]
    > {
        const deckName = this.options.deckName;

        // Check if we're using a temporary deck first (starts with "temp_" or "review_")
        const isTempDeck =
            deckName.startsWith("temp_") ||
            deckName.startsWith("review_");

        // For temporary decks, try to get items from the quiz manager's temp deck storage
        if (isTempDeck) {
            // We need to access the quiz manager's tempDecks, but it's private
            // Let's try a workaround - checking if we have items in the message metadata
            const tempItems = (this.message as any)
                .tempDeckItems;
            if (
                tempItems &&
                Array.isArray(tempItems) &&
                tempItems.length > 0
            ) {
                logger.debug(
                    `[QuizSession:${this.sessionId}] Using temporary deck items: ${tempItems.length} items`
                );
                return tempItems;
            }
        }

        // If not a temp deck or no temp items found, proceed with normal deck loading
        if (!deckManagerInstance.deckExists(deckName)) {
            logger.error(
                `[QuizSession:${this.sessionId}] Deck not found: ${deckName}`
            );
            throw new Error(`Deck not found: ${deckName}`);
        }

        const items =
            deckManagerInstance.getDeckItems(deckName);
        logger.debug(
            `[QuizSession:${this.sessionId}] Loaded ${items.length} items from deck: ${deckName}`
        );
        return items;
    }

    /**
     * Ask the next question
     */
    private async askNextQuestion(): Promise<void> {
        // Cleanup any existing collectors or timeouts
        this.cleanupCurrentQuestion();

        logger.debug(
            `[QuizSession:${
                this.sessionId
            }] Processing next question (${
                this.correctCount + this.incorrectCount + 1
            }/${this.questions.length})`
        );

        // Get next question from study strategy
        this.currentQuestion =
            this.studyStrategy.getNextQuestion();

        // If no more questions, end the session
        if (!this.currentQuestion) {
            logger.debug(
                `[QuizSession:${
                    this.sessionId
                }] No more questions, ending session after ${
                    this.correctCount + this.incorrectCount
                } questions of ${
                    this.questions.length
                } total`
            );
            await this.endSession();
            return;
        }

        logger.debug(
            `[QuizSession:${this.sessionId}] Current question:`,
            JSON.stringify(this.currentQuestion, null, 2)
        );

        // Send the question based on its type
        if (
            this.currentQuestion.questionType ===
            QuizMode.ReverseMCQ
        ) {
            await this.sendMultipleChoiceQuestion(
                this
                    .currentQuestion as MultipleChoiceQuestion
            );
        } else {
            await this.sendStandardQuestion(
                this.currentQuestion as QuizQuestion
            );
        }

        // Set up collection of answers
        await this.setupAnswerCollection();
    }

    /**
     * Send a standard question to the user
     */
    private async sendStandardQuestion(
        question: QuizQuestion
    ): Promise<void> {
        // Determine question type label
        let questionTypeLabel = "";
        if (question.isReading) {
            questionTypeLabel = "🔊 Đọc";
        } else if (question.isForward) {
            questionTypeLabel = "📝 Nghĩa (Nhật → Việt)";
        } else {
            questionTypeLabel = "💭 Nghĩa (Việt → Nhật)";
        }

        // Determine if we should use an image for Japanese text
        const shouldUseImage =
            question.isReading || question.isForward;
        let questionText;
        let questionImage;

        if (shouldUseImage) {
            // Generate image for Japanese text
            questionImage = this.generateQuestionImage(
                question.question
            );
            questionText = "Xem hình bên dưới";
        } else {
            // For Vietnamese questions, just use normal text
            questionText = `# ${question.question}`;
            questionImage = undefined;
        }

        // Prepare question embed
        const questionEmbed = new EmbedBuilder()
            .setColor("#0099ff" as ColorResolvable)
            .setTitle(
                `Câu hỏi ${
                    this.correctCount +
                    this.incorrectCount +
                    1
                }`
            )
            .setDescription(questionText)
            .addFields({
                name: questionTypeLabel,
                value: `⏱️ ${this.options.timeoutSeconds} giây`,
                inline: true,
            })
            .setFooter({
                text: "Gõ câu trả lời của bạn hoặc 'stop' để kết thúc",
            });

        // If using image, set it as the thumbnail
        if (shouldUseImage) {
            questionEmbed.setImage(
                "attachment://question.png"
            );
        }

        // Send question with or without image
        if ((this.message as any).isInteraction) {
            const interaction = this.message as any;
            const payload =
                shouldUseImage && questionImage
                    ? {
                          embeds: [questionEmbed],
                          files: [questionImage],
                      }
                    : { embeds: [questionEmbed] };

            if (interaction.deferred) {
                await interaction.followUp(payload);
            } else if (!interaction.replied) {
                await interaction.reply(payload);
            } else {
                await interaction.followUp(payload);
            }
        } else {
            if (shouldUseImage && questionImage) {
                await this.message.reply({
                    embeds: [questionEmbed],
                    files: [questionImage],
                });
            } else {
                await this.message.reply({
                    embeds: [questionEmbed],
                });
            }
        }
    }

    /**
     * Send a multiple choice question to the user
     */
    private async sendMultipleChoiceQuestion(
        question: MultipleChoiceQuestion
    ): Promise<void> {
        const options = [
            "A",
            "B",
            "C",
            "D",
            "E",
            "F",
            "G",
            "H",
        ];
        const choiceMap: Record<string, string> = {};

        // Build choices text
        let choicesText = "";
        for (
            let i = 0;
            i < question.choices.length &&
            i < options.length;
            i++
        ) {
            const option = options[i];
            const choice = question.choices[i];
            choiceMap[option] = choice;
            choicesText += `${option}. ${choice}\n`;
        }

        // Store the choice map in the question for answer checking
        (question as any).choiceMap = choiceMap;

        // Prepare question embed
        const questionEmbed = new EmbedBuilder()
            .setColor("#9933ff" as ColorResolvable)
            .setTitle(
                `Câu hỏi ${
                    this.correctCount +
                    this.incorrectCount +
                    1
                }`
            )
            .setDescription(`# ${question.question}`)
            .addFields({
                name: "📋 Chọn đáp án đúng:",
                value: `\`\`\`\n${choicesText}\`\`\``,
                inline: false,
            })
            .addFields({
                name: "🔄 Trắc nghiệm (Việt → Nhật)",
                value: `⏱️ ${this.options.timeoutSeconds} giây`,
                inline: true,
            })
            .setFooter({
                text: "Trả lời bằng chữ cái tương ứng (A, B, C, ...) hoặc 'stop' để kết thúc",
            });

        // Send question
        if ((this.message as any).isInteraction) {
            const interaction = this.message as any;
            const payload = { embeds: [questionEmbed] };

            if (interaction.deferred) {
                await interaction.followUp(payload);
            } else if (!interaction.replied) {
                await interaction.reply(payload);
            } else {
                await interaction.followUp(payload);
            }
        } else {
            await this.message.reply({
                embeds: [questionEmbed],
            });
        }
    }

    /**
     * Setup collection of user answers
     */
    private async setupAnswerCollection(): Promise<void> {
        // Setup message collector for supported channel types
        const channel = this.message.channel;
        if (
            channel instanceof TextChannel ||
            channel instanceof DMChannel ||
            channel instanceof ThreadChannel ||
            channel instanceof NewsChannel
        ) {
            logger.debug(
                `[QuizSession:${this.sessionId}] Setting up message collector with timeout: ${this.options.timeoutSeconds}s`
            );

            const filter = (m: Message) =>
                m.author.id === this.getUserId();

            this.collector = channel.createMessageCollector(
                {
                    filter,
                    time:
                        this.options.timeoutSeconds * 1000,
                    max: 1,
                }
            );

            // Handle answer
            this.collector.on("collect", async (answer) => {
                logger.debug(
                    `[QuizSession:${this.sessionId}] Collected answer: "${answer.content}"`
                );
                await this.processAnswer(answer.content);
            });

            // Handle timeout
            this.collector.on("end", async (collected) => {
                if (collected.size === 0) {
                    logger.debug(
                        `[QuizSession:${this.sessionId}] Timeout - no answer provided`
                    );
                    await this.handleTimeout();
                }
            });
        } else {
            // Handle unsupported channel types
            logger.debug(
                `[QuizSession:${this.sessionId}] Unsupported channel type`
            );
            await this.sendError(
                "Loại kênh này không được hỗ trợ cho phiên học."
            );
            await this.endSession();
        }
    }

    /**
     * Process a user's answer to the current question
     */
    private async processAnswer(
        userAnswer: string
    ): Promise<void> {
        // Clean up collector
        if (this.collector) {
            this.collector.stop();
            this.collector = null;
        }

        // Check for stop command
        if (
            userAnswer.toLowerCase() === "stop" ||
            userAnswer.toLowerCase() === "quit"
        ) {
            logger.debug(
                `[QuizSession:${this.sessionId}] User requested to stop the session`
            );
            await this.endSession();
            return;
        }

        // Cancel timeout if it exists
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }

        if (!this.currentQuestion) {
            logger.error(
                `[QuizSession:${this.sessionId}] No current question to process answer for`
            );
            await this.askNextQuestion();
            return;
        }

        logger.debug(
            `[QuizSession:${this.sessionId}] Processing answer: "${userAnswer}" for question type: ${this.currentQuestion.questionType}`
        );

        // Evaluate the answer based on question type
        const evaluation = await this.evaluateAnswer(
            userAnswer,
            this.currentQuestion
        );

        // Process the answer with the study strategy - ignore the returned value
        // We're not going to use the returned next question because it creates double-increments
        this.studyStrategy.processAnswer(
            this.currentQuestion,
            evaluation.isCorrect
        );

        // Update counters
        if (evaluation.isCorrect) {
            this.correctCount++;
            this.streakCount++;
        } else {
            this.incorrectCount++;
            this.streakCount = 0;

            // Add incorrect item to review manager if we're in Reading mode
            // We only add reading mode questions to avoid duplicates
            if (
                this.currentQuestion.questionType ===
                QuizMode.Reading
            ) {
                const userId = this.getUserId();
                reviewManagerInstance.addReviewItem(
                    userId,
                    this.currentQuestion.original
                );
                logger.debug(
                    `[QuizSession:${this.sessionId}] Added item to review list for user ${userId}: ${this.currentQuestion.original.japanese}`
                );
            }
        }

        // Send feedback
        await this.sendAnswerFeedback(
            userAnswer,
            this.currentQuestion,
            evaluation
        );

        // Add a delay before showing the next question (2 seconds)
        await new Promise((resolve) => {
            this.timeout = setTimeout(() => {
                this.timeout = null;
                resolve(null);
            }, 2000);
        });

        // Ask next question
        await this.askNextQuestion();
    }

    /**
     * Evaluate a user's answer to a question
     */
    private async evaluateAnswer(
        userAnswer: string,
        question: BaseQuestion
    ): Promise<{
        isCorrect: boolean;
        explanation: string;
    }> {
        // Multiple choice question evaluation
        if (question.questionType === QuizMode.ReverseMCQ) {
            const mcq = question as MultipleChoiceQuestion;
            const choiceMap = (mcq as any)
                .choiceMap as Record<string, string>;

            // First, normalize the answer (uppercase, trim)
            const normalizedAnswer = userAnswer
                .trim()
                .toUpperCase();

            // Check if it's a valid choice
            if (choiceMap[normalizedAnswer]) {
                const selectedOption =
                    choiceMap[normalizedAnswer];
                const isCorrect =
                    selectedOption === mcq.correctAnswer;

                return {
                    isCorrect,
                    explanation: isCorrect
                        ? `Đúng! "${mcq.question}" là "${mcq.correctAnswer}".`
                        : `Sai. "${mcq.question}" là "${mcq.correctAnswer}", không phải "${selectedOption}".`,
                };
            }

            // Invalid choice
            return {
                isCorrect: false,
                explanation: `Lựa chọn không hợp lệ. Đáp án đúng là "${mcq.correctAnswer}".`,
            };
        }

        // Standard question evaluation
        const stdQuestion = question as QuizQuestion;

        // Normalize both strings for comparison
        const normalizedAnswer =
            this.textConverter.normalizeForComparison(
                userAnswer,
                true
            );
        const normalizedCorrect =
            this.textConverter.normalizeForComparison(
                stdQuestion.answer,
                false
            );

        const isCorrect =
            normalizedAnswer === normalizedCorrect;

        logger.debug(
            `[QuizSession:${this.sessionId}] Reading question comparison: "${normalizedAnswer}" vs "${normalizedCorrect}" = ${isCorrect}`
        );

        return {
            isCorrect,
            explanation: isCorrect
                ? `Đúng! "${stdQuestion.question}" đọc là "${stdQuestion.answer}".`
                : `Sai. "${stdQuestion.question}" đọc là "${stdQuestion.answer}", không phải "${userAnswer}".`,
        };
    }

    /**
     * Send feedback for an answer
     */
    private async sendAnswerFeedback(
        userAnswer: string,
        question: BaseQuestion,
        evaluation: {
            isCorrect: boolean;
            explanation: string;
        }
    ): Promise<void> {
        if (evaluation.isCorrect) {
            // Correct answer feedback
            const correctEmbed = new EmbedBuilder()
                .setColor("#00cc66" as ColorResolvable)
                .setTitle("✅ Chính xác!")
                .setDescription(
                    `## ${evaluation.explanation}`
                );

            // Add vocab info based on question type
            this.addVocabularyInfoFields(
                correctEmbed,
                question
            );

            // Add footer with streak
            correctEmbed.setFooter({
                text: `Chuỗi đúng: ${this.streakCount}`,
            });

            if ((this.message as any).isInteraction) {
                const interaction = this.message as any;
                if (
                    interaction.deferred ||
                    interaction.replied
                ) {
                    await interaction.followUp({
                        embeds: [correctEmbed],
                    });
                } else {
                    await interaction.reply({
                        embeds: [correctEmbed],
                    });
                }
            } else {
                await this.message.reply({
                    embeds: [correctEmbed],
                });
            }
        } else {
            // Incorrect answer feedback
            const incorrectEmbed = new EmbedBuilder()
                .setColor("#ff3366" as ColorResolvable)
                .setTitle("❌ Chưa chính xác!")
                .setDescription(
                    `## ${evaluation.explanation}`
                );

            // Add user's answer
            incorrectEmbed.addFields({
                name: "Câu trả lời của bạn",
                value: userAnswer || "(không có)",
                inline: false,
            });

            // Add vocab info based on question type
            this.addVocabularyInfoFields(
                incorrectEmbed,
                question
            );

            // Add footer with study progress
            const stats =
                this.studyStrategy.getStatistics();
            incorrectEmbed.setFooter({
                text: `Đã học: ${stats.answeredQuestions}/${stats.totalQuestions}`,
            });

            if ((this.message as any).isInteraction) {
                const interaction = this.message as any;
                if (
                    interaction.deferred ||
                    interaction.replied
                ) {
                    await interaction.followUp({
                        embeds: [incorrectEmbed],
                    });
                } else {
                    await interaction.reply({
                        embeds: [incorrectEmbed],
                    });
                }
            } else {
                await this.message.reply({
                    embeds: [incorrectEmbed],
                });
            }
        }
    }

    /**
     * Add vocabulary information fields to an embed
     */
    private addVocabularyInfoFields(
        embed: EmbedBuilder,
        question: BaseQuestion
    ): void {
        const vocab = question.original;

        if (question.questionType === QuizMode.Reading) {
            // For reading questions, highlight both reading and meaning
            embed.addFields(
                {
                    name: "Cách đọc",
                    value: `**${vocab.reading}**`,
                    inline: true,
                },
                {
                    name: "Nghĩa",
                    value: `**${vocab.meaning}**`,
                    inline: true,
                }
            );
        } else {
            // For other question types
            embed.addFields(
                {
                    name: "Nghĩa",
                    value: vocab.meaning,
                    inline: true,
                },
                {
                    name: "Cách đọc",
                    value: vocab.reading,
                    inline: true,
                }
            );
        }

        // Add sino-vietnamese if available
        if (
            vocab.sinoVietnamese &&
            vocab.sinoVietnamese.trim() !== ""
        ) {
            embed.addFields({
                name: "Âm Hán Việt",
                value: vocab.sinoVietnamese,
                inline: true,
            });
        }
    }

    /**
     * Handle timeout when user doesn't answer in time
     */
    private async handleTimeout(): Promise<void> {
        this.incorrectCount++;
        this.streakCount = 0; // Reset streak on timeout
        logger.debug(
            `[QuizSession:${this.sessionId}] Timeout for question, streak reset`
        );

        if (!this.currentQuestion) {
            logger.error(
                `[QuizSession:${this.sessionId}] No current question to handle timeout for`
            );
            await this.askNextQuestion();
            return;
        }

        // Process as incorrect answer for the study strategy - ignore the returned next question
        this.studyStrategy.processAnswer(
            this.currentQuestion,
            false
        );

        // Add timeout item to review manager if we're in Reading mode
        if (
            this.currentQuestion.questionType ===
            QuizMode.Reading
        ) {
            const userId = this.getUserId();
            reviewManagerInstance.addReviewItem(
                userId,
                this.currentQuestion.original
            );
            logger.debug(
                `[QuizSession:${this.sessionId}] Added timeout item to review list for user ${userId}: ${this.currentQuestion.original.japanese}`
            );
        }

        // Get the correct answer based on question type
        let correctAnswer = "";
        let explanation = "";

        if (
            this.currentQuestion.questionType ===
            QuizMode.ReverseMCQ
        ) {
            const mcq = this
                .currentQuestion as MultipleChoiceQuestion;
            correctAnswer = mcq.correctAnswer;
            explanation = `"${mcq.question}" trong tiếng Nhật là "${correctAnswer}".`;
        } else {
            const stdQuestion = this
                .currentQuestion as QuizQuestion;
            correctAnswer = stdQuestion.answer;
            explanation = stdQuestion.isReading
                ? `"${stdQuestion.question}" đọc là "${correctAnswer}".`
                : stdQuestion.isForward
                ? `"${stdQuestion.question}" có nghĩa là "${correctAnswer}".`
                : `"${stdQuestion.question}" trong tiếng Nhật là "${correctAnswer}".`;
        }

        // Create timeout feedback
        const timeoutEmbed = new EmbedBuilder()
            .setColor("#ff9900" as ColorResolvable)
            .setTitle("⏰ Hết thời gian!")
            .setDescription(`## ${explanation}`);

        // Add vocabulary info
        this.addVocabularyInfoFields(
            timeoutEmbed,
            this.currentQuestion
        );

        // Add footer
        timeoutEmbed.setFooter({
            text: `Đã học: ${
                this.correctCount + this.incorrectCount
            }/${
                this.studyStrategy.getStatistics()
                    .totalQuestions
            }`,
        });

        if ((this.message as any).isInteraction) {
            const interaction = this.message as any;
            if (
                interaction.deferred ||
                interaction.replied
            ) {
                await interaction.followUp({
                    embeds: [timeoutEmbed],
                });
            } else {
                await interaction.reply({
                    embeds: [timeoutEmbed],
                });
            }
        } else {
            await this.message.reply({
                embeds: [timeoutEmbed],
            });
        }

        // Add a delay before showing the next question (2 seconds)
        await new Promise((resolve) => {
            this.timeout = setTimeout(() => {
                this.timeout = null;
                resolve(null);
            }, 2000);
        });

        // Ask next question
        await this.askNextQuestion();
    }

    /**
     * End the quiz session and show summary
     */
    private async endSession(): Promise<void> {
        // Clean up any active resources
        this.cleanupCurrentQuestion();

        logger.debug(
            `[QuizSession:${this.sessionId}] Ending session, correct: ${this.correctCount}, incorrect: ${this.incorrectCount}`
        );

        const stats = this.studyStrategy.getStatistics();
        const total =
            stats.correctAnswers + stats.incorrectAnswers;
        const percentCorrect =
            total > 0
                ? Math.round(
                      (stats.correctAnswers / total) * 100
                  )
                : 0;

        // Set color based on performance
        let color = "#00cc66"; // Green for 80-100%
        if (percentCorrect < 40) {
            color = "#ff3366"; // Red for 0-40%
        } else if (percentCorrect < 80) {
            color = "#ff9900"; // Orange for 40-80%
        }

        // Create performance feedback message
        let performanceMessage = "";
        if (percentCorrect >= 90) {
            performanceMessage =
                "Xuất sắc! Bạn đã thể hiện sự thông thạo tuyệt vời.";
        } else if (percentCorrect >= 80) {
            performanceMessage =
                "Rất tốt! Bạn đã nắm vững hầu hết các từ vựng.";
        } else if (percentCorrect >= 60) {
            performanceMessage =
                "Tốt! Bạn đang tiến bộ. Hãy tiếp tục luyện tập.";
        } else if (percentCorrect >= 40) {
            performanceMessage =
                "Cần cải thiện. Hãy ôn lại các từ vựng trước khi tiếp tục.";
        } else {
            performanceMessage =
                "Cần nỗ lực nhiều hơn. Hãy dành thêm thời gian ôn tập các từ vựng cơ bản.";
        }

        // Create fields for the summary based on study mode
        const summaryFields =
            this.createSummaryFields(stats);

        const summaryEmbed = new EmbedBuilder()
            .setColor(color as ColorResolvable)
            .setTitle("🎓 Kết thúc phiên học!")
            .setDescription(performanceMessage)
            .addFields(summaryFields)
            .setFooter({
                text: "Shinken Japanese Learning Bot | Gõ s!q để bắt đầu phiên mới",
            })
            .setTimestamp();

        if ((this.message as any).isInteraction) {
            const interaction = this.message as any;
            if (
                interaction.deferred ||
                interaction.replied
            ) {
                await interaction.followUp({
                    embeds: [summaryEmbed],
                });
            } else {
                await interaction.reply({
                    embeds: [summaryEmbed],
                });
            }
        } else {
            await this.message.reply({
                embeds: [summaryEmbed],
            });
        }

        this.emit("end");
    }

    /**
     * Create summary fields based on study mode
     */
    private createSummaryFields(
        stats: StudySessionStatistics
    ) {
        const fields = [
            {
                name: "Số câu đúng",
                value: `${stats.correctAnswers}`,
                inline: true,
            },
            {
                name: "Số câu sai",
                value: `${stats.incorrectAnswers}`,
                inline: true,
            },
            {
                name: "Tỉ lệ đúng",
                value: `${
                    Math.round(
                        (stats.correctAnswers /
                            (stats.correctAnswers +
                                stats.incorrectAnswers)) *
                            100
                    ) || 0
                }%`,
                inline: true,
            },
            {
                name: "Tổng thời gian",
                value: this.getSessionDuration(),
                inline: true,
            },
        ];

        // Add spaced repetition specific fields
        if (
            this.options.studyMode === "spaced" &&
            "learnedCount" in stats
        ) {
            fields.push(
                {
                    name: "Đã học",
                    value: `${stats.learnedCount}/${stats.totalQuestions} (${stats.progressPercentage}%)`,
                    inline: true,
                },
                {
                    name: "Đang học",
                    value: `${stats.learningCount}`,
                    inline: true,
                },
                {
                    name: "Chưa học",
                    value: `${stats.notLearnedCount}`,
                    inline: true,
                }
            );
        }

        // Add conquest specific fields
        if (
            this.options.studyMode === "conquest" &&
            "reviewCycles" in stats
        ) {
            fields.push(
                {
                    name: "Số lần ôn tập",
                    value: `${stats.reviewCycles || 0}`,
                    inline: true,
                },
                {
                    name: "Còn lại",
                    value: `${
                        stats.remainingQuestions || 0
                    }`,
                    inline: true,
                }
            );
        }

        return fields;
    }

    /**
     * Clean up resources from the current question
     */
    private cleanupCurrentQuestion(): void {
        // Stop any active collector
        if (this.collector) {
            this.collector.stop();
            this.collector = null;
        }

        // Clear any pending timeout
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    }

    /**
     * Calculate the session duration in a human-readable format
     */
    private getSessionDuration(): string {
        const now = new Date();
        const durationMs =
            now.getTime() - this.startTime.getTime();

        // Convert to seconds, minutes, hours
        const seconds = Math.floor(durationMs / 1000) % 60;
        const minutes =
            Math.floor(durationMs / (1000 * 60)) % 60;
        const hours = Math.floor(
            durationMs / (1000 * 60 * 60)
        );

        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Send an error message to the user
     */
    private async sendError(
        message: string
    ): Promise<void> {
        const errorEmbed = new EmbedBuilder()
            .setColor("#ff0000" as ColorResolvable)
            .setTitle("❌ Lỗi")
            .setDescription(message)
            .setTimestamp();

        // Check if message is actually an interaction
        if ((this.message as any).isInteraction) {
            const interaction = this.message as any;
            // Check if the interaction is deferred or replied
            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [errorEmbed],
                });
            } else if (!interaction.replied) {
                await interaction.reply({
                    embeds: [errorEmbed],
                });
            }
        } else {
            // It's a regular message
            await this.message.reply({
                embeds: [errorEmbed],
            });
        }
    }

    /**
     * Create the initial welcome embed
     */
    private createStartEmbed(): EmbedBuilder {
        const { mode, studyMode, range, timeoutSeconds } =
            this.options;

        let modeName = "";
        switch (mode) {
            case QuizMode.Reading:
                modeName = "Đọc (Nhật → Âm)";
                break;
            case QuizMode.ReverseMCQ:
                modeName = "Trắc nghiệm (Việt → Nhật)";
                break;
            case QuizMode.Mixed:
                modeName = "Hỗn hợp";
                break;
            default:
                modeName = "Không xác định";
        }

        let studyModeName = "";
        switch (studyMode) {
            case "standard":
                studyModeName = "Tiêu chuẩn";
                break;
            case "conquest":
                studyModeName = "Chinh phục";
                break;
            case "spaced":
                studyModeName = "Spaced Repetition";
                break;
            case "learn":
                studyModeName = "Học";
                break;
            default:
                studyModeName = studyMode;
        }

        return new EmbedBuilder()
            .setColor("#00cc99" as ColorResolvable)
            .setTitle("🚀 Bắt đầu phiên học")
            .setDescription(
                "Hãy trả lời các câu hỏi bằng cách gõ câu trả lời của bạn trong chat. " +
                    "Gõ `stop` để kết thúc phiên học."
            )
            .addFields(
                {
                    name: "Số câu hỏi",
                    value: `${this.questions.length}`,
                    inline: true,
                },
                {
                    name: "Chế độ học",
                    value: modeName,
                    inline: true,
                },
                {
                    name: "Phương pháp",
                    value: studyModeName,
                    inline: true,
                },
                {
                    name: "Thời gian trả lời",
                    value: `${timeoutSeconds} giây/câu`,
                    inline: true,
                }
            )
            .setFooter({
                text: "Shinken Japanese Learning Bot",
            })
            .setTimestamp();
    }

    /**
     * Generate an image for a Japanese question
     */
    private generateQuestionImage(
        questionText: string
    ): AttachmentBuilder {
        const canvas = createCanvas(500, 400);
        const ctx = canvas.getContext("2d");

        // Fill background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 500, 400);

        ctx.fillStyle = "#000000";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Conservative bounds
        const maxWidth = 420;
        const maxHeight = 250;

        // Start with a reasonable font size based on text length
        let fontSize = Math.min(
            100,
            Math.max(30, 600 / questionText.length)
        );

        // Fine-tune the font size
        while (fontSize > 15) {
            ctx.font = `bold ${fontSize}px 'Noto Sans JP', 'Arial', sans-serif`;
            const metrics = ctx.measureText(questionText);

            // Check if it fits with some margin
            if (metrics.width <= maxWidth) {
                break;
            }

            fontSize -= 2;
        }

        // Final safety check
        ctx.font = `bold ${fontSize}px 'Noto Sans JP', 'Arial', sans-serif`;
        const finalMetrics = ctx.measureText(questionText);

        if (finalMetrics.width > maxWidth) {
            // Calculate exact scaling factor needed
            const scaleFactor =
                maxWidth / finalMetrics.width;
            fontSize = Math.floor(
                fontSize * scaleFactor * 0.95
            );
            fontSize = Math.max(fontSize, 16); // Absolute minimum
        }

        // Set final font
        ctx.font = `bold ${fontSize}px 'Noto Sans JP', 'Arial', sans-serif`;

        // Minimal stroke for clarity
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.5;
        ctx.strokeText(questionText, 250, 200);

        // Draw main text
        ctx.fillText(questionText, 250, 200);

        const buffer = canvas.toBuffer("image/png");
        return new AttachmentBuilder(buffer, {
            name: "question.png",
        });
    }
}
