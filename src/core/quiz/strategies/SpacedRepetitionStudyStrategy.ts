import { getLogger } from "../../../utils/logger";
import { BaseQuestion, StudyMode } from "../QuizTypes";
import {
    BaseStudyStrategy,
    StudySessionStatistics,
} from "./StudyStrategy";

// Get module logger
const logger = getLogger("SpacedRepetitionStudyStrategy");

/**
 * Question state in the spaced repetition system
 */
export enum SpacedRepetitionState {
    NotLearned = 0, // Not yet learned
    Learning = 1, // In the process of learning
    Learned = 2, // Learned well enough
}

/**
 * A question with spaced repetition metadata using SM-2 algorithm
 * See: https://en.wikipedia.org/wiki/SuperMemo#Algorithm_SM-2
 */
interface SpacedRepetitionItem {
    question: BaseQuestion;
    state: SpacedRepetitionState;
    correctCount: number;
    incorrectCount: number;
    lastSeen: number; // Timestamp
    nextReview: number; // Timestamp
    interval: number; // Review interval in days
    easeFactor: number; // E-Factor in SM-2 algorithm (1.3-2.5)
    repetitions: number; // Number of successful repetitions
}

/**
 * SM-2 algorithm configuration
 */
interface SM2Config {
    initialEaseFactor: number; // Starting ease factor
    minEaseFactor: number; // Minimum ease factor allowed
    initialInterval: number; // First interval in days
    correctAnswerMinimum: number; // Minimum correct answers to consider learned
}

/**
 * Spaced repetition study strategy - presents questions based on SuperMemo-2 algorithm
 */
export class SpacedRepetitionStudyStrategy extends BaseStudyStrategy {
    private items: SpacedRepetitionItem[];
    private currentItem: SpacedRepetitionItem | null;
    private learnedCount: number;
    private learningCount: number;

    // SM-2 algorithm configuration
    private readonly config: SM2Config = {
        initialEaseFactor: 2.5,
        minEaseFactor: 1.3,
        initialInterval: 1, // 1 day
        correctAnswerMinimum: 2, // Number of correct answers required to consider "learned"
    };

    constructor(questions: BaseQuestion[]) {
        super(StudyMode.Spaced, questions);

        // Initialize spaced repetition items with SM-2 parameters
        this.items = questions.map((question) => ({
            question,
            state: SpacedRepetitionState.NotLearned,
            correctCount: 0,
            incorrectCount: 0,
            lastSeen: 0,
            nextReview: Date.now(),
            interval: 0, // Will be set to initialInterval on first correct answer
            easeFactor: this.config.initialEaseFactor,
            repetitions: 0,
        }));

        this.currentItem = null;
        this.learnedCount = 0;
        this.learningCount = 0;

        logger.info(
            `Initialized with ${questions.length} questions`
        );
    }

    /**
     * Get the next question to ask based on spaced repetition algorithm
     */
    public getNextQuestion(): BaseQuestion | null {
        const now = Date.now();

        // Find questions that are due for review
        const dueItems = this.items.filter(
            (item) =>
                item.state !==
                    SpacedRepetitionState.Learned &&
                item.nextReview <= now
        );

        if (dueItems.length === 0) {
            // No questions due for review
            logger.debug(`No questions due for review`);

            // Check if all questions are learned
            if (
                this.getLearnedCount() === this.items.length
            ) {
                logger.info(`All questions learned`);
                return null;
            }

            // If nothing is due but not all learned, pick the next closest one
            const sortedItems = [...this.items]
                .filter(
                    (item) =>
                        item.state !==
                        SpacedRepetitionState.Learned
                )
                .sort(
                    (a, b) => a.nextReview - b.nextReview
                );

            if (sortedItems.length > 0) {
                this.currentItem = sortedItems[0];
                logger.debug(
                    `No due items, picking soonest: ` +
                        `due in ${Math.round(
                            (this.currentItem.nextReview -
                                now) /
                                1000
                        )} seconds`
                );
            } else {
                logger.debug(`No items to review`);
                return null;
            }
        } else {
            // Pick a random item from those due for review
            const randomIndex = Math.floor(
                Math.random() * dueItems.length
            );
            this.currentItem = dueItems[randomIndex];
            logger.debug(
                `Selected question with state ` +
                    `${
                        SpacedRepetitionState[
                            this.currentItem.state
                        ]
                    }, correct: ${
                        this.currentItem.correctCount
                    }, ` +
                    `incorrect: ${this.currentItem.incorrectCount}`
            );
        }

        // Update last seen timestamp
        this.currentItem.lastSeen = now;

        return this.currentItem.question;
    }

