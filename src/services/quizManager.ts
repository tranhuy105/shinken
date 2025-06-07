import {
    APIEmbedField,
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
import { QuizQuestion } from "../models/QuizTypes";
import deckManagerInstance from "./deckManagerInstance";
import { JapaneseTextConverter } from "./JapaneseTextConverter";
import { LlmService } from "./llmService";
import { QuizGenerator } from "./QuizGenerator";
import settingsInstance from "./settingsInstance";
import {
    QuestionState,
    SpacedRepetitionQuestion,
    SpacedRepetitionService,
} from "./SpacedRepetitionService";

/**
 * Class to manage Japanese quiz sessions
 */
export class JapaneseQuizManager {
    private sessionMap: Map<string, QuizSession>;
    private llmService: LlmService;
    private quizGenerator: QuizGenerator;
    private textConverter: JapaneseTextConverter;

    constructor() {
        this.sessionMap = new Map();
        this.llmService = new LlmService();
        this.quizGenerator = new QuizGenerator();
        this.textConverter = new JapaneseTextConverter();

        console.log(
            "[QuizManager] Initializing quiz manager"
        );
    }

    /**
     * List all available decks
     */
    public listAvailableDecks(): string[] {
        return deckManagerInstance.listAvailableDecks();
    }

    /**
     * Start a new quiz session
     */
    public async startSession(
        message: Message | any,
        deckName: string = "",
        mode: number = 0,
        range: string = "all",
        timeoutSeconds: number = 0,
        studyMode: string = ""
    ): Promise<void> {
        // Check if user already has an active session
        const userId = message.author.id;
        const existingSession = Array.from(
            this.sessionMap.values()
        ).find((session) => session.getUserId() === userId);

        if (existingSession) {
            console.log(
                `[QuizManager] User ${userId} already has an active session`
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
        deckName = deckName || quizSettings.defaultDeck;
        mode = mode || quizSettings.defaultMode;
        timeoutSeconds =
            timeoutSeconds ||
            quizSettings.defaultTimeoutSeconds;
        studyMode =
            studyMode || quizSettings.defaultStudyMode;

        console.log(
            `[QuizManager] Starting session with deck: ${deckName}, mode: ${mode}, range: ${range}`
        );
        try {
            // Check if deck exists
            if (!deckManagerInstance.deckExists(deckName)) {
                console.log(
                    `[QuizManager] Deck not found: ${deckName}`
                );
                const errorEmbed = new EmbedBuilder()
                    .setColor("#ff0000" as ColorResolvable)
                    .setTitle("❌ Lỗi")
                    .setDescription(
                        `Không tìm thấy bộ thẻ "${deckName}". Sử dụng \`sk!d\` để xem các bộ thẻ có sẵn.`
                    )
                    .setTimestamp();

                await message.reply({
                    embeds: [errorEmbed],
                });
                return;
            }

            // Get deck items
            const deck =
                deckManagerInstance.getDeckItems(deckName);
            if (deck.length === 0) {
                console.log(
                    `[QuizManager] Deck is empty: ${deckName}`
                );
                const errorEmbed = new EmbedBuilder()
                    .setColor("#ff0000" as ColorResolvable)
                    .setTitle("❌ Lỗi")
                    .setDescription(
                        `Bộ thẻ "${deckName}" không có từ vựng nào.`
                    )
                    .setTimestamp();

                await message.reply({
                    embeds: [errorEmbed],
                });
                return;
            }

            // Parse range
            let startIndex = 0;
            let endIndex = deck.length - 1;

            if (range !== "all") {
                console.log(
                    `[QuizManager] Parsing range: ${range}`
                );
                const rangeParts = range.split("-");
                if (rangeParts.length === 2) {
                    startIndex =
                        parseInt(rangeParts[0], 10) - 1;
                    endIndex =
                        parseInt(rangeParts[1], 10) - 1;
                } else if (rangeParts.length === 1) {
                    const singleIndex =
                        parseInt(rangeParts[0], 10) - 1;
                    if (!isNaN(singleIndex)) {
                        startIndex = singleIndex;
                        endIndex = singleIndex;
                    }
                }
                console.log(
                    `[QuizManager] Parsed range: ${
                        startIndex + 1
                    }-${endIndex + 1}`
                );
            }

            // Validate range
            if (
                isNaN(startIndex) ||
                isNaN(endIndex) ||
                startIndex < 0 ||
                endIndex >= deck.length ||
                startIndex > endIndex
            ) {
                startIndex = Math.max(0, startIndex);
                endIndex = Math.min(
                    deck.length - 1,
                    endIndex
                );
            }

            // Generate questions
            const questions =
                this.quizGenerator.generateQuestions(
                    deck,
                    mode,
                    startIndex,
                    endIndex
                );

            // Create session
            const sessionId = `${
                message.author.id
            }-${Date.now()}`;
            console.log(
                `[QuizManager] Creating session with ID: ${sessionId}, questions: ${questions.length}`
            );
            const session = new QuizSession(
                sessionId,
                message,
                questions,
                timeoutSeconds,
                studyMode,
                this.llmService,
                this.textConverter,
                mode
            );

            // Save and start session
            this.sessionMap.set(sessionId, session);
            session.start();

            // Clean up when session ends
            session.on("end", () => {
                console.log(
                    `[QuizManager] Session ended: ${sessionId}`
                );
                this.sessionMap.delete(sessionId);
            });
        } catch (error) {
            console.error(
                "[QuizManager] Error starting quiz session:",
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
}

/**
 * Class representing a quiz session
 */
class QuizSession extends EventEmitter {
    private message: Message;
    private questions: QuizQuestion[];
    private currentQuestion: SpacedRepetitionQuestion | null;
    private timeoutSeconds: number;
    private studyMode: string;
    private collector: MessageCollector | null;
    private timeout: NodeJS.Timeout | null;
    private sessionId: string;
    private correctCount: number;
    private incorrectCount: number;
    private llmService: LlmService;
    private textConverter: JapaneseTextConverter;
    private spacedRepetitionService: SpacedRepetitionService;
    private mode: number;
    private startTime: Date;
    private streakCount: number;

    constructor(
        sessionId: string,
        message: Message,
        questions: QuizQuestion[],
        timeoutSeconds: number,
        studyMode: string,
        llmService: LlmService,
        textConverter: JapaneseTextConverter,
        mode: number
    ) {
        super();
        this.sessionId = sessionId;
        this.message = message;
        this.currentQuestion = null;
        this.timeoutSeconds = timeoutSeconds;
        this.studyMode = studyMode;
        this.collector = null;
        this.timeout = null;
        this.correctCount = 0;
        this.incorrectCount = 0;
        this.llmService = llmService;
        this.textConverter = textConverter;
        this.mode = mode;
        this.startTime = new Date();
        this.streakCount = 0;

        // Initialize with original questions array
        this.questions = questions.slice();

        // Initialize spaced repetition service if using "spaced" study mode
        this.spacedRepetitionService =
            new SpacedRepetitionService(questions);

        console.log(
            `[QuizSession:${sessionId}] Created new session with ${questions.length} questions`
        );
    }

    /**
     * Get the user ID associated with this session
     * @returns The Discord user ID
     */
    public getUserId(): string {
        return this.message.author.id;
    }

    /**
     * Start the quiz session
     */
    public async start(): Promise<void> {
        console.log(
            `[QuizSession:${this.sessionId}] Starting session`
        );
        // Shuffle the questions before starting
        this.questions = this.shuffleQuestions(
            this.questions
        );

        // Get the mode name
        const modeName =
            this.mode === 0
                ? "Tổng hợp"
                : this.mode === 1
                ? "Luyện đọc"
                : "Luyện nghĩa";

        // Get the study mode name
        const studyModeName =
            this.studyMode === "spaced"
                ? "Spaced Repetition"
                : this.studyMode === "conquest"
                ? "Conquest"
                : "Tiêu chuẩn";

        // Create embed fields
        const embedFields: APIEmbedField[] = [
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
                value: `${this.timeoutSeconds} giây/câu`,
                inline: true,
            },
        ];

        const embed = new EmbedBuilder()
            .setColor("#00cc99" as ColorResolvable)
            .setTitle("🚀 Bắt đầu phiên học")
            .setDescription(
                "Hãy trả lời các câu hỏi bằng cách gõ câu trả lời của bạn trong chat. " +
                    "Gõ `stop` để kết thúc phiên học."
            )
            .addFields(embedFields)
            .setFooter({
                text: "Shinken Japanese Learning Bot",
            })
            .setTimestamp();

        await this.message.reply({ embeds: [embed] });
        await this.askNextQuestion();
    }

    /**
     * Shuffle questions using Fisher-Yates algorithm
     */
    private shuffleQuestions(
        questions: QuizQuestion[]
    ): QuizQuestion[] {
        console.log(
            `[QuizSession:${this.sessionId}] Shuffling ${questions.length} questions`
        );
        const newArray = [...questions];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [
                newArray[j],
                newArray[i],
            ];
        }
        return newArray;
    }

    /**
     * Ask the next question in the queue
     */
    private async askNextQuestion(): Promise<void> {
        console.log(
            `[QuizSession:${this.sessionId}] Processing next question`
        );

        let nextQuestion:
            | SpacedRepetitionQuestion
            | QuizQuestion
            | null = null;

        // Get next question based on study mode
        if (this.studyMode === "spaced") {
            // Use spaced repetition service to get next question
            nextQuestion =
                this.spacedRepetitionService.getNextQuestion();

            // If we have no more questions, end the session
            if (!nextQuestion) {
                console.log(
                    `[QuizSession:${this.sessionId}] No more questions in spaced repetition, ending session`
                );
                await this.endSession();
                return;
            }

            this.currentQuestion =
                nextQuestion as SpacedRepetitionQuestion;
        } else if (this.studyMode === "conquest") {
            // Original conquest mode logic
            if (
                this.questions.length === 0 &&
                this.incorrectQuestions.length === 0
            ) {
                console.log(
                    `[QuizSession:${this.sessionId}] No more questions, ending session`
                );
                await this.endSession();
                return;
            }

            if (
                this.questions.length === 0 &&
                this.incorrectQuestions.length > 0
            ) {
                console.log(
                    `[QuizSession:${this.sessionId}] Starting review of ${this.incorrectQuestions.length} incorrect questions`
                );
                this.questions = this.shuffleQuestions([
                    ...this.incorrectQuestions,
                ]);
                this.incorrectQuestions = [];

                const reviewEmbed = new EmbedBuilder()
                    .setColor("#ff9900" as ColorResolvable)
                    .setTitle("🔍 Ôn tập")
                    .setDescription(
                        `Bắt đầu ôn tập ${this.questions.length} câu trả lời sai.`
                    )
                    .setTimestamp();

                await this.message.reply({
                    embeds: [reviewEmbed],
                });
            }

            nextQuestion = this.questions.shift() || null;
            if (!nextQuestion) {
                console.log(
                    `[QuizSession:${this.sessionId}] No more questions, ending session`
                );
                await this.endSession();
                return;
            }
        } else {
            // Standard mode - just get the next question
            if (this.questions.length === 0) {
                console.log(
                    `[QuizSession:${this.sessionId}] No more questions, ending session`
                );
                await this.endSession();
                return;
            }

            nextQuestion = this.questions.shift() || null;
            if (!nextQuestion) {
                console.log(
                    `[QuizSession:${this.sessionId}] No more questions, ending session`
                );
                await this.endSession();
                return;
            }
        }

        console.log(
            `[QuizSession:${this.sessionId}] Current question: ${nextQuestion.question} → ${nextQuestion.answer}`
        );

        // Determine question type label
        let questionTypeLabel = "";
        if (nextQuestion.isReading) {
            questionTypeLabel = "🔊 Đọc";
        } else if (nextQuestion.isForward) {
            questionTypeLabel = "📝 Nghĩa (Nhật → Việt)";
        } else {
            questionTypeLabel = "💭 Nghĩa (Việt → Nhật)";
        }

        // Display extra info for spaced repetition mode
        let extraInfo = "";
        if (
            this.studyMode === "spaced" &&
            "state" in nextQuestion
        ) {
            const srQuestion =
                nextQuestion as SpacedRepetitionQuestion;
            extraInfo = `\nTrạng thái: ${
                srQuestion.state ===
                QuestionState.NotLearned
                    ? "Chưa học"
                    : srQuestion.state ===
                      QuestionState.Learning
                    ? "Đang học"
                    : "Đã học"
            }`;

            if (
                srQuestion.state === QuestionState.Learning
            ) {
                extraInfo += `\nCần trả lời đúng thêm: ${srQuestion.remainingReviews} lần`;
            }
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
            .setDescription(
                `**${nextQuestion.question}**${extraInfo}`
            )
            .addFields(
                {
                    name: "Loại câu hỏi",
                    value: questionTypeLabel,
                    inline: true,
                },
                {
                    name: "Thời gian",
                    value: `${this.timeoutSeconds} giây`,
                    inline: true,
                }
            )
            .setFooter({
                text: "Gõ câu trả lời của bạn trong chat (hoặc gõ 'stop' để kết thúc)",
            })
            .setTimestamp();

        // Send question
        await this.message.reply({
            embeds: [questionEmbed],
        });

        // Setup message collector for supported channel types
        const channel = this.message.channel;
        if (
            channel instanceof TextChannel ||
            channel instanceof DMChannel ||
            channel instanceof ThreadChannel ||
            channel instanceof NewsChannel
        ) {
            console.log(
                `[QuizSession:${this.sessionId}] Setting up message collector with timeout: ${this.timeoutSeconds}s`
            );
            const filter = (m: Message) =>
                m.author.id === this.message.author.id;
            this.collector = channel.createMessageCollector(
                {
                    filter,
                    time: this.timeoutSeconds * 1000,
                    max: 1,
                }
            );

            // Handle answer
            this.collector.on("collect", async (answer) => {
                console.log(
                    `[QuizSession:${this.sessionId}] Collected answer: "${answer.content}"`
                );
                await this.processAnswer(
                    answer.content,
                    nextQuestion as QuizQuestion
                );
            });

            // Handle timeout
            this.collector.on("end", async (collected) => {
                if (collected.size === 0) {
                    console.log(
                        `[QuizSession:${this.sessionId}] Timeout - no answer provided`
                    );
                    await this.handleTimeout(
                        nextQuestion as QuizQuestion
                    );
                }
            });
        } else {
            // Handle unsupported channel types
            console.log(
                `[QuizSession:${this.sessionId}] Unsupported channel type`
            );
            const errorEmbed = new EmbedBuilder()
                .setColor("#ff0000" as ColorResolvable)
                .setTitle("❌ Lỗi")
                .setDescription(
                    "Loại kênh này không được hỗ trợ cho phiên học."
                )
                .setTimestamp();

            await this.message.reply({
                embeds: [errorEmbed],
            });
            await this.endSession();
        }
    }

    /**
     * Process a user answer
     */
    private async processAnswer(
        userAnswer: string,
        question: QuizQuestion
    ): Promise<void> {
        // Check for stop command
        if (
            userAnswer.toLowerCase() === "stop" ||
            userAnswer.toLowerCase() === "quit"
        ) {
            console.log(
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

        console.log(
            `[QuizSession:${this.sessionId}] Processing answer: "${userAnswer}" for question: "${question.question}"`
        );

        let evaluation: {
            isCorrect: boolean;
            explanation: string;
        };

        // For reading questions (mode 1) - use normalized comparison with romaji support
        if (question.isReading || this.mode === 1) {
            // Normalize both strings for comparison using our converter
            const normalizedAnswer =
                this.textConverter.normalizeForComparison(
                    userAnswer,
                    true
                );
            const normalizedCorrect =
                this.textConverter.normalizeForComparison(
                    question.answer,
                    false
                );

            const isCorrect =
                normalizedAnswer === normalizedCorrect;

            console.log(
                `[QuizSession:${this.sessionId}] Normalized string comparison: "${normalizedAnswer}" vs "${normalizedCorrect}" = ${isCorrect}`
            );

            evaluation = {
                isCorrect,
                explanation: isCorrect
                    ? `Đúng! "${question.question}" đọc là "${question.answer}".`
                    : `Sai. "${question.question}" đọc là "${question.answer}", không phải "${userAnswer}".`,
            };
        }
        // For meaning questions (mode 2) - use LLM for more flexible matching
        else {
            console.log(
                `[QuizSession:${this.sessionId}] Using LLM to evaluate meaning question`
            );
            try {
                evaluation =
                    await this.llmService.evaluateJapaneseAnswer(
                        question.question,
                        userAnswer,
                        question.answer,
                        question.isReading,
                        question.original.sinoVietnamese
                    );
                console.log(
                    `[QuizSession:${this.sessionId}] LLM evaluation result: ${evaluation.isCorrect}`
                );
            } catch (error) {
                console.error(
                    `[QuizSession:${this.sessionId}] Error evaluating answer with LLM:`,
                    error
                );
                // Fallback to simple comparison
                const isCorrect =
                    userAnswer.toLowerCase().trim() ===
                    question.answer.toLowerCase().trim();
                console.log(
                    `[QuizSession:${this.sessionId}] Fallback to string comparison: ${isCorrect}`
                );
                evaluation = {
                    isCorrect,
                    explanation: isCorrect
                        ? `Đúng! "${question.question}" có nghĩa là "${question.answer}".`
                        : `Sai. "${question.question}" có nghĩa là "${question.answer}", không phải "${userAnswer}".`,
                };
            }
        }

        // Process the answer with spaced repetition if enabled
        if (
            this.studyMode === "spaced" &&
            this.currentQuestion
        ) {
            this.currentQuestion =
                this.spacedRepetitionService.processAnswer(
                    this
                        .currentQuestion as SpacedRepetitionQuestion,
                    evaluation.isCorrect
                );

            // Get statistics for display
            const stats =
                this.spacedRepetitionService.getStatistics();
            console.log(
                `[QuizSession:${this.sessionId}] Spaced repetition stats: ${stats.learnedCount}/${stats.totalQuestions} learned (${stats.progressPercentage}%)`
            );
        }

        // Handle correct answer
        if (evaluation.isCorrect) {
            this.correctCount++;
            this.streakCount++; // Increment streak count for correct answers
            console.log(
                `[QuizSession:${this.sessionId}] Correct answer, total correct: ${this.correctCount}, streak: ${this.streakCount}`
            );

            // Add spaced repetition info if applicable
            let extraInfo = "";
            if (
                this.studyMode === "spaced" &&
                this.currentQuestion
            ) {
                const srQuestion = this
                    .currentQuestion as SpacedRepetitionQuestion;
                extraInfo = `\n\nTrạng thái hiện tại: ${
                    srQuestion.state ===
                    QuestionState.NotLearned
                        ? "Chưa học"
                        : srQuestion.state ===
                          QuestionState.Learning
                        ? "Đang học"
                        : "Đã học"
                }`;

                if (
                    srQuestion.state ===
                    QuestionState.Learning
                ) {
                    extraInfo += `\nCần trả lời đúng thêm: ${srQuestion.remainingReviews} lần`;
                }

                // Add progress info
                const stats =
                    this.spacedRepetitionService.getStatistics();
                extraInfo += `\n\nTiến độ: ${stats.learnedCount}/${stats.totalQuestions} từ (${stats.progressPercentage}%)`;
            }

            // Create fields for correct answer feedback
            const feedbackFields: APIEmbedField[] = [];

            if (question.isReading) {
                feedbackFields.push(
                    {
                        name: "Từ gốc",
                        value: question.original.japanese,
                        inline: true,
                    },
                    {
                        name: "Cách đọc",
                        value: question.original.reading,
                        inline: true,
                    },
                    {
                        name: "Nghĩa",
                        value: question.original.meaning,
                        inline: true,
                    }
                );

                // Add sinoVietnamese if available
                if (
                    question.original.sinoVietnamese &&
                    question.original.sinoVietnamese.trim() !==
                        ""
                ) {
                    feedbackFields.push({
                        name: "Âm Hán Việt",
                        value: question.original
                            .sinoVietnamese,
                        inline: true,
                    });
                }
            } else if (question.isForward) {
                feedbackFields.push(
                    {
                        name: "Từ gốc",
                        value: question.question,
                        inline: true,
                    },
                    {
                        name: "Cách đọc",
                        value: question.original.reading,
                        inline: true,
                    },
                    {
                        name: "Nghĩa",
                        value: question.answer,
                        inline: true,
                    }
                );

                // Add sinoVietnamese if available
                if (
                    question.original.sinoVietnamese &&
                    question.original.sinoVietnamese.trim() !==
                        ""
                ) {
                    feedbackFields.push({
                        name: "Âm Hán Việt",
                        value: question.original
                            .sinoVietnamese,
                        inline: true,
                    });
                }
            } else {
                feedbackFields.push(
                    {
                        name: "Nghĩa",
                        value: question.question,
                        inline: true,
                    },
                    {
                        name: "Từ tiếng Nhật",
                        value: question.original.japanese,
                        inline: true,
                    },
                    {
                        name: "Cách đọc",
                        value: question.original.reading,
                        inline: true,
                    }
                );

                // Add sinoVietnamese if available
                if (
                    question.original.sinoVietnamese &&
                    question.original.sinoVietnamese.trim() !==
                        ""
                ) {
                    feedbackFields.push({
                        name: "Âm Hán Việt",
                        value: question.original
                            .sinoVietnamese,
                        inline: true,
                    });
                }
            }

            const correctEmbed = new EmbedBuilder()
                .setColor("#00cc66" as ColorResolvable)
                .setTitle("✅ Chính xác!")
                .setDescription(
                    evaluation.explanation + extraInfo
                )
                .addFields(feedbackFields)
                .setFooter({
                    text: `Câu đúng: ${this.correctCount} | Chuỗi đúng hiện tại: ${this.streakCount}`,
                })
                .setTimestamp();

            await this.message.reply({
                embeds: [correctEmbed],
            });
        }
        // Handle incorrect answer
        else {
            this.incorrectCount++;
            this.streakCount = 0; // Reset streak count for incorrect answers
            console.log(
                `[QuizSession:${this.sessionId}] Incorrect answer, total incorrect: ${this.incorrectCount}, streak reset`
            );

            // Add to incorrect questions for conquest mode
            if (this.studyMode === "conquest") {
                console.log(
                    `[QuizSession:${this.sessionId}] Adding to incorrect questions for conquest mode`
                );
                this.incorrectQuestions.push(question);
            }

            // Add spaced repetition info if applicable
            let extraInfo = "";
            if (
                this.studyMode === "spaced" &&
                this.currentQuestion
            ) {
                const srQuestion = this
                    .currentQuestion as SpacedRepetitionQuestion;
                extraInfo = `\n\nTrạng thái hiện tại: ${
                    srQuestion.state ===
                    QuestionState.NotLearned
                        ? "Chưa học"
                        : srQuestion.state ===
                          QuestionState.Learning
                        ? "Đang học"
                        : "Đã học"
                }`;

                if (
                    srQuestion.state ===
                    QuestionState.Learning
                ) {
                    extraInfo += `\nCần trả lời đúng thêm: ${srQuestion.remainingReviews} lần`;
                }

                // Add progress info
                const stats =
                    this.spacedRepetitionService.getStatistics();
                extraInfo += `\n\nTiến độ: ${stats.learnedCount}/${stats.totalQuestions} từ (${stats.progressPercentage}%)`;
            }

            // Create fields for the incorrect answer feedback
            const feedbackFields: APIEmbedField[] = [];

            if (question.isReading) {
                feedbackFields.push(
                    {
                        name: "Từ gốc",
                        value: question.original.japanese,
                        inline: true,
                    },
                    {
                        name: "Cách đọc đúng",
                        value: question.original.reading,
                        inline: true,
                    },
                    {
                        name: "Câu trả lời của bạn",
                        value: userAnswer || "(không có)",
                        inline: true,
                    },
                    {
                        name: "Nghĩa",
                        value: question.original.meaning,
                        inline: false,
                    }
                );

                // Add sinoVietnamese if available
                if (
                    question.original.sinoVietnamese &&
                    question.original.sinoVietnamese.trim() !==
                        ""
                ) {
                    feedbackFields.push({
                        name: "Âm Hán Việt",
                        value: question.original
                            .sinoVietnamese,
                        inline: true,
                    });
                }
            } else if (question.isForward) {
                feedbackFields.push(
                    {
                        name: "Từ gốc",
                        value: question.question,
                        inline: true,
                    },
                    {
                        name: "Nghĩa đúng",
                        value: question.original.meaning,
                        inline: true,
                    },
                    {
                        name: "Câu trả lời của bạn",
                        value: userAnswer || "(không có)",
                        inline: true,
                    },
                    {
                        name: "Cách đọc",
                        value: question.original.reading,
                        inline: false,
                    }
                );

                // Add sinoVietnamese if available
                if (
                    question.original.sinoVietnamese &&
                    question.original.sinoVietnamese.trim() !==
                        ""
                ) {
                    feedbackFields.push({
                        name: "Âm Hán Việt",
                        value: question.original
                            .sinoVietnamese,
                        inline: true,
                    });
                }
            } else {
                feedbackFields.push(
                    {
                        name: "Nghĩa",
                        value: question.question,
                        inline: true,
                    },
                    {
                        name: "Từ tiếng Nhật đúng",
                        value: question.original.japanese,
                        inline: true,
                    },
                    {
                        name: "Câu trả lời của bạn",
                        value: userAnswer || "(không có)",
                        inline: true,
                    },
                    {
                        name: "Cách đọc",
                        value: question.original.reading,
                        inline: false,
                    }
                );

                // Add sinoVietnamese if available
                if (
                    question.original.sinoVietnamese &&
                    question.original.sinoVietnamese.trim() !==
                        ""
                ) {
                    feedbackFields.push({
                        name: "Âm Hán Việt",
                        value: question.original
                            .sinoVietnamese,
                        inline: true,
                    });
                }
            }

            const incorrectEmbed = new EmbedBuilder()
                .setColor("#ff3366" as ColorResolvable)
                .setTitle("❌ Chưa chính xác!")
                .setDescription(
                    evaluation.explanation + extraInfo
                )
                .addFields(feedbackFields)
                .setFooter({
                    text: `Câu sai: ${
                        this.incorrectCount
                    } | Đã học: ${
                        this.correctCount +
                        this.incorrectCount
                    }/${this.getTotalQuestions()}`,
                })
                .setTimestamp();

            await this.message.reply({
                embeds: [incorrectEmbed],
            });
        }

        // Ask next question
        await this.askNextQuestion();
    }

    /**
     * Handle timeout when user doesn't answer in time
     */
    private async handleTimeout(
        question: QuizQuestion
    ): Promise<void> {
        this.incorrectCount++;
        this.streakCount = 0; // Reset streak on timeout
        console.log(
            `[QuizSession:${this.sessionId}] Timeout for question: "${question.question}", streak reset`
        );

        // Process as incorrect answer for spaced repetition
        if (
            this.studyMode === "spaced" &&
            this.currentQuestion
        ) {
            this.currentQuestion =
                this.spacedRepetitionService.processAnswer(
                    this
                        .currentQuestion as SpacedRepetitionQuestion,
                    false
                );
        }

        // Add to incorrect questions for conquest mode
        if (this.studyMode === "conquest") {
            console.log(
                `[QuizSession:${this.sessionId}] Adding to incorrect questions for conquest mode due to timeout`
            );
            this.incorrectQuestions.push(question);
        }

        // Add spaced repetition info if applicable
        let extraInfo = "";
        if (
            this.studyMode === "spaced" &&
            this.currentQuestion
        ) {
            const srQuestion = this
                .currentQuestion as SpacedRepetitionQuestion;
            extraInfo = `\n\nTrạng thái hiện tại: ${
                srQuestion.state ===
                QuestionState.NotLearned
                    ? "Chưa học"
                    : srQuestion.state ===
                      QuestionState.Learning
                    ? "Đang học"
                    : "Đã học"
            }`;

            if (
                srQuestion.state === QuestionState.Learning
            ) {
                extraInfo += `\nCần trả lời đúng thêm: ${srQuestion.remainingReviews} lần`;
            }

            // Add progress info
            const stats =
                this.spacedRepetitionService.getStatistics();
            extraInfo += `\n\nTiến độ: ${stats.learnedCount}/${stats.totalQuestions} từ (${stats.progressPercentage}%)`;
        }

        // Create fields for the timeout feedback
        const feedbackFields: APIEmbedField[] = [];

        if (question.isReading) {
            feedbackFields.push(
                {
                    name: "Từ gốc",
                    value: question.original.japanese,
                    inline: true,
                },
                {
                    name: "Cách đọc đúng",
                    value: question.original.reading,
                    inline: true,
                },
                {
                    name: "Nghĩa",
                    value: question.original.meaning,
                    inline: true,
                }
            );

            // Add sinoVietnamese if available
            if (
                question.original.sinoVietnamese &&
                question.original.sinoVietnamese.trim() !==
                    ""
            ) {
                feedbackFields.push({
                    name: "Âm Hán Việt",
                    value: question.original.sinoVietnamese,
                    inline: true,
                });
            }
        } else if (question.isForward) {
            feedbackFields.push(
                {
                    name: "Từ gốc",
                    value: question.question,
                    inline: true,
                },
                {
                    name: "Nghĩa đúng",
                    value: question.original.meaning,
                    inline: true,
                },
                {
                    name: "Cách đọc",
                    value: question.original.reading,
                    inline: true,
                }
            );

            // Add sinoVietnamese if available
            if (
                question.original.sinoVietnamese &&
                question.original.sinoVietnamese.trim() !==
                    ""
            ) {
                feedbackFields.push({
                    name: "Âm Hán Việt",
                    value: question.original.sinoVietnamese,
                    inline: true,
                });
            }
        } else {
            feedbackFields.push(
                {
                    name: "Nghĩa",
                    value: question.question,
                    inline: true,
                },
                {
                    name: "Từ tiếng Nhật đúng",
                    value: question.original.japanese,
                    inline: true,
                },
                {
                    name: "Cách đọc",
                    value: question.original.reading,
                    inline: true,
                }
            );

            // Add sinoVietnamese if available
            if (
                question.original.sinoVietnamese &&
                question.original.sinoVietnamese.trim() !==
                    ""
            ) {
                feedbackFields.push({
                    name: "Âm Hán Việt",
                    value: question.original.sinoVietnamese,
                    inline: true,
                });
            }
        }

        const explanation = question.isReading
            ? `"${question.question}" đọc là "${question.answer}".`
            : question.isForward
            ? `"${question.question}" có nghĩa là "${question.answer}".`
            : `"${question.question}" trong tiếng Nhật là "${question.answer}".`;

        const timeoutEmbed = new EmbedBuilder()
            .setColor("#ff9900" as ColorResolvable)
            .setTitle("⏰ Hết thời gian!")
            .setDescription(
                `Bạn không trả lời kịp thời gian. ${explanation}${extraInfo}`
            )
            .addFields(feedbackFields)
            .setFooter({
                text: `Câu sai: ${
                    this.incorrectCount
                } | Đã học: ${
                    this.correctCount + this.incorrectCount
                }/${this.getTotalQuestions()}`,
            })
            .setTimestamp();

        await this.message.reply({
            embeds: [timeoutEmbed],
        });

        // Ask next question
        await this.askNextQuestion();
    }

    /**
     * End the quiz session and show summary
     */
    private async endSession(): Promise<void> {
        console.log(
            `[QuizSession:${this.sessionId}] Ending session, correct: ${this.correctCount}, incorrect: ${this.incorrectCount}`
        );

        const total =
            this.correctCount + this.incorrectCount;
        const percentCorrect =
            total > 0
                ? Math.round(
                      (this.correctCount / total) * 100
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

        // Create fields for the summary
        const summaryFields: APIEmbedField[] = [
            {
                name: "Số câu đúng",
                value: `${this.correctCount}`,
                inline: true,
            },
            {
                name: "Số câu sai",
                value: `${this.incorrectCount}`,
                inline: true,
            },
            {
                name: "Tỉ lệ đúng",
                value: `${percentCorrect}%`,
                inline: true,
            },
            {
                name: "Tổng thời gian",
                value: this.getSessionDuration(),
                inline: true,
            },
        ];

        // Add spaced repetition stats if applicable
        if (this.studyMode === "spaced") {
            const stats =
                this.spacedRepetitionService.getStatistics();
            summaryFields.push(
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

        const summaryEmbed = new EmbedBuilder()
            .setColor(color as ColorResolvable)
            .setTitle("🎓 Kết thúc phiên học!")
            .setDescription(performanceMessage)
            .addFields(summaryFields)
            .setFooter({
                text: "Shinken Japanese Learning Bot | Gõ sk!q để bắt đầu phiên mới",
            })
            .setTimestamp();

        await this.message.reply({
            embeds: [summaryEmbed],
        });

        this.emit("end");
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

    // For conquest mode compatibility
    private incorrectQuestions: QuizQuestion[] = [];

    /**
     * Calculate the current streak of correct answers
     * @returns Current streak count
     */
    private getCurrentStreak(): number {
        return this.streakCount;
    }

    /**
     * Get the total number of questions in this session
     * @returns Total question count
     */
    private getTotalQuestions(): number {
        if (this.studyMode === "spaced") {
            return this.spacedRepetitionService.getStatistics()
                .totalQuestions;
        } else {
            return (
                this.questions.length +
                this.incorrectQuestions.length
            );
        }
    }
}
