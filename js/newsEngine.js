/*
==========================================================
VIKRAM Investor Operating System
File : js/newsEngine.js
Version : Alpha 1.3
Author : Lead Frontend Engineer
Status : Complete & Production Ready
==========================================================
*/

/**
 * Reusable data processing module designed to calculate qualitative news trends,
 * structural corporate action catalysts, sentiment scales, and directive trade actions.
 */
const newsEngine = {
    /**
     * Synthesizes incoming media events and strategic indicators into a quantitative structural score package.
     * @param {Object} params - Input variables for news counts and governance vectors.
     * @param {number} params.positiveNews - Aggregate count of distinct positive media indicators.
     * @param {number} params.negativeNews - Aggregate count of distinct negative media indicators.
     * @param {boolean} params.corporateActions - Governance actions flag (e.g., dividends, mergers, splits).
     * @param {boolean} params.orderWins - Material contract or commercial award procurement flag.
     * @param {string} params.managementGuidance - Outlook statement descriptor ('Positive', 'Neutral', 'Negative').
     * @returns {Object} Comprehensive narrative data synthesis model results.
     */
    calculate: function(params) {
        const positiveNews = params.positiveNews ?? 0;
        const negativeNews = params.negativeNews ?? 0;
        const corporateActions = params.corporateActions ?? false;
        const orderWins = params.orderWins ?? false;
        const managementGuidance = params.managementGuidance ?? "Neutral";

        let calculatedScore = 50;

        // Diminishing returns: the 1st positive news item matters a lot, the
        // 10th barely moves the needle further. Uses a square-root curve
        // instead of pure linear (positiveNews * 5) so a single stock with
        // an unusually high news count doesn't auto-max the pillar regardless
        // of how meaningful each item actually is.
        calculatedScore += Math.sqrt(positiveNews) * 12;
        calculatedScore -= Math.sqrt(negativeNews) * 15;

        if (corporateActions) {
            calculatedScore += 10;
        }

        if (orderWins) {
            calculatedScore += 15;
        }

        if (managementGuidance === "Positive") {
            calculatedScore += 10;
        } else if (managementGuidance === "Negative") {
            calculatedScore += -10;
        }

        // Clamp computed outcome values explicitly to the standard mathematical metric limits
        const finalScore = Math.max(0, Math.min(100, Math.round(calculatedScore)));
        const sentiment = this.getSentiment(finalScore);

        let trackingSummary = `Catalyst network reflects a ${sentiment.toLowerCase()} posture over the short-term evaluation window.`;
        if (finalScore >= 75) {
            trackingSummary = "High-impact positive news arrays combined with solid operational guidance indicate a strong breakout phase.";
        } else if (finalScore < 35) {
            trackingSummary = "Material negative headwinds or downbeat operational milestones suggest immediate fundamental capital insulation is warranted.";
        }

        return {
            newsScore: finalScore,
            sentiment: sentiment,
            catalystStrength: this.getCatalystStrength(finalScore),
            recommendation: this.getRecommendation(sentiment),
            summary: trackingSummary
        };
    },

    /**
     * Evaluates numerical metrics bounds to output precise corporate sentiment brackets.
     * @param {number} score - Combined calculation rating score mapped from 0 to 100.
     * @returns {string} Textual sentiment classification block string.
     */
    getSentiment: function(score) {
        if (score >= 80) return "VERY POSITIVE";
        if (score >= 65) return "POSITIVE";
        if (score >= 45) return "NEUTRAL";
        if (score >= 25) return "NEGATIVE";
        return "VERY NEGATIVE";
    },

    /**
     * Decodes systemic volatility force indexes using numerical benchmark ranges.
     * @param {number} score - Consolidated quantitative factor index tracker.
     * @returns {string} Strength tier representation indicator code.
     */
    getCatalystStrength: function(score) {
        if (score >= 75) return "HIGH";
        if (score >= 50) return "MEDIUM";
        return "LOW";
    },

    /**
     * Resolves matching administrative actions from strategic corporate sentiment models.
     * @param {string} sentiment - Standardized upper-case structural sentiment string label.
     * @returns {string} Clear investment deployment directive tag text.
     */
    getRecommendation: function(sentiment) {
        switch (sentiment) {
            case "VERY POSITIVE":
                return "ACCUMULATE";
            case "POSITIVE":
                return "BUY ON DIPS";
            case "NEUTRAL":
                return "HOLD";
            case "NEGATIVE":
                return "REDUCE";
            case "VERY NEGATIVE":
            default:
                return "AVOID";
        }
    }
};

// Freeze internal code configurations blueprint to maintain mathematical integrity across runtime pipes
Object.freeze(newsEngine);

// Register application engine module scope into standard window layout environments
window.VIKRAM_NEWS_ENGINE = newsEngine;