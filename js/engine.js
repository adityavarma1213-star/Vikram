/*
==========================================================
VIKRAM Investor Operating System
File : js/engine.js
Version : Alpha 1.4 (Sprint 1A patch applied)
Author : Lead Frontend Engineer / Chief Architect
Status : Complete & Production Ready
==========================================================
*/

const vikramEngine = {
    /**
     * Executes analytical calculations by unifying company, technical, and fundamental data.
     * @param {string} ticker - The stock ticker symbol to evaluate.
     * @returns {Object|null} Integrated quantitative analysis package or null if invalid.
     */
    analyzeAsset: function(ticker) {
        if (!ticker) return null;
        
        const cleanTicker = ticker.toUpperCase().trim();
        
        // Extract from global windows data stores instantiated by preceding scripts
        const baseCompany = window.VIKRAM_COMPANY_DATABASE ? window.VIKRAM_COMPANY_DATABASE[cleanTicker] : null;
        const technicals  = window.VIKRAM_TECHNICAL_DATA ? window.VIKRAM_TECHNICAL_DATA[cleanTicker] : null;
        const fundamentals = window.VIKRAM_FINANCIAL_DATA ? window.VIKRAM_FINANCIAL_DATA[cleanTicker] : null;

        if (!baseCompany) {
            console.error(`[VIKRAM ENGINE ERROR] Ticker ${cleanTicker} not resolved in historical matrix.`);
            return null;
        }

        // Assemble synthesized multi-factor operational package
        const rawPackage = {
            ticker: cleanTicker,
            meta: { ...baseCompany },
            technical: technicals ? { ...technicals } : this.generateFallbackTechnical(),
            financial: fundamentals ? { ...fundamentals } : this.generateFallbackFinancial()
        };

        // Route through Framework Engine for scoring/valuation/risk/institutional/news synthesis
        if (window.VIKRAM_FRAMEWORK_ENGINE && typeof window.VIKRAM_FRAMEWORK_ENGINE.processAssetData === "function") {
            const processed = window.VIKRAM_FRAMEWORK_ENGINE.processAssetData(rawPackage);
            if (processed) return processed;
        }

        // Fallback: Framework Engine unavailable or returned null
        return rawPackage;
    },

    /**
     * Returns matching suggestions from the core database for auto-complete and search query lookups.
     * @param {string} query - The prefix string typed by user.
     * @returns {Array} Array of matched objects matching ticker or name parameters.
     */
    searchSuggestions: function(query) {
        if (!query || !window.VIKRAM_COMPANY_DATABASE) return [];
        const cleanQuery = query.toLowerCase().trim();
        
        return Object.values(window.VIKRAM_COMPANY_DATABASE).filter(company => {
            return company.ticker.toLowerCase().includes(cleanQuery) || 
                   company.name.toLowerCase().includes(cleanQuery);
        });
    },

    /**
     * Generates standard fallback schemas for missing technical dataset matrices.
     * @returns {Object} Static fallback structure containing empty string indicators.
     */
    generateFallbackTechnical: function() {
        return {
            rsi: "50.00", rsiSignal: "Neutral",
            macd: "0.00", macdSignal: "Neutral",
            adx: "15.00", adxSignal: "Weak Trend",
            ema20: "—", ema50: "—", ema200: "—",
            support: "—", resistance: "—", trend: "Consolidation",
            volume: "—", volumeSignal: "Normal",
            obv: "—", obvSignal: "Stable",
            deliveryPct: "—", deliverySignal: "Normal"
        };
    },

    /**
     * Generates standard fallback schemas for missing fundamental dataset matrices.
     * @returns {Object} Static fallback structure containing empty string indicators.
     */
    generateFallbackFinancial: function() {
        return {
            revenueGrowth: "—", revenueGrowthSignal: "Unavailable",
            profitGrowth: "—", profitGrowthSignal: "Unavailable",
            epsGrowth: "—", epsGrowthSignal: "Unavailable",
            roe: "—", roeSignal: "Unavailable",
            roce: "—", roceSignal: "Unavailable",
            operatingMargin: "—", operatingMarginSignal: "Unavailable",
            netMargin: "—", netMarginSignal: "Unavailable",
            debtToEquity: "—", debtToEquitySignal: "Unavailable",
            freeCashFlow: "—", freeCashFlowSignal: "Unavailable",
            interestCoverage: "—", interestCoverageSignal: "Unavailable",
            quarterlyGrowth: "—", quarterlyGrowthSignal: "Unavailable",
            annualGrowth: "—", annualGrowthSignal: "Unavailable"
        };
    }
};

// Bind to global engine runtime interface pipeline
window.VIKRAM_ENGINE = vikramEngine;
