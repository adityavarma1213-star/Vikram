/*
==========================================================
VIKRAM Investor Operating System
File : js/scoreEngine.js
Version : Alpha 1.3
Author : Lead Frontend Engineer / Chief Architect
Status : Complete & Production Ready
==========================================================
*/

/**
 * Core analytical system designed to calculate unified asset rankings,
 * qualitative investment tiers, star weights, and mathematical metrics.
 */
const scoreEngine = {
    /**
     * Weights applied to specific operational vectors inside the architecture.
     * Total matrix weight calculations resolve strictly to 1.00 (100%).
     */
    WEIGHTS: {
        TECHNICAL: 0.30,
        FUNDAMENTALS: 0.30,
        INSTITUTIONAL: 0.20,
        VALUATION: 0.15,
        NEWS: 0.05
    },

    /**
     * Unified asset performance scoring architecture. Integrates financial multi-factor 
     * inputs to generate a balanced final output package.
     * * @param {Object} factors - Base quantitative factor scores scaled from 0 to 100.
     * @param {number} factors.technical - Technical analysis momentum and trend score.
     * @param {number} factors.fundamentals - Capital efficiency and margin balance score.
     * @param {number} factors.institutional - Block accumulation and absorption score.
     * @param {number} factors.valuation - Pricing multiplier compression score.
     * @param {number} factors.news - Structural catalyst vector data score.
     * @param {Object} [included] - Optional per-pillar flags (default: all true). When a
     *   pillar has no real verified data behind it, pass its flag as false rather than
     *   silently feeding in a neutral guess — its weight is redistributed proportionally
     *   across the remaining included pillars instead of diluting the score with a fake number.
     * @returns {Object} Analytical package containing calculated score, rating, stars, and confidence metrics.
     */
    calculateScore: function(factors, included) {
        const flags = {
            technical: included?.technical ?? true,
            fundamentals: included?.fundamentals ?? true,
            institutional: included?.institutional ?? true,
            valuation: included?.valuation ?? true,
            news: included?.news ?? true
        };

        const technical = factors.technical ?? 50;
        const fundamentals = factors.fundamentals ?? 50;
        const institutional = factors.institutional ?? 50;
        const valuation = factors.valuation ?? 50;
        const news = factors.news ?? 50;

        const pillars = [
            { value: technical, weight: this.WEIGHTS.TECHNICAL, on: flags.technical },
            { value: fundamentals, weight: this.WEIGHTS.FUNDAMENTALS, on: flags.fundamentals },
            { value: institutional, weight: this.WEIGHTS.INSTITUTIONAL, on: flags.institutional },
            { value: valuation, weight: this.WEIGHTS.VALUATION, on: flags.valuation },
            { value: news, weight: this.WEIGHTS.NEWS, on: flags.news }
        ];

        const activeWeight = pillars.filter(p => p.on).reduce((sum, p) => sum + p.weight, 0);

        let roundedScore;
        let factorArray;
        if (activeWeight === 0) {
            // No pillar has real data at all - cannot honestly produce a score
            roundedScore = null;
            factorArray = [];
        } else {
            const rawScore = pillars.filter(p => p.on)
                .reduce((sum, p) => sum + (p.value * (p.weight / activeWeight)), 0);
            roundedScore = Math.round(rawScore);
            factorArray = pillars.filter(p => p.on).map(p => p.value);
        }

        return {
            score: roundedScore,
            rating: roundedScore === null ? "INSUFFICIENT DATA" : this.getRating(roundedScore),
            stars: roundedScore === null ? "—" : this.getStars(roundedScore),
            confidence: roundedScore === null ? 0 : this.getConfidence(factorArray, pillars.filter(p => p.on).length, pillars.length),
            activePillarCount: pillars.filter(p => p.on).length,
            totalPillarCount: pillars.length
        };
    },

    /**
     * Resolves an asset score to its corresponding textual operational directive tier.
     * * @param {number} score - Calculated final performance score (0-100).
     * @returns {string} Financial rating output designation string.
     */
    getRating: function(score) {
        if (score >= 90) return "STRONG BUY";
        if (score >= 75) return "BUY";
        if (score >= 60) return "HOLD";
        if (score >= 40) return "REDUCE";
        return "AVOID";
    },

    /**
     * Formats quantitative score bounds into an explicit visual star string notation matrix.
     * * @param {number} score - Calculated final performance score (0-100).
     * @returns {string} Unicode stars rating array representation asset map.
     */
    getStars: function(score) {
        if (score >= 90) return "★★★★★";
        if (score >= 75) return "★★★★☆";
        if (score >= 60) return "★★★☆☆";
        if (score >= 40) return "★★☆☆☆";
        return "★☆☆☆☆";
    },

    /**
     * Evaluates data integrity confidence thresholds using variance matrix tracking models.
     * High alignment (variance within +/-10 pts) peaks confidence near 90+. 
     * Higher structural variance reduces final output certainty metrics down to 0.
     * * @param {Array<number>} factorArray - Gathered multi-factor evaluation parameters.
     * @returns {number} Integrity value scalar percentage bounding index from 0 to 100.
     */
    getConfidence: function(factorArray, activeCount, totalCount) {
        if (!factorArray || factorArray.length === 0) return 0;

        const maxFactor = Math.max(...factorArray);
        const minFactor = Math.min(...factorArray);
        const varianceSpread = maxFactor - minFactor;

        let confidenceScore = 100 - (varianceSpread * 1.5);

        if (varianceSpread <= 10) {
            confidenceScore = Math.max(90, 100 - (varianceSpread * 0.5));
        }

        // Completeness penalty: agreement among 2 of 5 pillars means far less
        // than agreement among 5 of 5 - missing pillars should lower confidence
        // even if the ones present happen to agree with each other.
        if (activeCount && totalCount && activeCount < totalCount) {
            const completeness = activeCount / totalCount;
            confidenceScore = confidenceScore * completeness;
        }

        return Math.max(0, Math.min(100, Math.round(confidenceScore)));
    }
};

// Freeze the engine architecture blueprint to protect computational routines at runtime
Object.freeze(scoreEngine);

// Export engine to system globally across the window ecosystem pipeline interface
window.VIKRAM_SCORE_ENGINE = scoreEngine;