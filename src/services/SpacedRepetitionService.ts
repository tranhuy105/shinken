import { QuizQuestion } from "../models/QuizTypes";

/**
 * Types of question states in the spaced repetition system
 */
export enum QuestionState {
    NotLearned = "not_learned",
    Learning = "learning",
    Learned = "learned",
}

/**
 * Interface for questions with spaced repetition metadata
 */
export interface SpacedRepetitionQuestion
    extends QuizQuestion {
    state: QuestionState;
    incorrectCount: number;
    remainingReviews: number;
    nextReviewPosition?: number;
}

/**
 * Service for handling spaced repetition learning algorithm
 */
export class SpacedRepetitionService {
    private questions: SpacedRepetitionQuestion[];
    private currentPosition: number = 0;
    private baseSpacing: number = 4; // Base spacing for incorrect answers

    constructor(initialQuestions: QuizQuestion[]) {
        console.log(
            `[SpacedRepetitionService] Initializing with ${initialQuestions.length} questions`
        );

        // Initialize all questions as not learned
        this.questions = initialQuestions.map((q) => ({
            ...q,
            state: QuestionState.NotLearned,
            incorrectCount: 0,
            remainingReviews: 0,
        }));
        
        // Shuffle questions to randomize the initial order
        this.questions = this.shuffleQuestions(this.questions);
        console.log(`[SpacedRepetitionService] Questions shuffled for randomized learning`);
    }
    
