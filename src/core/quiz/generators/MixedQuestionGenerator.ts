import { getLogger } from "../../../utils/logger";
import {
    BaseQuestion,
    QuizMode,
    VocabularyItem,
} from "../QuizTypes";
import { MultipleChoiceQuestionGenerator } from "./MultipleChoiceQuestionGenerator";
import { BaseQuestionGenerator } from "./QuestionGenerator";
import { ReadingQuestionGenerator } from "./ReadingQuestionGenerator";

const logger = getLogger("MixedQuestionGenerator");

/**
 * Generator for mixed questions that combines multiple question types
 */
export class MixedQuestionGenerator extends BaseQuestionGenerator<BaseQuestion> {
    private readonly generators: BaseQuestionGenerator<any>[];

    /**
     * Create a new mixed question generator
     * @param includeMCQ Whether to include multiple choice questions
     * @param numChoices Number of choices for MCQs
     */
    constructor(
        includeMCQ: boolean = true,
        numChoices: number = 4
    ) {
        super(QuizMode.Mixed);

        // Initialize all required generators
        this.generators = [new ReadingQuestionGenerator()];

        // Add MCQ generator if requested
        if (includeMCQ) {
            this.generators.push(
                new MultipleChoiceQuestionGenerator(
                    numChoices
                )
            );
        }
    }

    /**
     * Generate mixed questions from vocabulary items
     */
    public generate(
        items: VocabularyItem[],
        startIndex: number,
        endIndex: number
    ): BaseQuestion[] {
        logger.debug(
            `Generating mixed questions from index ${startIndex} to ${endIndex}`
        );

        // Generate questions from all generators
        let allQuestions: BaseQuestion[] = [];

        for (const generator of this.generators) {
            logger.debug(
                `Using generator for mode: ${generator.getMode()}`
            );
            const questions = generator.generate(
                items,
                startIndex,
                endIndex
            );
            allQuestions = [...allQuestions, ...questions];
        }

        // Shuffle all questions
        const shuffledQuestions =
            this.shuffleArray(allQuestions);

        logger.debug(
            `Generated ${shuffledQuestions.length} mixed questions total`
        );
        return shuffledQuestions;
    }
}
