import {
    QuizQuestion,
    VocabularyItem,
} from "../models/QuizTypes";

/**
 * Class for generating quiz questions based on vocabulary items
 */
export class QuizGenerator {
    /**
     * Generate questions for a quiz based on mode
     * @param items Vocabulary items to use
     * @param mode Quiz mode (0 = all, 1 = reading, 2 = meaning bidirectional)
     * @param startIndex Start index of items to use
     * @param endIndex End index of items to use
     */
    public generateQuestions(
        items: VocabularyItem[],
        mode: number,
        startIndex: number,
        endIndex: number
    ): QuizQuestion[] {
        console.log(
            `[QuizGenerator] Generating questions for mode ${mode} from index ${startIndex} to ${endIndex}`
        );

        const questions: QuizQuestion[] = [];

        for (let i = startIndex; i <= endIndex; i++) {
            const item = items[i];
            console.log(
                `[QuizGenerator] Processing item: ${item.japanese}`
            );

            if (mode === 1 || mode === 0) {
                // Reading mode: Japanese → Reading (Hiragana/Katakana)
                console.log(
                    `[QuizGenerator] Adding reading question: ${item.japanese} → ${item.reading}`
                );
                questions.push({
                    question: item.japanese,
                    answer: item.reading,
                    original: item,
                    isReading: true,
                    isForward: true,
                });
            }

            if (mode === 2 || mode === 0) {
                // Meaning mode - FORWARD: Japanese → Vietnamese
                console.log(
                    `[QuizGenerator] Adding forward meaning question: ${item.japanese} → ${item.meaning}`
                );
                questions.push({
                    question: item.japanese,
                    answer: item.meaning,
                    original: item,
                    isReading: false,
                    isForward: true,
                });

                // Meaning mode - BACKWARD: Vietnamese → Japanese
                console.log(
                    `[QuizGenerator] Adding backward meaning question: ${item.meaning} → ${item.japanese}`
                );
                questions.push({
                    question: item.meaning,
                    answer: item.japanese,
                    original: item,
                    isReading: false,
                    isForward: false,
                });
            }
        }

        console.log(
            `[QuizGenerator] Generated ${questions.length} questions total`
        );
        return questions;
    }

    /**
     * Shuffle array using Fisher-Yates algorithm
     */
    public shuffleArray<T>(array: T[]): T[] {
        console.log(
            `[QuizGenerator] Shuffling array of ${array.length} items`
        );
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
