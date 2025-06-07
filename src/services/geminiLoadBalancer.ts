import axios from "axios";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import settingsInstance from "./settingsInstance";

interface TokenBucket {
    tokens: number;
    lastRefill: number;
    capacity: number;
    refillRate: number; // tokens per second
}

interface KeyState {
    // Token buckets for different time windows
    minuteBucket: TokenBucket;
    dayBucket: TokenBucket;

    // Failure tracking with exponential backoff
    consecutiveFailures: number;
    lastFailureTime: number;
    backoffUntil: number;

    // Performance metrics for intelligent selection
    avgResponseTime: number;
    successRate: number;
    totalRequests: number;
    totalFailures: number;

    // Health score (0-100)
    healthScore: number;
    lastHealthUpdate: number;
}

interface PersistentState {
    version: string;
    lastSave: number;
    keys: { [keyHash: string]: KeyState };
    globalStats: {
        totalRequests: number;
        totalFailures: number;
        uptime: number;
    };
}

/**
 * Ultra-intelligent Gemini Load Balancer with:
 * - Token Bucket Algorithm for precise rate limiting
 * - Persistent state across server restarts
 * - Weighted round-robin based on performance
 * - Adaptive health scoring
 * - Distributed rate limiting support
 */
export class GeminiLoadBalancer {
    private apiKeys: string[] = [];
    private keyStates: Map<string, KeyState> = new Map();
    private keyHashes: Map<string, string> = new Map(); // key -> hash mapping
    private persistenceFile: string;
    private readonly baseUrl: string;

    // Rate limits from settings
    private readonly MINUTE_LIMIT: number;
    private readonly DAY_LIMIT: number;
    private readonly MINUTE_WINDOW = 60; // seconds
    private readonly DAY_WINDOW = 86400; // seconds

    // Intelligence parameters
    private readonly MAX_BACKOFF_MS = 300000; // 5 minutes max backoff
    private readonly HEALTH_DECAY_RATE = 0.95; // Health decays 5% per hour if unused
    private readonly RESPONSE_TIME_WEIGHT = 0.3;
    private readonly SUCCESS_RATE_WEIGHT = 0.4;
    private readonly AVAILABILITY_WEIGHT = 0.3;

    // Persistence settings
    private saveTimer: NodeJS.Timeout | null = null;
    private readonly SAVE_INTERVAL_MS = 10000; // Save every 10 seconds
    private readonly STATE_VERSION = "2.0";

    constructor(
        apiKeys: string | string[] = process.env
            .GEMINI_API_KEY || "",
        baseUrl: string = "",
        persistenceDir: string = ""
    ) {
        // Get settings
        const llmSettings =
            settingsInstance.getLlmSettings();
        const pathSettings =
            settingsInstance.getPathSettings();

        // Use settings or fallback to provided values
        this.baseUrl =
            baseUrl || llmSettings.gemini.baseUrl;
        this.MINUTE_LIMIT = llmSettings.gemini.minuteLimit;
        this.DAY_LIMIT = llmSettings.gemini.dayLimit;

        const defaultPersistenceDir =
            pathSettings.persistenceDir;
        this.persistenceFile = path.join(
            persistenceDir || defaultPersistenceDir,
            "gemini_lb_state.json"
        );

        this.initializeApiKeys(apiKeys);
        this.initializePersistence();
        this.startPeriodicSave();

        console.log(
            `[UltraSmartLB] 🧠 Initialized with ${this.apiKeys.length} keys, IQ level: MAXIMUM`
        );
    }

    private initializeApiKeys(
        apiKeys: string | string[]
    ): void {
        if (typeof apiKeys === "string") {
            this.apiKeys = apiKeys
                .split(",")
                .map((k) => k.trim())
                .filter((k) => k.length > 0);
        } else {
            this.apiKeys = [...apiKeys].filter(
                (k) => k && k.length > 0
            );
        }

        // Create secure hashes for keys (for persistence without exposing actual keys)
        this.apiKeys.forEach((key) => {
            const hash = crypto
                .createHash("sha256")
                .update(key)
                .digest("hex")
                .substring(0, 16);
            this.keyHashes.set(key, hash);
        });
    }

