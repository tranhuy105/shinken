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
        logger.debug(
            `Initialized with ${questions.length} questions`
        );
    }

    /**
     * Get the next question to ask
     */
    public getNextQuestion(): BaseQuestion | null {
        this.currentQuestionIndex++;

        if (
            this.currentQuestionIndex >=
            this.questions.length
        ) {
            logger.debug(`No more questions available`);
            return null;
        }

        const nextQuestion =
            this.questions[this.currentQuestionIndex];
        logger.debug(
            `Returning question at index ${this.currentQuestionIndex}`
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

        // In standard mode, we just move to the next question
        return this.getNextQuestion();
    }
}
