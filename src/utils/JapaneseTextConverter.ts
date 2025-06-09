import * as wanakana from "wanakana";

/**
 * Service for converting between different Japanese text formats
 */
export class JapaneseTextConverter {
    /**
     * Convert romaji to hiragana
     *
     * @param text Romaji text to convert
     * @returns Hiragana text
     */
    public toHiragana(text: string): string {
        return wanakana.toHiragana(text.toLowerCase());
    }

    /**
     * Normalize Japanese text for comparison
     * Removes spaces, converts to lowercase, and converts romaji to hiragana
     *
     * @param text Text to normalize
     * @param convertRomaji Whether to convert romaji to hiragana
     * @returns Normalized text
     */
    public normalizeForComparison(
        text: string,
        convertRomaji: boolean = true
    ): string {
        // Trim and lowercase
        let normalized = text.trim().toLowerCase();

        // Convert romaji to hiragana if needed
        if (convertRomaji && /[a-z]/i.test(normalized)) {
            normalized = this.toHiragana(normalized);
        }

        // Remove spaces
        normalized = normalized.replace(/\s+/g, "");

        return normalized;
    }
}
