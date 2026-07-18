/*
==========================================================
VIKRAM Investor Operating System
File : js/riskEngine.js
Version : Alpha 1.3
Author : Lead Frontend Engineer
Status : Complete & Production Ready
==========================================================
*/

/**
 * Reusable data processing module designed to calculate qualitative and quantitative risk vectors.
 * Synthesizes cross-disciplinary financial data into risk metrics without UI dependencies.
 */
const riskEngine = {
    /**
     * Calculates comparative metric factors to evaluate structural risks.
     * @param {Object} params - Input parameters containing financial and technical values.
     * @param {number} params.debtToEquity - The current leverage or debt-to-equity ratio index.
     * @param {number} params.roe - Return on equity scalar percentage value.
     * @param {number} params.profitGrowth - Net operating profit compound or annual growth rate metric.
     * @param {number} params.rsi - Relative strength index momentum scalar tracker metric.
     * @param {number} params.adx - Average directional movement indicator trend rating.
     * @returns {Object} Comprehensive analytics risk metrics output model.
     */
    calculate: function(params) {
        const debtToEquity = params.debtToEquity ?? 0;
        const roe = params.roe ?? 0;
        const profitGrowth = params.profitGrowth ?? 0;
        const rsi = params.rsi ?? 50;
        const adx = params.adx ?? 0;

        const financialRisk = this.calculateFinancialRisk(debtToEquity);
        const technicalRisk = this.calculateTechnicalRisk(rsi, adx);
        
        // Evaluate Business Operational Risk Strategy Categories
        let businessScore = 50;
        let businessRisk = "Average";

        if (roe > 20 && profitGrowth > 20) {
            businessScore = 15;
            businessRisk = "Excellent";
        } else if (roe >= 15 && profitGrowth >= 10) {
            businessScore = 35;
            businessRisk = "Good";
        } else if (roe < 10 || profitGrowth < 0) {
            businessScore = 85;
            businessRisk = "Weak";
        } else {
            businessScore = 55;
            businessRisk = "Average";
        }

        // Weighted compilation score algorithm resolves to final risk output limits
        // Matrix weights distribution configurations: Financial (40%), Technical (30%), Business (30%)
        let fScore = 50;
        if (financialRisk === "Excellent") fScore = 15;
        else if (financialRisk === "Good") fScore = 35;
        else if (financialRisk === "Average") fScore = 55;
        else if (financialRisk === "High Risk") fScore = 90;

        let tScore = 50;
        if (technicalRisk === "Healthy" || technicalRisk === "Oversold") tScore = 25;
        else if (technicalRisk === "Moderate" || technicalRisk === "Weak") tScore = 55;
        else if (technicalRisk === "Overheated") tScore = 80;

        const rawRiskScore = (fScore * 0.40) + (tScore * 0.30) + (businessScore * 0.30);
        const finalRiskScore = Math.round(rawRiskScore);

        let riskSummary = `Asset profile manifests a ${this.getRiskLevel(finalRiskScore).toLowerCase()} compounding risk structure.`;
        if (finalRiskScore >= 70) {
            riskSummary = "High risk parameters identified across major financial leverage and validation indices.";
        } else if (finalRiskScore <= 35) {
            riskSummary = "Strong risk insulation profile verified through optimized capital turns and balance sheet structures.";
        }

        return {
            riskScore: finalRiskScore,
            riskLevel: this.getRiskLevel(finalRiskScore),
            financialRisk: financialRisk,
            technicalRisk: technicalRisk,
            businessRisk: businessRisk,
            summary: riskSummary
        };
    },

    /**
     * Resolves capital leverage status bounds based on structural debt metrics.
     * @param {number} dte - Debt to equity ratio criteria.
     * @returns {string} Financial risk level designation tracking code.
     */
    calculateFinancialRisk: function(dte) {
        if (dte <= 0.25) return "Excellent";
        if (dte <= 0.50) return "Good";
        if (dte <= 1.00) return "Average";
        return "High Risk";
    },

    /**
     * Combines momentum indicators and trend vectors to assess absolute volatility risk.
     * @param {number} rsi - Relative strength indicator valuation parameters.
     * @param {number} adx - Trend strength metrics index values.
     * @returns {string} Evaluated technical market risk posture text.
     */
    calculateTechnicalRisk: function(rsi, adx) {
        if (rsi > 70) return "Overheated";
        if (rsi < 30) return "Oversold";
        if (rsi >= 40 && rsi <= 70) {
            return adx > 25 ? "Healthy" : "Moderate";
        }
        return "Weak";
    },

    /**
     * Converts raw linear score metrics into explicit tier classifications.
     * @param {number} score - Combined scalar tracking score output (0-100).
     * @returns {string} Risk classification designation text block value.
     */
    getRiskLevel: function(score) {
        if (score >= 70) return "HIGH";
        if (score >= 40) return "MEDIUM";
        return "LOW";
    }
};

// Freeze the engine definition to secure calculations against structural runtime mutations
Object.freeze(riskEngine);

// Register application module into standard unified global space layers
window.VIKRAM_RISK_ENGINE = riskEngine;