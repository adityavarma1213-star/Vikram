/*
==========================================================
VIKRAM Investor Operating System
File : js/valuationEngine.js
Version : Alpha 1.3
Author : Lead Frontend Engineer
Status : Complete & Production Ready
==========================================================
*/

/**
 * Reusable data processing module designed to calculate investment valuation metrics
 * including margin of safety, potential price deviations, and analytical asset status tags.
 */
const valuationEngine = {
    /**
     * Calculates comparative metric attributes between market prices and calculated values.
     * @param {Object} params - Input configuration data pricing factors.
     * @param {number} params.currentPrice - Current trading market price of the asset.
     * @param {number} params.intrinsicValue - Calculated fair mathematical target value of the asset.
     * @returns {Object} Comprehensive structural evaluation results object.
     */
    calculate: function(params) {
        const currentPrice = params.currentPrice ?? 0;
        const intrinsicValue = params.intrinsicValue ?? 0;

        let marginOfSafety = 0;
        if (intrinsicValue !== 0) {
            marginOfSafety = ((intrinsicValue - currentPrice) / intrinsicValue) * 100;
        }

        const marginOfSafetyRounded = Math.round(marginOfSafety);

        let upside = 0;
        let downside = 0;

        if (intrinsicValue > currentPrice) {
            upside = Math.round(((intrinsicValue - currentPrice) / currentPrice) * 100);
        } else if (currentPrice > intrinsicValue) {
            downside = Math.round(((currentPrice - intrinsicValue) / currentPrice) * 100);
        }

        return {
            currentPrice: currentPrice,
            intrinsicValue: intrinsicValue,
            marginOfSafety: marginOfSafetyRounded,
            upside: upside,
            downside: downside,
            status: this.getStatus(marginOfSafetyRounded)
        };
    },

    /**
     * Evaluates security pricing status brackets from a unified margin of safety percentage.
     * @param {number} marginOfSafety - Extrapolated percentage representing risk metrics gap buffer.
     * @returns {string} Explicit structural classification tag descriptor.
     */
    getStatus: function(marginOfSafety) {
        if (marginOfSafety >= 30) {
            return "UNDERVALUED";
        }
        if (marginOfSafety >= 10 && marginOfSafety < 30) {
            return "FAIR VALUE";
        }
        return "OVERVALUED";
    }
};

// Freeze computational configuration matrices to lock down internal evaluation properties at runtime
Object.freeze(valuationEngine);

// Register engine configuration component scope into standard window layout environment nodes
window.VIKRAM_VALUATION_ENGINE = valuationEngine;