    /**
     * Process an answer to a question using SM-2 algorithm
     */
    public processAnswer(
        question: BaseQuestion,
        correct: boolean
    ): BaseQuestion | null {
        if (!this.currentItem) {
            logger.error(
                "No current item to process answer for"
            );
            return this.getNextQuestion();
        }

        const now = Date.now();

        // Update base counters
        if (correct) {
            this.correctCount++;
            this.currentItem.correctCount++;

            // Apply SM-2 algorithm for correct answers
            this.currentItem.repetitions++;

            // Calculate new interval based on SM-2
            if (this.currentItem.repetitions === 1) {
                // First successful repetition
                this.currentItem.interval =
                    this.config.initialInterval;
            } else if (this.currentItem.repetitions === 2) {
                // Second successful repetition
                this.currentItem.interval = 6; // 6 days
            } else {
                // Third or more successful repetition
                this.currentItem.interval = Math.round(
                    this.currentItem.interval *
                        this.currentItem.easeFactor
                );
            }

            // Adjust ease factor: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
            // where q is the quality of the response (we use q=5 for correct, q=0 for incorrect)
            const qualityFactor = 5; // Perfect response
            const easeDelta =
                0.1 -
                (5 - qualityFactor) *
                    (0.08 + (5 - qualityFactor) * 0.02);
            this.currentItem.easeFactor = Math.max(
                this.config.minEaseFactor,
                this.currentItem.easeFactor + easeDelta
            );

            // Update next review time (convert days to milliseconds)
            const intervalMs =
                this.currentItem.interval *
                24 *
                60 *
                60 *
                1000;
            this.currentItem.nextReview = now + intervalMs;

            // Update the item's state based on correct answers
            if (
                this.currentItem.correctCount >=
                    this.config.correctAnswerMinimum &&
                this.currentItem.state !==
                    SpacedRepetitionState.Learned
            ) {
                if (
                    this.currentItem.state ===
                    SpacedRepetitionState.NotLearned
                ) {
                    this.learningCount++;
                }

                this.currentItem.state =
                    SpacedRepetitionState.Learning;

                // Check if the item should be marked as learned
                if (this.currentItem.repetitions >= 3) {
                    this.currentItem.state =
                        SpacedRepetitionState.Learned;
                    this.learnedCount++;
                    this.learningCount--;
                }
            }

            logger.debug(
                `Correct answer processed. New state: ${
                    SpacedRepetitionState[
                        this.currentItem.state
                    ]
                }, EF: ${this.currentItem.easeFactor.toFixed(
                    2
                )}, ` +
                    `interval: ${
                        this.currentItem.interval
                    } days, next review: ${new Date(
                        this.currentItem.nextReview
                    ).toLocaleString()}`
            );
        } else {
            this.incorrectCount++;
            this.currentItem.incorrectCount++;

            // Apply SM-2 algorithm for incorrect answers
            this.currentItem.repetitions = 0;

            // Reduce ease factor for incorrect answers
            const qualityFactor = 0; // Incorrect response
            const easeDelta =
                0.1 -
                (5 - qualityFactor) *
                    (0.08 + (5 - qualityFactor) * 0.02);
            this.currentItem.easeFactor = Math.max(
                this.config.minEaseFactor,
                this.currentItem.easeFactor + easeDelta
            );

            // Reset the interval and schedule for quick review
            this.currentItem.interval = 0.25; // Review again in 0.25 days (6 hours)
            this.currentItem.nextReview =
                now +
                this.currentItem.interval *
                    24 *
                    60 *
                    60 *
                    1000;

            // Reset progress if in learning state
            if (
                this.currentItem.state ===
                SpacedRepetitionState.Learning
            ) {
                this.currentItem.correctCount = 0;
            }

            logger.debug(
                `Incorrect answer processed. New state: ${
                    SpacedRepetitionState[
                        this.currentItem.state
                    ]
                }, EF: ${this.currentItem.easeFactor.toFixed(
                    2
                )}, ` +
                    `interval: ${
                        this.currentItem.interval
                    } days, next review in ${Math.round(
                        (this.currentItem.nextReview -
                            now) /
                            1000 /
                            60
                    )} minutes`
            );
        }

        // Get the next question
        return this.getNextQuestion();
    }

    /**
     * Get statistics about the current session
     */
    public getStatistics(): StudySessionStatistics {
        const baseStats = super.getStatistics();

        // Override the total questions value to use the items length
        baseStats.totalQuestions = this.items.length;

        return {
            ...baseStats,
            learnedCount: this.getLearnedCount(),
            learningCount: this.getLearningCount(),
            notLearnedCount: this.getNotLearnedCount(),
            progressPercentage: Math.round(
                (this.getLearnedCount() /
                    this.items.length) *
                    100
            ),
        };
    }

    /**
     * Get the number of learned items
     */
    private getLearnedCount(): number {
        return this.items.filter(
            (item) =>
                item.state === SpacedRepetitionState.Learned
        ).length;
    }

    /**
     * Get the number of items in learning state
     */
    private getLearningCount(): number {
        return this.items.filter(
            (item) =>
                item.state ===
                SpacedRepetitionState.Learning
        ).length;
    }

    /**
     * Get the number of not yet learned items
     */
    private getNotLearnedCount(): number {
        return this.items.filter(
            (item) =>
                item.state ===
                SpacedRepetitionState.NotLearned
        ).length;
    }
}
