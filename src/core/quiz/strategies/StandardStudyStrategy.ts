import { getLogger } from "../../../utils/logger";
import { BaseQuestion, StudyMode } from "../QuizTypes";
import { BaseStudyStrategy } from "./StudyStrategy";

const logger = getLogger("StandardStudyStrategy");

/**
 * Standard study strategy that proceeds through questions sequentially
 */
export class StandardStudyStrategy extends BaseStudyStrategy {
    constructor(questions: BaseQuestion[]) {
        super(StudyMode.Standard, questions);

        // Shuffle questions for better learning experience
        this.questions = this.shuffleArray([...questions]);

        logger.debug(
            `Initialized with ${questions.length} questions and shuffled them`
        );
    }

    /**
     * Get the next question to ask
     */
    public getNextQuestion(): BaseQuestion | null {
        this.currentQuestionIndex++;

        // Make sure we're not exceeding the actual questions array length
        if (
            this.currentQuestionIndex >=
            this.questions.length
        ) {
            logger.debug(
                `No more questions available, max index reached: ${this.currentQuestionIndex}`
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
            `Returning question at index ${
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
        }

        logger.debug(
            `Processed answer for question ${this.currentQuestionIndex}, correct: ${correct}, ` +
                `correct total: ${this.correctCount}, incorrect total: ${this.incorrectCount}`
        );

        // DO NOT get next question here - we're calling getNextQuestion() twice!
        // Let QuizSession handle getting the next question
        return null;
    }
}
