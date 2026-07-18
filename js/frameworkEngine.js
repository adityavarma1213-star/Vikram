/*
==========================================================
VIKRAM Investor Operating System
File : js/frameworkEngine.js
Version : Alpha 1.3
Author : Lead Frontend Engineer
Status : Complete & Production Ready
==========================================================
*/

/**
 * Orchestration engine designed to aggregate and link multi-factor parameters.
 * Synthesizes individual processing streams from specialized engines into a 
 * single, unified asset matrix profile without DOM interaction.
 */
const frameworkEngine = {
    /**
     * Aggregates modular analysis passes to form a synchronized systemic matrix package.
     * @param {Object} rawData - Unified telemetry structure extracted from target index data stores.
     * @returns {Object} Master consolidated analytical system report matrix.
     */
    processAssetData: function(rawData) {
        if (!rawData || !rawData.meta || !rawData.technical || !rawData.financial) {
            return null;
        }

        // 1. Calculate Valuation Layer Metrics via Valuation Engine Module
        //
        // IMPROVED: intrinsic value used to be a flat "price × 1.15" guess when
        // not directly supplied. Now it's adjusted by the company's own quality
        // (ROE) and growth — a business compounding faster and more efficiently
        // reasonably deserves a higher fair-value premium than a flat 15% for
        // every stock regardless of quality. Still an ESTIMATE, not a real DCF,
        // and clearly labeled as such — just a better-informed estimate than before.
        let valuationMatrix = { marginOfSafety: 50, upside: 0, downside: 0, status: "FAIR VALUE" };
        if (window.VIKRAM_VALUATION_ENGINE && typeof window.VIKRAM_VALUATION_ENGINE.calculate === "function") {
            const currentPrice = parseFloat(rawData.meta.currentPrice) || 0;
            let intrinsicValue = parseFloat(rawData.financial.intrinsicValue);
            if (!intrinsicValue) {
                const roe = parseFloat(rawData.financial.roe) || 12;
                const growth = parseFloat(rawData.financial.profitGrowth) || 8;
                // Quality premium: scales from ~5% (weak ROE/growth) to ~30% (excellent ROE/growth)
                // instead of a single flat 15% for every company regardless of quality.
                const qualityFactor = Math.min(0.30, Math.max(0.05, ((roe / 100) * 0.6) + ((growth / 100) * 0.4)));
                intrinsicValue = currentPrice * (1 + qualityFactor);
            }
            valuationMatrix = window.VIKRAM_VALUATION_ENGINE.calculate({
                currentPrice: currentPrice,
                intrinsicValue: intrinsicValue
            });
        }

        // 2. Calculate Volatility Risks Layer via Risk Engine Module
        let riskMatrix = { riskScore: 50, riskLevel: "MEDIUM", financialRisk: "Average", technicalRisk: "Moderate", businessRisk: "Average", summary: "" };
        if (window.VIKRAM_RISK_ENGINE && typeof window.VIKRAM_RISK_ENGINE.calculate === "function") {
            riskMatrix = window.VIKRAM_RISK_ENGINE.calculate({
                debtToEquity: parseFloat(rawData.financial.debtToEquity) || 0,
                roe: parseFloat(rawData.financial.roe) || 0,
                profitGrowth: parseFloat(rawData.financial.profitGrowth) || 0,
                rsi: parseFloat(rawData.technical.rsi) || 50,
                adx: parseFloat(rawData.technical.adx) || 0
            });
        }

        // 3. Calculate Institutional Block Structures via Institutional Engine Module
        //
        // HONESTY FIX: this used to silently fall back to fiiHolding:15/diiHolding:15
        // whenever real data was missing, producing a fake "50/100 NEUTRAL MIXED"
        // that LOOKED like real analysis but was actually a made-up default. An
        // investor reading the dashboard had no way to tell the difference. Now:
        // if real FII/DII data isn't present on the input, the pillar is honestly
        // marked unavailable and EXCLUDED from the score (weight redistributed to
        // the pillars that do have real data) instead of silently diluting the
        // score with an invented number.
        const hasInstitutionalData = rawData.financial.fiiHolding !== undefined
            && rawData.financial.diiHolding !== undefined;

        let institutionMatrix;
        if (!hasInstitutionalData) {
            institutionMatrix = {
                institutionalScore: 50,
                stance: "DATA UNAVAILABLE",
                totalInstitutionalHolding: null,
                velocityStatus: "UNKNOWN",
                riskMitigationTrigger: false,
                summary: "No verified FII/DII holding data is available for this stock yet. This pillar is excluded from the VIKRAM Score rather than guessed.",
                dataAvailable: false
            };
        } else if (window.VIKRAM_INSTITUTION_ENGINE && typeof window.VIKRAM_INSTITUTION_ENGINE.calculate === "function") {
            institutionMatrix = window.VIKRAM_INSTITUTION_ENGINE.calculate({
                fiiHolding: parseFloat(rawData.financial.fiiHolding),
                diiHolding: parseFloat(rawData.financial.diiHolding),
                fiiChange: parseFloat(rawData.financial.fiiChange) || 0,
                diiChange: parseFloat(rawData.financial.diiChange) || 0,
                pledgedPromoterShares: parseFloat(rawData.financial.pledgedPromoterShares) || 0
            });
            institutionMatrix.dataAvailable = true;
        } else {
            institutionMatrix = { institutionalScore: 50, stance: "NEUTRAL MIXED", totalInstitutionalHolding: 30, velocityStatus: "ACCUMULATION", riskMitigationTrigger: false, dataAvailable: false };
        }

        // 4. Calculate Sentiment and Catalyst Timelines via News Engine Module
        let newsMatrix = { newsScore: 50, sentiment: "NEUTRAL", catalystStrength: "MEDIUM", recommendation: "HOLD", summary: "" };
        if (window.VIKRAM_NEWS_ENGINE && typeof window.VIKRAM_NEWS_ENGINE.calculate === "function") {
            newsMatrix = window.VIKRAM_NEWS_ENGINE.calculate({
                positiveNews: parseInt(rawData.meta.positiveNewsCount) || 0,
                negativeNews: parseInt(rawData.meta.negativeNewsCount) || 0,
                corporateActions: !!rawData.meta.hasCorporateActions,
                orderWins: !!rawData.meta.hasOrderWins,
                managementGuidance: rawData.meta.managementGuidance || "Neutral"
            });
        }

        // 5. Consolidate Normalized Factor Sub-scores into Master Structural Model Core
        //
        // KNOWN ISSUE (flagged, fixed here): Technical momentum and Institutional
        // accumulation are not independent signals. Sustained FII/DII buying is
        // frequently the CAUSE of the price breakout the Technical factor rewards
        // a few weeks later. Feeding both into the weighted score at full strength
        // effectively counts one underlying event twice (30% + 20% = 50% of the
        // score moving off a single cause).
        //
        // Fix: when both factors point the same direction (both above 50 or both
        // below 50), a portion of their shared deviation from neutral is dampened
        // before they reach the Score Engine. This only affects the WEIGHTED score
        // input — the raw institutionMatrix / technical readings shown elsewhere
        // in the dashboard are untouched.
        //
        // SECOND APPLICATION (added after review): Fundamental and Valuation have
        // the same issue when intrinsic value is estimated rather than directly
        // supplied - the estimate formula uses ROE and profit growth, the SAME
        // inputs the Fundamental score is built from. So a company's ROE can
        // silently push both Fundamental (30%) and Valuation (15%) in the same
        // direction - 45% of the score moving off one shared input. Dampened here too.
        const CORRELATION_DAMPEN_FACTOR = 0.25;
        function dampenCorrelatedFactors(scoreA, scoreB) {
            const devA = scoreA - 50;
            const devB = scoreB - 50;
            const sameDirection = (devA > 0 && devB > 0) || (devA < 0 && devB < 0);
            if (!sameDirection || devA === 0) return { a: scoreA, b: scoreB };
            const overlap = Math.min(Math.abs(devA), Math.abs(devB)) * CORRELATION_DAMPEN_FACTOR;
            return {
                a: Math.min(100, Math.max(0, scoreA - Math.sign(devA) * overlap)),
                b: Math.min(100, Math.max(0, scoreB - Math.sign(devB) * overlap))
            };
        }

        // 1a. Calculate Fundamental Layer via Fundamental Engine Module
        let fundamentalMatrix = { score: 50, grade: "Average" };
        if (window.VIKRAM_FUNDAMENTAL_ENGINE && typeof window.VIKRAM_FUNDAMENTAL_ENGINE.calculate === "function") {
            fundamentalMatrix = window.VIKRAM_FUNDAMENTAL_ENGINE.calculate({
                roe: parseFloat(rawData.financial.roe) || 0,
                debtToEquity: parseFloat(rawData.financial.debtToEquity) || 0,
                profitGrowth: parseFloat(rawData.financial.profitGrowth) || 0,
                sector: rawData.meta.sector,
                industry: rawData.meta.industry
            });
        }

        let scoreMatrix = { score: 50, rating: "HOLD", stars: "★★★☆☆", confidence: 75 };
        if (window.VIKRAM_SCORE_ENGINE && typeof window.VIKRAM_SCORE_ENGINE.calculateScore === "function") {
            // Normalize constituent metrics to precise 0-100 inputs for multi-factor execution lines
            const rawTechnical = parseFloat(rawData.technical.rsi) ? Math.min(100, Math.max(0, parseFloat(rawData.technical.rsi) * 1.2)) : 65;
            const techInstDampened = dampenCorrelatedFactors(rawTechnical, institutionMatrix.institutionalScore);

            const rawValuationScore = Math.min(100, Math.max(0, 50 + (valuationMatrix.marginOfSafety * 1.2)));
            const fundValDampened = dampenCorrelatedFactors(fundamentalMatrix.score, rawValuationScore);

            scoreMatrix = window.VIKRAM_SCORE_ENGINE.calculateScore({
                technical: techInstDampened.a,
                fundamentals: fundValDampened.a,
                institutional: techInstDampened.b,
                valuation: fundValDampened.b,
                news: newsMatrix.newsScore
            }, {
                institutional: institutionMatrix.dataAvailable !== false
            });
        }

        // Return unified core operational report structure payload mapping back cleanly
        return {
            meta: {
                ...rawData.meta,
                vikramScore: scoreMatrix.score,
                rating: scoreMatrix.rating,
                stars: scoreMatrix.stars,
                confidence: scoreMatrix.confidence,
                activePillarCount: scoreMatrix.activePillarCount,
                totalPillarCount: scoreMatrix.totalPillarCount
            },
            technical: {
                ...rawData.technical
            },
            financial: {
                ...rawData.financial
            },
            valuation: valuationMatrix,
            risk: riskMatrix,
            institutional: institutionMatrix,
            catalysts: newsMatrix,
            fundamental: fundamentalMatrix
        };
    }
};

// Freeze internal structural architecture definitions to preserve code integrity at runtime
Object.freeze(frameworkEngine);

// Register engine configuration component scope into standard window layout environment nodes
window.VIKRAM_FRAMEWORK_ENGINE = frameworkEngine;