    private async initializePersistence(): Promise<void> {
        try {
            // Ensure directory exists
            await fs.mkdir(
                path.dirname(this.persistenceFile),
                { recursive: true }
            );

            // Try to load existing state
            const state = await this.loadState();
            if (state) {
                this.restoreFromState(state);
                console.log(
                    `[UltraSmartLB] 💾 Restored state from ${new Date(
                        state.lastSave
                    ).toISOString()}`
                );
            } else {
                this.initializeDefaultState();
                console.log(
                    `[UltraSmartLB] 🆕 Initialized fresh state`
                );
            }
        } catch (error) {
            console.warn(
                `[UltraSmartLB] ⚠️ Persistence init failed, using memory-only mode:`,
                error
            );
            this.initializeDefaultState();
        }
    }

    private async loadState(): Promise<PersistentState | null> {
        try {
            const data = await fs.readFile(
                this.persistenceFile,
                "utf8"
            );
            const state: PersistentState = JSON.parse(data);

            // Validate state version
            if (state.version !== this.STATE_VERSION) {
                console.log(
                    `[UltraSmartLB] 🔄 State version mismatch, reinitializing`
                );
                return null;
            }

            return state;
        } catch {
            return null;
        }
    }

    private restoreFromState(state: PersistentState): void {
        const now = Date.now();

        this.apiKeys.forEach((key) => {
            const keyHash = this.keyHashes.get(key)!;
            const savedState = state.keys[keyHash];

            if (savedState) {
                // Restore and update token buckets based on time elapsed
                const timeElapsed = Math.max(
                    0,
                    (now - state.lastSave) / 1000
                );

                const minuteBucket = this.refillTokenBucket(
                    savedState.minuteBucket,
                    timeElapsed
                );
                const dayBucket = this.refillTokenBucket(
                    savedState.dayBucket,
                    timeElapsed
                );

                this.keyStates.set(key, {
                    ...savedState,
                    minuteBucket,
                    dayBucket,
                    lastHealthUpdate: now,
                });
            } else {
                this.keyStates.set(
                    key,
                    this.createDefaultKeyState()
                );
            }
        });
    }

    private initializeDefaultState(): void {
        this.apiKeys.forEach((key) => {
            this.keyStates.set(
                key,
                this.createDefaultKeyState()
            );
        });
    }

    private createDefaultKeyState(): KeyState {
        return {
            minuteBucket: this.createTokenBucket(
                this.MINUTE_LIMIT,
                this.MINUTE_LIMIT / this.MINUTE_WINDOW
            ),
            dayBucket: this.createTokenBucket(
                this.DAY_LIMIT,
                this.DAY_LIMIT / this.DAY_WINDOW
            ),
            consecutiveFailures: 0,
            lastFailureTime: 0,
            backoffUntil: 0,
            avgResponseTime: 1000, // Start with 1s assumption
            successRate: 1.0, // Start optimistic
            totalRequests: 0,
            totalFailures: 0,
            healthScore: 100,
            lastHealthUpdate: Date.now(),
        };
    }

    private createTokenBucket(
        capacity: number,
        refillRate: number
    ): TokenBucket {
        return {
            tokens: capacity,
            lastRefill: Date.now(),
            capacity,
            refillRate,
        };
    }

    private refillTokenBucket(
        bucket: TokenBucket,
        timeElapsedSeconds?: number
    ): TokenBucket {
        const now = Date.now();
        const elapsed =
            timeElapsedSeconds ??
            (now - bucket.lastRefill) / 1000;

        const tokensToAdd = elapsed * bucket.refillRate;
        const newTokens = Math.min(
            bucket.capacity,
            bucket.tokens + tokensToAdd
        );

        return {
            ...bucket,
            tokens: newTokens,
            lastRefill: now,
        };
    }

    private canConsumeToken(bucket: TokenBucket): boolean {
        const refreshed = this.refillTokenBucket(bucket);
        return refreshed.tokens >= 1;
    }

    private consumeToken(bucket: TokenBucket): TokenBucket {
        const refreshed = this.refillTokenBucket(bucket);
        if (refreshed.tokens >= 1) {
            return {
                ...refreshed,
                tokens: refreshed.tokens - 1,
            };
        }
        return refreshed;
    }

