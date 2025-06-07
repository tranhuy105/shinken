# Shinken Japanese Learning Bot

Shinken is a Discord bot designed to help users learn Japanese with intelligent LLM assistance. It offers flashcard-based study sessions with various modes, provides detailed feedback, and keeps track of your learning progress.

## Features

-   **Japanese Vocabulary Practice**: Study Japanese words, their readings, and meanings
-   **Multiple Study Modes**:
    -   **Mode 1**: Reading practice (Kanji → pronunciation)
    -   **Mode 2**: Meaning practice (bidirectional Japanese ↔ Vietnamese)
    -   **Mode 0**: All practice types combined
-   **Smart Feedback**: LLM-powered evaluation of your answers in meaning mode
-   **Intelligent Learning Methods**:
    -   **Conquest Mode**: Repeatedly quiz incorrect answers until mastered
    -   **Spaced Repetition**: Dynamic scheduling of questions based on difficulty and answer history
-   **Flexible Input Support**: Accept romaji input for hiragana answers (e.g., "kuruma" for "くるま")
-   **Customizable Sessions**: Select decks, ranges, modes, and timeouts to fit your learning style
-   **CSV-Based Decks**: Easily create and manage vocabulary decks with simple CSV files

## Commands

-   `sk!quiz [deck] [mode] [range] [timeout] [studymode]` - Start a study session
-   `sk!decks` - List available vocabulary decks
-   `sk!help` - Display help information

## Parameters for sk!quiz

-   **deck**: Name of the flashcard deck (default: "default")
-   **mode**:
    -   0 = All practice types
    -   1 = Reading practice (default)
    -   2 = Meaning practice (bidirectional, doubles the number of questions)
-   **range**: Range of questions to study (e.g., "1-10" or "all") (default: "all")
-   **timeout**: Time limit in seconds per question (default: 30)
-   **studymode**:
    -   "conquest" = Repeat incorrect answers (default)
    -   "standard" = No repetition
    -   "spaced" = Spaced repetition learning

## Study Modes Explained

### Conquest Mode

In conquest mode, any incorrectly answered questions are collected and presented again at the end of the session. This helps reinforce difficult items through immediate repetition.

### Spaced Repetition Mode

Spaced repetition intelligently schedules questions based on your performance:

-   Questions have three states: Not Learned, Learning, and Learned
-   When you answer correctly the first time, the item is marked as Learned
-   When you answer incorrectly, the item enters the Learning state
-   Items in the Learning state need to be answered correctly multiple times
-   The number of required correct answers depends on how many times you've answered incorrectly
-   Questions are automatically rescheduled to reappear after a dynamic interval

### Romaji Input Support

When answering reading questions (hiragana/katakana), you can now type using romaji (Latin alphabet). For example:

-   Question: 車
-   You can answer: "kuruma" (romaji) or "くるま" (hiragana)
-   Case insensitive: "kURumA" is also accepted

## Setup

### Prerequisites

-   Node.js 16.x or higher
-   Discord bot token
-   Local LLM server (Ollama) running llama3 model

### Installation

1. Clone this repository:

```bash
git clone https://github.com/yourusername/shinken.git
cd shinken
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory with your Discord token:

```
DISCORD_TOKEN=your_discord_bot_token
PORT=3000
```

4. Make sure your Ollama server is running with the llama3 model available:

```bash
ollama run llama3
```

5. Build and start the bot:

```bash
npm run build
npm start
```

## Creating Vocabulary Decks

Create CSV files in the `src/data` directory with the following format:

```csv
japanese,reading,meaning
本,ほん,sách
水,みず,nước
人,ひと,người
山,やま,núi
川,かわ,sông
```

Then add the deck information to the `src/data/decks.json` file:

```json
{
    "decks": [
        {
            "name": "default",
            "description": "Default Japanese vocabulary",
            "filename": "default.csv"
        },
        {
            "name": "n5-kanji",
            "description": "JLPT N5 Kanji",
            "filename": "n5-kanji.csv"
        }
    ]
}
```

## Development

To run in development mode with automatic reloading:

```bash
npm run dev
```

## License

This project is licensed under the MIT License.
