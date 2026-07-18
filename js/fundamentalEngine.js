/*
==========================================================
VIKRAM Investor Operating System
File : js/fundamentalEngine.js
Version : Alpha 1.5
Author : Lead Frontend Engineer

NOTE ON THRESHOLDS: The cutoffs below are reasonable, widely
used Indian-equity value-investing defaults chosen by VIKRAM's
architecture review — they are NOT yet the founder's own
verified Excel thresholds. Swap the numbers inside each
tier function below once real thresholds are provided; the
scoring structure does not need to change.

SECTOR-AWARE SCORING (added Alpha 1.5): a flat rule can't be
right for every business. A bank's Debt-to-Equity of 8x is
completely normal (deposits are liabilities, not risky debt) -
the same number for an IT company would be alarming. This
engine now applies different ROE/Debt/Growth expectations
depending on the sector's real economics, instead of judging
every company against the same yardstick.
==========================================================
*/

const fundamentalEngine = {

    /**
     * Sector profiles - each defines what "good" looks like for that kind of
     * business, and whether Debt-to-Equity should even be judged at all.
     */
    SECTOR_PROFILES: {
        FINANCIALS: {
            match: ['financial services', 'banking', 'bank', 'nbfc', 'insurance'],
            roeGood: 15, roeExcellent: 18,
            judgeDebt: false, // deposits/leverage are the business model, not risk
            growthGood: 12, growthExcellent: 18
        },
        TECHNOLOGY: {
            match: ['technology', 'it services', 'software', 'information technology'],
            roeGood: 20, roeExcellent: 28,
            judgeDebt: true, deGood: 0.15, deExcellent: 0.05,
            growthGood: 12, growthExcellent: 20
        },
        FMCG: {
            match: ['fmcg', 'consumer goods', 'consumer staples'],
            roeGood: 22, roeExcellent: 30,
            judgeDebt: true, deGood: 0.30, deExcellent: 0.10,
            growthGood: 10, growthExcellent: 15
        },
        CAPITAL_INTENSIVE: {
            match: ['energy', 'conglomerate', 'automobile', 'auto', 'infrastructure', 'manufacturing', 'oil', 'power', 'telecom'],
            roeGood: 12, roeExcellent: 18,
            judgeDebt: true, deGood: 0.70, deExcellent: 0.35,
            growthGood: 10, growthExcellent: 16
        },
        PHARMA: {
            match: ['pharma', 'pharmaceutical', 'healthcare'],
            roeGood: 15, roeExcellent: 22,
            judgeDebt: true, deGood: 0.40, deExcellent: 0.15,
            growthGood: 10, growthExcellent: 16
        },
        DEFAULT: {
            match: [],
            roeGood: 15, roeExcellent: 20,
            judgeDebt: true, deGood: 0.50, deExcellent: 0.25,
            growthGood: 10, growthExcellent: 15
        }
    },

    /**
     * Finds the right sector profile for a given sector/industry string.
     * Falls back to DEFAULT if nothing matches - never breaks, just less tuned.
     */
    resolveProfile: function(sector, industry) {
        const haystack = ((sector || '') + ' ' + (industry || '')).toLowerCase();
        for (const key in this.SECTOR_PROFILES) {
            const profile = this.SECTOR_PROFILES[key];
            if (profile.match.some(term => haystack.includes(term))) {
                return { key, ...profile };
            }
        }
        return { key: 'DEFAULT', ...this.SECTOR_PROFILES.DEFAULT };
    },

    /**
     * Calculates the Fundamental pillar score from ROE, Debt-to-Equity, and
     * Profit Growth, judged against the company's own sector's expectations.
     * @param {Object} params - Input dataset.
     * @param {number} params.roe - Return on Equity, percentage points.
     * @param {number} params.debtToEquity - Debt to Equity ratio.
     * @param {number} params.profitGrowth - Profit growth, percentage points.
     * @param {string} [params.sector] - Company sector, used to pick the right benchmark.
     * @param {string} [params.industry] - Company industry, secondary matching signal.
     * @returns {Object} Fundamental pillar analysis result.
     */
    calculate: function(params) {
        const roe = params.roe ?? 0;
        const debtToEquity = params.debtToEquity ?? 0;
        const profitGrowth = params.profitGrowth ?? 0;
        const profile = this.resolveProfile(params.sector, params.industry);

        const roeScore = this.scoreAgainstBands(roe, profile.roeGood, profile.roeExcellent);
        const growthScore = this.scoreAgainstBands(profitGrowth, profile.growthGood, profile.growthExcellent, true);

        let deScore, weights;
        if (profile.judgeDebt) {
            deScore = this.scoreDebtToEquity(debtToEquity, profile.deGood, profile.deExcellent);
            weights = { roe: 0.40, growth: 0.35, de: 0.25 };
        } else {
            deScore = null;
            weights = { roe: 0.55, growth: 0.45, de: 0 };
        }

        const rawScore = (roeScore * weights.roe) + (growthScore * weights.growth) + ((deScore ?? 0) * weights.de);
        const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

        return {
            score: finalScore,
            grade: this.getGrade(finalScore),
            sectorProfile: profile.key,
            debtJudged: profile.judgeDebt,
            roeScore, deScore, growthScore,
            summary: this.generateSummary(roe, debtToEquity, profitGrowth, finalScore, profile)
        };
    },

    /**
     * Generic band scorer: below "good" scales up gradually, "good" to
     * "excellent" scales further, at/above "excellent" caps at 100.
     */
    scoreAgainstBands: function(value, goodThreshold, excellentThreshold, penalizeNegative) {
        if (penalizeNegative && value < 0) return Math.max(0, 30 + value * 2);
        if (value >= excellentThreshold) return 100;
        if (value >= goodThreshold) {
            return 70 + ((value - goodThreshold) / (excellentThreshold - goodThreshold)) * 30;
        }
        if (value >= 0) return (value / goodThreshold) * 70;
        return 0;
    },

    /**
     * Scores Debt-to-Equity against sector-specific "good"/"excellent" bands.
     */
    scoreDebtToEquity: function(de, goodThreshold, excellentThreshold) {
        if (de <= excellentThreshold) return 100;
        if (de <= goodThreshold) {
            return 70 + ((goodThreshold - de) / (goodThreshold - excellentThreshold)) * 30;
        }
        return Math.max(0, 60 - (de - goodThreshold) * 40);
    },

    /**
     * Converts a fundamental score into a qualitative grade label.
     */
    getGrade: function(score) {
        if (score >= 80) return "Excellent";
        if (score >= 60) return "Good";
        if (score >= 40) return "Average";
        return "Weak";
    },

    /**
     * Produces a short plain-language summary, naming which sector benchmark was used.
     */
    generateSummary: function(roe, de, growth, score, profile) {
        const sectorNote = profile.key === 'DEFAULT'
            ? ''
            : ` (judged against ${profile.key.replace('_', ' ').toLowerCase()} sector norms${profile.judgeDebt ? '' : ' - debt not weighed for this business model'})`;

        if (score >= 80) {
            return `Strong capital efficiency (ROE ${roe}%) with healthy growth (${growth}%)${profile.judgeDebt ? ` and manageable leverage (D/E ${de})` : ''}.${sectorNote}`;
        }
        if (score < 40) {
            return `Weak fundamentals — low capital efficiency or shrinking profit growth.${sectorNote} Review before treating this as a core holding.`;
        }
        return `Moderate fundamentals — ROE ${roe}%, growth ${growth}%${profile.judgeDebt ? `, D/E ${de}` : ''}.${sectorNote} No major red flags, no standout strength either.`;
    }
};

// Freeze and register, matching the pattern of every other VIKRAM engine
Object.freeze(fundamentalEngine);
window.VIKRAM_FUNDAMENTAL_ENGINE = fundamentalEngine;