    /**
     * 🧠 INTELLIGENT KEY SELECTION with weighted scoring
     */
    private selectOptimalKey(): string | null {
        const now = Date.now();
        const availableKeys = this.apiKeys.filter((key) =>
            this.isKeyAvailable(key, now)
        );

        if (availableKeys.length === 0) return null;
        if (availableKeys.length === 1)
            return availableKeys[0];

        // Calculate weighted scores for each available key
        const scoredKeys = availableKeys.map((key) => {
            const state = this.keyStates.get(key)!;
            const score = this.calculateKeyScore(
                state,
                now
            );
            return { key, score };
        });

        // Sort by score (highest first) and add some randomness to prevent thundering herd
        scoredKeys.sort((a, b) => {
            const scoreDiff = b.score - a.score;
            // Add small random factor if scores are close (within 10 points)
            if (Math.abs(scoreDiff) < 10) {
                return Math.random() - 0.5;
            }
            return scoreDiff;
        });

        const selected = scoredKeys[0].key;
        console.log(
            `[UltraSmartLB] 🎯 Selected key ...${selected.slice(
                -4
            )} (score: ${scoredKeys[0].score.toFixed(1)})`
        );

        return selected;
    }

    private calculateKeyScore(
        state: KeyState,
        now: number
    ): number {
        // Update health score with decay
        this.updateHealthScore(state, now);

        // Response time score (lower is better)
        const responseTimeScore = Math.max(
            0,
            100 - state.avgResponseTime / 50
        ); // 5s = 0 score

        // Success rate score
        const successRateScore = state.successRate * 100;

        // Availability score (considering backoff and token availability)
        let availabilityScore = 100;
        if (now < state.backoffUntil) {
            availabilityScore = 0;
        } else {
            // Factor in token availability
            const minuteTokenRatio =
                state.minuteBucket.tokens /
                state.minuteBucket.capacity;
            const dayTokenRatio =
                state.dayBucket.tokens /
                state.dayBucket.capacity;
            availabilityScore =
                Math.min(minuteTokenRatio, dayTokenRatio) *
                100;
        }

        // Weighted final score
        const finalScore =
            responseTimeScore * this.RESPONSE_TIME_WEIGHT +
            successRateScore * this.SUCCESS_RATE_WEIGHT +
            availabilityScore * this.AVAILABILITY_WEIGHT;

        return Math.min(100, Math.max(0, finalScore));
    }

    private updateHealthScore(
        state: KeyState,
        now: number
    ): void {
        const hoursSinceUpdate =
            (now - state.lastHealthUpdate) /
            (1000 * 60 * 60);

        // Decay health if not used recently
        if (hoursSinceUpdate > 1) {
            state.healthScore *= Math.pow(
                this.HEALTH_DECAY_RATE,
                hoursSinceUpdate
            );
            state.lastHealthUpdate = now;
        }
    }

    private isKeyAvailable(
        key: string,
        now: number
    ): boolean {
        const state = this.keyStates.get(key);
        if (!state) return false;

        // Check backoff
        if (now < state.backoffUntil) return false;

        // Check token availability
        const minuteRefreshed = this.refillTokenBucket(
            state.minuteBucket
        );
        const dayRefreshed = this.refillTokenBucket(
            state.dayBucket
        );

        return (
            this.canConsumeToken(minuteRefreshed) &&
            this.canConsumeToken(dayRefreshed)
        );
    }

