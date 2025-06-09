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

    constructor(questions: BaseQuestion[]) {
        super(StudyMode.Conquest, questions);
        this.incorrectQuestions = [];
        this.reviewMode = false;
        this.reviewCount = 0;
        logger.debug(
            `Initialized with ${questions.length} questions`
        );
    }

    /**
     * Get the next question to ask
     */
    public getNextQuestion(): BaseQuestion | null {
        // If we're in review mode and have no more incorrect questions, we're done
        if (
            this.reviewMode &&
            this.incorrectQuestions.length === 0
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
                this.reviewMode = true;
                this.questions = this.shuffleArray([
                    ...this.incorrectQuestions,
                ]);
                this.incorrectQuestions = [];
                this.currentQuestionIndex = -1; // Reset for the new review queue
                this.reviewCount++;

                logger.debug(
                    `Switching to review mode with ${this.questions.length} questions, ` +
                        `review cycle: ${this.reviewCount}`
                );
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
                `No more questions available in current cycle`
            );
            return null;
        }

        const nextQuestion =
            this.questions[this.currentQuestionIndex];
        logger.debug(
            `Returning ${
                this.reviewMode ? "review" : "initial"
            } question at index ${
                this.currentQuestionIndex
            }`
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

        // Get the next question
        return this.getNextQuestion();
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
