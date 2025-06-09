import { BaseQuestion, StudyMode } from "../QuizTypes";

/**
 * Interface for study strategies
 */
export interface IStudyStrategy {
    /**
     * Get the next question to ask
     */
    getNextQuestion(): BaseQuestion | null;

    /**
     * Process an answer to a question
     * @param question The question that was answered
     * @param correct Whether the answer was correct
     * @returns The next question to ask, or null if there are no more questions
     */
    processAnswer(
        question: BaseQuestion,
        correct: boolean
    ): BaseQuestion | null;

    /**
     * Get the study mode this strategy implements
     */
    getStudyMode(): StudyMode;

    /**
     * Get statistics about the current session
     */
    getStatistics(): StudySessionStatistics;
}

/**
 * Statistics about a study session
 */
export interface StudySessionStatistics {
    totalQuestions: number;
    answeredQuestions: number;
    correctAnswers: number;
    incorrectAnswers: number;
    progressPercentage: number;
    // Additional statistics based on the specific study mode
    [key: string]: any;
}

/**
 * Abstract base class for study strategies
 */
export abstract class BaseStudyStrategy
    implements IStudyStrategy
{
    protected readonly mode: StudyMode;
    protected questions: BaseQuestion[];
    protected currentQuestionIndex: number;
    protected correctCount: number;
    protected incorrectCount: number;

    constructor(
        mode: StudyMode,
        questions: BaseQuestion[]
    ) {
        this.mode = mode;
        this.questions = questions;
        this.currentQuestionIndex = -1; // No current question yet
        this.correctCount = 0;
        this.incorrectCount = 0;
    }

    /**
     * Get the study mode this strategy implements
     */
    public getStudyMode(): StudyMode {
        return this.mode;
    }

    /**
     * Get statistics about the current session
     */
    public getStatistics(): StudySessionStatistics {
        const total = this.questions.length;
        const answered =
            this.correctCount + this.incorrectCount;

        return {
            totalQuestions: total,
            answeredQuestions: answered,
            correctAnswers: this.correctCount,
            incorrectAnswers: this.incorrectCount,
            progressPercentage: Math.round(
                (answered / total) * 100
            ),
        };
    }

    /**
     * Get the next question to ask
     */
    public abstract getNextQuestion(): BaseQuestion | null;

    /**
     * Process an answer to a question
     */
    public abstract processAnswer(
        question: BaseQuestion,
        correct: boolean
    ): BaseQuestion | null;

    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    protected shuffleArray<T>(array: T[]): T[] {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [
                newArray[j],
                newArray[i],
            ];
        }
        return newArray;
    }
}