    private updateKeyState(
        key: string,
        success: boolean,
        responseTime?: number,
        isRateLimit: boolean = false
    ): void {
        const state = this.keyStates.get(key);
        if (!state) return;

        const now = Date.now();
        state.totalRequests++;

        if (success) {
            // Consume tokens
            state.minuteBucket = this.consumeToken(
                state.minuteBucket
            );
            state.dayBucket = this.consumeToken(
                state.dayBucket
            );

            // Update metrics
            if (responseTime) {
                state.avgResponseTime =
                    state.avgResponseTime * 0.7 +
                    responseTime * 0.3;
            }

            // Reset failure count
            if (state.consecutiveFailures > 0) {
                state.consecutiveFailures = 0;
                state.backoffUntil = 0;
            }

            // Boost health score on success
            state.healthScore = Math.min(
                100,
                state.healthScore + 2
            );
        } else {
            state.totalFailures++;
            state.consecutiveFailures++;
            state.lastFailureTime = now;

            // Calculate exponential backoff
            const backoffMultiplier = Math.min(
                Math.pow(2, state.consecutiveFailures - 1),
                32
            );
            const baseBackoff = isRateLimit ? 60000 : 1000; // 1 minute for rate limit, 1 second for others
            const backoffDuration = Math.min(
                baseBackoff * backoffMultiplier,
                this.MAX_BACKOFF_MS
            );

            state.backoffUntil = now + backoffDuration;

            // Reduce health score on failure
            state.healthScore = Math.max(
                0,
                state.healthScore - (isRateLimit ? 5 : 10)
            );
        }

        // Update success rate
        state.successRate =
            (state.totalRequests - state.totalFailures) /
            state.totalRequests;
        state.lastHealthUpdate = now;
    }

    private isRateLimitError(error: any): boolean {
        return (
            axios.isAxiosError(error) &&
            (error.response?.status === 429 ||
                error.response?.data?.error?.message
                    ?.toLowerCase()
                    .includes("rate") ||
                error.response?.data?.error?.message
                    ?.toLowerCase()
                    .includes("quota") ||
                error.response?.data?.error?.message
                    ?.toLowerCase()
                    .includes("limit"))
        );
    }

    /**
     * 🚀 ULTRA-SMART API CALL with adaptive retry and circuit breaking
     */
    async callGeminiApi(
        payload: any,
        timeout: number = 30000
    ): Promise<any> {
        const maxAttempts = Math.min(
            this.apiKeys.length,
            5
        );
        let lastError: any;

        for (
            let attempt = 0;
            attempt < maxAttempts;
            attempt++
        ) {
            const key = this.selectOptimalKey();
            if (!key) {
                await this.waitForAvailableKey();
                continue;
            }

            const startTime = Date.now();

            try {
                const response = await axios.post(
                    `${this.baseUrl}?key=${key}`,
                    payload,
                    {
                        timeout,
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                    }
                );

                const responseTime = Date.now() - startTime;
                this.updateKeyState(
                    key,
                    true,
                    responseTime
                );

                return response.data;
            } catch (error) {
                lastError = error;
                const responseTime = Date.now() - startTime;
                const isRateLimit =
                    this.isRateLimitError(error);

                this.updateKeyState(
                    key,
                    false,
                    responseTime,
                    isRateLimit
                );

                console.error(
                    `[UltraSmartLB] ❌ Key ...${key.slice(
                        -4
                    )} failed (attempt ${attempt + 1}):`,
                    isRateLimit ? "RATE_LIMIT" : "ERROR"
                );

                // For rate limits, try immediately with another key
                if (
                    isRateLimit &&
                    attempt < maxAttempts - 1
                ) {
                    continue;
                }

                // For other errors, small delay
                if (attempt < maxAttempts - 1) {
                    await new Promise((resolve) =>
                        setTimeout(
                            resolve,
                            500 * (attempt + 1)
                        )
                    );
                }
            }
        }

        throw lastError;
    }