    /**
     * Shuffle questions using Fisher-Yates algorithm
     */
    private shuffleQuestions(
        questions: SpacedRepetitionQuestion[]
    ): SpacedRepetitionQuestion[] {
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
     * Get the next question to show to the user
     * @returns The next question or null if all questions are learned
     */
    public getNextQuestion(): SpacedRepetitionQuestion | null {
        console.log(
            `[SpacedRepetitionService] Getting next question at position ${this.currentPosition}`
        );

        // If we've reached the end of the array, check if we have any more to learn
        if (this.currentPosition >= this.questions.length) {
            console.log(
                `[SpacedRepetitionService] Reached end of questions, checking for more to learn`
            );

            // Filter only questions that are not yet learned
            const activeQuestions = this.questions.filter(
                (q) => q.state !== QuestionState.Learned
            );

            // If no more questions to learn, return null
            if (activeQuestions.length === 0) {
                console.log(
                    `[SpacedRepetitionService] No more questions to learn`
                );
                return null;
            }

            // Reset position to beginning
            this.currentPosition = 0;
        }

        // Find questions that are due for review at the current position
        const dueQuestions = this.questions.filter(
            (q) =>
                q.nextReviewPosition ===
                this.currentPosition
        );

        // If we have questions due for review, pick the first one
        if (dueQuestions.length > 0) {
            console.log(
                `[SpacedRepetitionService] Found ${dueQuestions.length} questions due for review at position ${this.currentPosition}`
            );

            // Mark the question's nextReviewPosition as undefined since we're serving it now
            const nextQuestion = { ...dueQuestions[0] };

            // Find the index of this question in our array
            const index = this.questions.findIndex(
                (q) =>
                    q.question === nextQuestion.question &&
                    q.answer === nextQuestion.answer
            );

            if (index !== -1) {
                this.questions[index].nextReviewPosition =
                    undefined;
            }

            // Increment position for next time
            this.currentPosition++;
            return nextQuestion;
        }

        // If no questions due for review, get the current question if it's not learned
        if (
            this.questions[this.currentPosition].state !==
            QuestionState.Learned
        ) {
            const nextQuestion = {
                ...this.questions[this.currentPosition],
            };
            this.currentPosition++;
            return nextQuestion;
        }

        // Skip learned questions
        this.currentPosition++;
        return this.getNextQuestion();
    }

    /**
     * Process the result of answering a question
     * @param question The question that was answered
     * @param isCorrect Whether the answer was correct
     * @returns Updated question with new state
     */
    public processAnswer(
        question: SpacedRepetitionQuestion,
        isCorrect: boolean
    ): SpacedRepetitionQuestion {
        console.log(
            `[SpacedRepetitionService] Processing answer for question: "${question.question}" - Correct: ${isCorrect}`
        );

        // Find the index of this question in our array
        const index = this.questions.findIndex(
            (q) =>
                q.question === question.question &&
                q.answer === question.answer
        );

        if (index === -1) {
            console.error(
                `[SpacedRepetitionService] Question not found in array:`,
                question
            );
            return question;
        }

        // Get a reference to the question
        const updatedQuestion = this.questions[index];

        // Process correct answer
        if (isCorrect) {
            // If it was in "NotLearned" state and answered correctly, mark as "Learned"
            if (
                updatedQuestion.state ===
                QuestionState.NotLearned
            ) {
                console.log(
                    `[SpacedRepetitionService] Question answered correctly for the first time, marking as Learned`
                );
                updatedQuestion.state =
                    QuestionState.Learned;
            }
            // If it was in "Learning" state, decrement remaining reviews
            else if (
                updatedQuestion.state ===
                QuestionState.Learning
            ) {
                updatedQuestion.remainingReviews--;
                console.log(
                    `[SpacedRepetitionService] Question in Learning state answered correctly, remaining reviews: ${updatedQuestion.remainingReviews}`
                );

                // If no more reviews needed, mark as "Learned"
                if (updatedQuestion.remainingReviews <= 0) {
                    console.log(
                        `[SpacedRepetitionService] All reviews completed for question, marking as Learned`
                    );
                    updatedQuestion.state =
                        QuestionState.Learned;
                } else {
                    // Schedule next review based on current position and a spacing factor
                    // The spacing increases with each correct answer
                    const spacing =
                        this.baseSpacing *
                        (updatedQuestion.incorrectCount +
                            1);
                    const nextPosition =
                        this.currentPosition + spacing;

                    console.log(
                        `[SpacedRepetitionService] Scheduling next review at position ${nextPosition} (current + ${spacing})`
                    );
                    updatedQuestion.nextReviewPosition =
                        nextPosition;
                }
            }
        }
        // Process incorrect answer
        else {
            // Increase incorrect count
            updatedQuestion.incorrectCount++;

            // Set the state to "Learning" if it's not already
            if (
                updatedQuestion.state !==
                QuestionState.Learning
            ) {
                updatedQuestion.state =
                    QuestionState.Learning;
                // Initial remaining reviews is incorrectCount + 1
                updatedQuestion.remainingReviews =
                    updatedQuestion.incorrectCount + 1;
            } else {
                // If already in learning state, increment remaining reviews
                updatedQuestion.remainingReviews =
                    updatedQuestion.incorrectCount + 1;
            }

            console.log(
                `[SpacedRepetitionService] Question answered incorrectly, setting to Learning state with ${updatedQuestion.remainingReviews} remaining reviews`
            );

            // Schedule for review soon (within next few questions)
            const spacing = Math.max(
                1,
                Math.min(
                    3,
                    this.baseSpacing /
                        updatedQuestion.incorrectCount
                )
            );
            const nextPosition =
                this.currentPosition + spacing;

            console.log(
                `[SpacedRepetitionService] Scheduling next review at position ${nextPosition} (current + ${spacing})`
            );
            updatedQuestion.nextReviewPosition =
                nextPosition;
        }

        return { ...updatedQuestion };
    }

    /**
     * Get the current learning statistics
     * @returns Object with statistics about learning progress
     */
    public getStatistics() {
        const totalQuestions = this.questions.length;
        const learnedCount = this.questions.filter(
            (q) => q.state === QuestionState.Learned
        ).length;
        const learningCount = this.questions.filter(
            (q) => q.state === QuestionState.Learning
        ).length;
        const notLearnedCount = this.questions.filter(
            (q) => q.state === QuestionState.NotLearned
        ).length;

        return {
            totalQuestions,
            learnedCount,
            learningCount,
            notLearnedCount,
            progressPercentage: Math.round(
                (learnedCount / totalQuestions) * 100
            ),
        };
    }

    /**
     * Get all questions in their current state
     * @returns Array of all questions with their current state
     */
    public getAllQuestions(): SpacedRepetitionQuestion[] {
        return [...this.questions];
    }
}
