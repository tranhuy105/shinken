import { getLogger } from "../../../utils/logger";
import { BaseQuestion, StudyMode } from "../QuizTypes";
import {
    BaseStudyStrategy,
    StudySessionStatistics,
} from "./StudyStrategy";

const logger = getLogger("ConquestStudyStrategy");

/**
 * Conquest study strategy - continues until all questions are answered correctly
 * Incorrect answers are added back to the queue for review
 */
export class ConquestStudyStrategy extends BaseStudyStrategy {
    private incorrectQuestions: BaseQuestion[];
    private reviewMode: boolean;
    private reviewCount: number;
    private shouldSwitchToReview: boolean;

    constructor(questions: BaseQuestion[]) {
        super(StudyMode.Conquest, questions);

        // Shuffle initial questions
        this.questions = this.shuffleArray([...questions]);

        this.incorrectQuestions = [];
        this.reviewMode = false;
        this.reviewCount = 0;
        this.shouldSwitchToReview = false;

        logger.debug(
            `Initialized with ${questions.length} questions and shuffled them`
        );
    }

    /**
     * Get the next question to ask
     */
    public getNextQuestion(): BaseQuestion | null {
        // Check if we need to switch to review mode
        if (this.shouldSwitchToReview) {
            this.reviewMode = true;
            this.questions = this.shuffleArray([
                ...this.incorrectQuestions,
            ]);
            this.incorrectQuestions = [];
            this.currentQuestionIndex = -1; // Reset for the new review queue
            this.reviewCount++;
            this.shouldSwitchToReview = false;

            logger.debug(
                `Switching to review mode with ${this.questions.length} questions, ` +
                    `review cycle: ${this.reviewCount}`
            );
        }

        // If we're in review mode and have no more incorrect questions, we're done
        if (
            this.reviewMode &&
            this.incorrectQuestions.length === 0 &&
            this.currentQuestionIndex >=
                this.questions.length - 1
        ) {
            logger.debug(
                `No more questions to review, all conquered`
            );
            return null;
        }

        // If we've gone through all initial questions, switch to review mode
        if (
            !this.reviewMode &&
            this.currentQuestionIndex >=
                this.questions.length - 1
        ) {
            if (this.incorrectQuestions.length > 0) {
                // Set flag to switch to review mode on next call
                this.shouldSwitchToReview = true;
                logger.debug(
                    `Will switch to review mode on next question`
                );
                return null;
            } else {
                logger.debug(
                    `No incorrect questions to review, all conquered on first try!`
                );
                return null;
            }
        }

        this.currentQuestionIndex++;

        if (
            this.currentQuestionIndex >=
            this.questions.length
        ) {
            logger.debug(
                `No more questions available in current cycle (index: ${this.currentQuestionIndex}, length: ${this.questions.length})`
            );
            return null;
        }

        const nextQuestion =
            this.questions[this.currentQuestionIndex];

        if (!nextQuestion) {
            logger.debug(
                `No question found at index ${this.currentQuestionIndex}`
            );
            return null;
        }

        logger.debug(
            `Returning ${
                this.reviewMode ? "review" : "initial"
            } question at index ${
                this.currentQuestionIndex
            } (${this.currentQuestionIndex + 1}/${
                this.questions.length
            })`
        );
        return nextQuestion;
    }

    /**
     * Process an answer to a question
     */
    public processAnswer(
        question: BaseQuestion,
        correct: boolean
    ): BaseQuestion | null {
        // Record the result
        if (correct) {
            this.correctCount++;
        } else {
            this.incorrectCount++;
            // Add incorrect question to the review list
            this.incorrectQuestions.push(question);
        }

        logger.debug(
            `Processed answer: ${
                correct ? "correct" : "incorrect"
            }, ` +
                `total correct: ${this.correctCount}, total incorrect: ${this.incorrectCount}, ` +
                `questions to review: ${this.incorrectQuestions.length}`
        );

        // Do NOT call getNextQuestion() here - that's handled by QuizSession
        return null;
    }

    /**
     * Get statistics about the current session
     */
    public getStatistics(): StudySessionStatistics {
        const baseStats = super.getStatistics();

        return {
            ...baseStats,
            reviewCycles: this.reviewCount,
            remainingQuestions:
                this.incorrectQuestions.length +
                (this.questions.length -
                    this.currentQuestionIndex -
                    1),
            isInReviewMode: this.reviewMode,
        };
    }
}