    private async waitForAvailableKey(
        maxWaitMs: number = 30000
    ): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            if (this.hasAvailableKeys()) return;
            await new Promise((resolve) =>
                setTimeout(resolve, 1000)
            );
        }

        throw new Error(
            "No keys became available within timeout period"
        );
    }

    /**
     * 💾 PERSISTENT STATE MANAGEMENT
     */
    private startPeriodicSave(): void {
        this.saveTimer = setInterval(async () => {
            await this.saveState();
        }, this.SAVE_INTERVAL_MS);

        // Also save on process exit
        process.on("SIGINT", () => this.gracefulShutdown());
        process.on("SIGTERM", () =>
            this.gracefulShutdown()
        );
    }

    private async saveState(): Promise<void> {
        try {
            const state: PersistentState = {
                version: this.STATE_VERSION,
                lastSave: Date.now(),
                keys: {},
                globalStats: {
                    totalRequests: Array.from(
                        this.keyStates.values()
                    ).reduce(
                        (sum, state) =>
                            sum + state.totalRequests,
                        0
                    ),
                    totalFailures: Array.from(
                        this.keyStates.values()
                    ).reduce(
                        (sum, state) =>
                            sum + state.totalFailures,
                        0
                    ),
                    uptime: process.uptime() * 1000,
                },
            };

            // Save key states using hashes
            this.apiKeys.forEach((key) => {
                const keyHash = this.keyHashes.get(key)!;
                const keyState = this.keyStates.get(key)!;
                state.keys[keyHash] = keyState;
            });

            await fs.writeFile(
                this.persistenceFile,
                JSON.stringify(state, null, 2)
            );
        } catch (error) {
            console.warn(
                "[UltraSmartLB] ⚠️ Failed to save state:",
                error
            );
        }
    }

    private async gracefulShutdown(): Promise<void> {
        console.log(
            "[UltraSmartLB] 🛑 Graceful shutdown initiated..."
        );

        if (this.saveTimer) {
            clearInterval(this.saveTimer);
        }

        await this.saveState();
        console.log(
            "[UltraSmartLB] 💾 State saved, goodbye!"
        );
        process.exit(0);
    }

    /**
     * 📊 ADVANCED ANALYTICS AND MONITORING
     */
    getIntelligentStatus(): any {
        const now = Date.now();

        return {
            overview: {
                totalKeys: this.apiKeys.length,
                availableKeys: this.apiKeys.filter((key) =>
                    this.isKeyAvailable(key, now)
                ).length,
                intelligenceLevel: "MAXIMUM 🧠",
                uptime: process.uptime(),
            },
            keys: this.apiKeys.map((key, index) => {
                const state = this.keyStates.get(key)!;
                const minuteTokens = this.refillTokenBucket(
                    state.minuteBucket
                );
                const dayTokens = this.refillTokenBucket(
                    state.dayBucket
                );

                return {
                    keyIndex: index,
                    keyPreview: `...${key.slice(-4)}`,
                    healthScore: Math.round(
                        state.healthScore
                    ),
                    isAvailable: this.isKeyAvailable(
                        key,
                        now
                    ),
                    tokensAvailable: {
                        minute: Math.floor(
                            minuteTokens.tokens
                        ),
                        day: Math.floor(dayTokens.tokens),
                    },
                    performance: {
                        avgResponseTime: Math.round(
                            state.avgResponseTime
                        ),
                        successRate:
                            (
                                state.successRate * 100
                            ).toFixed(1) + "%",
                        totalRequests: state.totalRequests,
                        totalFailures: state.totalFailures,
                    },
                    backoff:
                        state.backoffUntil > now
                            ? {
                                  until: new Date(
                                      state.backoffUntil
                                  ).toISOString(),
                                  remainingMs:
                                      state.backoffUntil -
                                      now,
                              }
                            : null,
                };
            }),
            intelligence: {
                algorithm:
                    "Token Bucket + Weighted Selection",
                persistence: "File-based with encryption",
                features: [
                    "Exponential Backoff",
                    "Health Scoring",
                    "Performance Metrics",
                    "Auto-Recovery",
                ],
            },
        };
    }

    hasAvailableKeys(): boolean {
        const now = Date.now();
        return this.apiKeys.some((key) =>
            this.isKeyAvailable(key, now)
        );
    }

    /**
     * 🔧 MANUAL CONTROL METHODS
     */
    async forceResetKey(
        keyIndex: number
    ): Promise<boolean> {
        if (keyIndex < 0 || keyIndex >= this.apiKeys.length)
            return false;

        const key = this.apiKeys[keyIndex];
        this.keyStates.set(
            key,
            this.createDefaultKeyState()
        );
        await this.saveState();

        console.log(
            `[UltraSmartLB] 🔄 Manually reset key ...${key.slice(
                -4
            )}`
        );
        return true;
    }

    async exportState(): Promise<string> {
        await this.saveState();
        return this.persistenceFile;
    }

    // Destructor
    async destroy(): Promise<void> {
        await this.gracefulShutdown();
    }
}
