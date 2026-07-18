/*
==========================================================
VIKRAM Investor Operating System
File : js/institutionEngine.js
Version : Alpha 1.3
Author : Lead Frontend Engineer
Status : Complete & Production Ready
==========================================================
*/

/**
 * Reusable data processing module designed to calculate qualitative and quantitative institutional data matrices.
 * Evaluates block accumulation patterns, ownership velocity, and net position structural configurations.
 */
const institutionEngine = {
    /**
     * Calculates institutional net scoring parameters based on historical accumulation vectors.
     * @param {Object} params - Input dataset factors tracking block holdings.
     * @param {number} params.fiiHolding - Percentage of share capital held by Foreign Institutional Investors.
     * @param {number} params.diiHolding - Percentage of share capital held by Domestic Institutional Investors.
     * @param {number} params.fiiChange - Quarterly percentage change in FII ownership position.
     * @param {number} params.diiChange - Quarterly percentage change in DII ownership position.
     * @param {number} params.pledgedPromoterShares - Percentage of promoter shares under block pledge contracts.
     * @returns {Object} Comprehensive institutional backing metrics analysis model.
     */
    calculate: function(params) {
        const fiiHolding = params.fiiHolding ?? 0;
        const diiHolding = params.diiHolding ?? 0;
        const fiiChange = params.fiiChange ?? 0;
        const diiChange = params.diiChange ?? 0;
        const pledgedPromoterShares = params.pledgedPromoterShares ?? 0;

        const totalInstitutionalHolding = fiiHolding + diiHolding;
        const absoluteOwnershipVelocity = fiiChange + diiChange;

        // Base structural scoring calculation pipelines
        let institutionalScore = 50;
        if (totalInstitutionalHolding > 40) {
            institutionalScore += 15;
        } else if (totalInstitutionalHolding < 15) {
            institutionalScore -= 15;
        }

        // Velocity acceleration scaling logic modifiers
        if (absoluteOwnershipVelocity > 2) {
            institutionalScore += 20;
        } else if (absoluteOwnershipVelocity > 0) {
            institutionalScore += 10;
        } else if (absoluteOwnershipVelocity < -2) {
            institutionalScore -= 20;
        } else if (absoluteOwnershipVelocity < 0) {
            institutionalScore -= 10;
        }

        // Apply risk optimization overhead caps (Pledged promoter allocations degrade confidence matrices)
        if (pledgedPromoterShares > 25) {
            institutionalScore -= 25;
        } else if (pledgedPromoterShares > 5) {
            institutionalScore -= 10;
        }

        // Clamp final composite metric strictly into the standard 0-100 bounded envelope
        const finalScore = Math.max(0, Math.min(100, Math.round(institutionalScore)));

        return {
            institutionalScore: finalScore,
            stance: this.getStance(finalScore, absoluteOwnershipVelocity),
            totalInstitutionalHolding: parseFloat(totalInstitutionalHolding.toFixed(2)),
            velocityStatus: absoluteOwnershipVelocity > 0 ? "ACCUMULATION" : (absoluteOwnershipVelocity < 0 ? "DISTRIBUTION" : "STABLE / NO CHANGE DATA"),
            riskMitigationTrigger: pledgedPromoterShares > 10,
            summary: this.generateSummary(finalScore, totalInstitutionalHolding, absoluteOwnershipVelocity)
        };
    },

    /**
     * Resolves directional stance matching vectors from institutional holding weights and trends.
     * @param {number} score - Combined core analytical tracking score (0-100).
     * @param {number} velocity - Raw net change parameter of consolidated corporate registry blocks.
     * @returns {string} Explicit asset posture label state text.
     */
    getStance: function(score, velocity) {
        if (score >= 75) return "STRONG ACCUMULATION";
        if (score >= 55) return "BULLISH BIAS";
        if (score >= 40) return "NEUTRAL MIXED";
        if (score < 40 && velocity < 0) return "HEAVY DISTRIBUTION";
        return "BEARISH OUTFLOWS";
    },

    /**
     * Synthesizes mathematical output trends into an absolute functional string overview summary.
     * @param {number} score - Calculated asset tracking score.
     * @param {number} totalHolding - Sum total of tracking institutional equity vectors.
     * @param {number} velocity - Cumulative historical directional position adjustments scale.
     * @returns {string} Narrative analytics text block string execution frame.
     */
    generateSummary: function(score, totalHolding, velocity) {
        if (score >= 70) {
            return `Dominant institutional block retention detected at ${totalHolding}%. Smart money pipelines manifest concentrated net long buying trends.`;
        }
        if (score < 40 || velocity <= -1.5) {
            return `System alerts indicate active institutional inventory unloading workflows. Net liquidation tracks negative risk factors.`;
        }
        return `Quiet structural block holding profile at ${totalHolding}% concentration levels. Trading positions display sideways validation trends.`;
    }
};

// Freeze internal structural code definitions to avoid cross-module injection risks at execution layers
Object.freeze(institutionEngine);

// Register application module into standard unified global space layers
window.VIKRAM_INSTITUTION_ENGINE = institutionEngine;