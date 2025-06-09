import * as dotenv from "dotenv";
import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import { getLogger } from "../../utils/logger";

// Ensure environment variables are loaded
dotenv.config();
const logger = getLogger("SettingsManager");

/**
 * Configuration interface for all application settings
 */
export interface AppSettings {
    // Discord bot settings
    discord: {
        prefixes: string[];
        activityStatus: string;
        activityType: number;
    };

    // LLM service settings
    llm: {
        ollama: {
            baseUrl: string;
            defaultModel: string;
            timeout: number;
        };
        gemini: {
            baseUrl: string;
            defaultModel: string;
            minuteLimit: number;
            dayLimit: number;
        };
        retry: {
            maxRetries: number;
            baseDelay: number;
            maxDelay: number;
        };
    };

    // Quiz settings
    quiz: {
        defaultDeck: string;
        defaultTimeoutSeconds: number;
        defaultStudyMode: string;
        defaultMode: number;
    };

    // File paths and directories
    paths: {
        dataDir: string;
        configDir: string;
        decksFile: string;
        persistenceDir: string;
    };
}

/**
 * Default settings - used if config file is missing or incomplete
 */
const DEFAULT_SETTINGS: AppSettings = {
    discord: {
        prefixes: ["s!", "S!", "s！", "S！"],
        activityStatus: "s!help",
        activityType: 2, // Listening
    },
    llm: {
        ollama: {
            baseUrl: "http://localhost:11434",
            defaultModel: "llama3.2:latest",
            timeout: 30000,
        },
        gemini: {
            baseUrl:
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
            defaultModel: "gemini-2.0-flash",
            minuteLimit: 15,
            dayLimit: 1500,
        },
        retry: {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 5000,
        },
    },
    quiz: {
        defaultDeck: "default",
        defaultTimeoutSeconds: 30,
        defaultStudyMode: "conquest",
        defaultMode: 1,
    },
    paths: {
        dataDir: path.join(process.cwd(), "src", "data"),
        configDir: path.join(
            process.cwd(),
            "src",
            "config"
        ),
        decksFile: "decks.json",
        persistenceDir: path.join(
            process.cwd(),
            "src",
            "data"
        ),
    },
};

/**
 * Settings Manager Singleton for centralized application configuration
 */
export class SettingsManager {
    private static instance: SettingsManager;
    private settings: AppSettings;
    private configFile: string;

    private constructor() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.configFile = path.join(
            DEFAULT_SETTINGS.paths.configDir,
            "settings.yaml"
        );
        this.loadSettings();
    }

    /**
     * Get the singleton instance
     */
    public static getInstance(): SettingsManager {
        if (!SettingsManager.instance) {
            SettingsManager.instance =
                new SettingsManager();
        }
        return SettingsManager.instance;
    }

    /**
     * Load settings from YAML file and merge with defaults
     */
    private loadSettings(): void {
        try {
            // Ensure config directory exists
            if (
                !fs.existsSync(
                    path.dirname(this.configFile)
                )
            ) {
                fs.mkdirSync(
                    path.dirname(this.configFile),
                    { recursive: true }
                );
            }

            // Create default config file if it doesn't exist
            if (!fs.existsSync(this.configFile)) {
                this.saveSettings();
                logger.info(
                    `Created default config at ${this.configFile}`
                );
            }

            // Load from YAML file
            const fileContents = fs.readFileSync(
                this.configFile,
                "utf8"
            );
            const yamlSettings = yaml.load(
                fileContents
            ) as Partial<AppSettings>;

            // Deep merge with defaults
            this.settings = this.deepMerge(
                DEFAULT_SETTINGS,
                yamlSettings
            );
            logger.info(
                `Loaded configuration from ${this.configFile}`
            );
        } catch (error) {
            logger.warn(
                `Error loading settings, using defaults: ${error}`
            );
        }
    }

    /**
     * Save current settings to YAML file
     */
    private saveSettings(): void {
        try {
            const yamlStr = yaml.dump(this.settings, {
                indent: 2,
                lineWidth: 120,
                noRefs: true,
            });

            // Ensure config directory exists
            if (
                !fs.existsSync(
                    path.dirname(this.configFile)
                )
            ) {
                fs.mkdirSync(
                    path.dirname(this.configFile),
                    { recursive: true }
                );
            }

            fs.writeFileSync(
                this.configFile,
                yamlStr,
                "utf8"
            );
        } catch (error) {
            logger.error(
                `Failed to save settings: ${error}`
            );
        }
    }

    /**
     * Deep merge objects (for merging loaded config with defaults)
     */
    private deepMerge(target: any, source: any): any {
        if (!source) return target;

        const output = { ...target };

        if (
            this.isObject(target) &&
            this.isObject(source)
        ) {
            Object.keys(source).forEach((key) => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, {
                            [key]: source[key],
                        });
                    } else {
                        output[key] = this.deepMerge(
                            target[key],
                            source[key]
                        );
                    }
                } else {
                    Object.assign(output, {
                        [key]: source[key],
                    });
                }
            });
        }

        return output;
    }

    /**
     * Check if value is an object
     */
    private isObject(item: any): boolean {
        return (
            item &&
            typeof item === "object" &&
            !Array.isArray(item)
        );
    }

    /**
     * Get all settings
     */
    public getSettings(): AppSettings {
        return this.settings;
    }

    /**
     * Get Discord settings
     */
    public getDiscordSettings() {
        return this.settings.discord;
    }

    /**
     * Get LLM settings
     */
    public getLlmSettings() {
        return this.settings.llm;
    }

    /**
     * Get Quiz settings
     */
    public getQuizSettings() {
        return this.settings.quiz;
    }

    /**
     * Get path settings
     */
    public getPathSettings() {
        return this.settings.paths;
    }

    /**
     * Reload settings from disk
     */
    public reload(): void {
        this.loadSettings();
    }
}
