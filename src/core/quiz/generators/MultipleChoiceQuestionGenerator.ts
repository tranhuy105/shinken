import { getLogger } from "../../../utils/logger";
import {
    MultipleChoiceQuestion,
    QuizMode,
    VocabularyItem,
} from "../QuizTypes";
import { BaseQuestionGenerator } from "./QuestionGenerator";

const logger = getLogger("MultipleChoiceQuestionGenerator");

/**
 * Generator for multiple choice questions (Vietnamese → Japanese)
 */
export class MultipleChoiceQuestionGenerator extends BaseQuestionGenerator<MultipleChoiceQuestion> {
    private readonly numChoices: number;

    /**
     * Create a new multiple choice question generator
     * @param numChoices Number of choices to generate (default: 4)
     */
    constructor(numChoices: number = 4) {
        super(QuizMode.ReverseMCQ);
        this.numChoices = numChoices;
    }

    /**
     * Generate multiple choice questions from vocabulary items
     */
    public generate(
        items: VocabularyItem[],
        startIndex: number,
        endIndex: number
    ): MultipleChoiceQuestion[] {
        logger.debug(
            `Generating MCQs from index ${startIndex} to ${endIndex} with ${this.numChoices} choices`
        );

        const questions: MultipleChoiceQuestion[] = [];
        const allItems = [...items]; // Copy all items for distractor selection

        for (let i = startIndex; i <= endIndex; i++) {
            const item = items[i];
            logger.debug(
                `Processing item: ${item.meaning} → ${item.japanese}`
            );

            // Create a question with distractors
            const distractors = this.generateDistractors(
                item,
                allItems,
                this.numChoices - 1
            );

            // Mix the correct answer with distractors
            const choices = this.shuffleArray([
                item.japanese,
                ...distractors,
            ]);

            questions.push({
                question: `Từ tiếng Nhật nào có nghĩa là "${item.meaning}"?`,
                choices,
                correctAnswer: item.japanese,
                original: item,
                questionType: QuizMode.ReverseMCQ,
            });
        }

        logger.debug(
            `Generated ${questions.length} MCQs total`
        );
        return questions;
    }

    /**
     * Generate distractors for a multiple choice question
     * @param correctItem The item with the correct answer
     * @param allItems All available vocabulary items
     * @param count Number of distractors to generate
     */
    private generateDistractors(
        correctItem: VocabularyItem,
        allItems: VocabularyItem[],
        count: number
    ): string[] {
        const distractors: string[] = [];
        const candidateItems = allItems.filter(
            (item) => item.japanese !== correctItem.japanese
        );

        // Shuffle candidates to get random distractors
        const shuffledCandidates =
            this.shuffleArray(candidateItems);

        // Take the first 'count' candidates
        for (
            let i = 0;
            i < Math.min(count, shuffledCandidates.length);
            i++
        ) {
            distractors.push(
                shuffledCandidates[i].japanese
            );

            // If we don't have enough distractors, break early
            if (distractors.length >= count) {
                break;
            }
        }

        return distractors;
    }
}
