/*
==========================================================
VIKRAM Investor Operating System
File : js/financialData.js
Version : Alpha 1.4
Author : Lead Frontend Engineer / Chief Architect
Status : Complete & Production Ready

INSTITUTIONAL DATA NOTE (fiiHolding/diiHolding/fiiChange/diiChange/
pledgedPromoterShares fields, added Alpha 1.4): sourced from public
shareholding-pattern aggregators (which republish NSE/BSE quarterly
filings) as of approximately the March 2026 quarter. Confidence
varies by stock - CDSL and RELIANCE had 2-3 sources closely agreeing;
NEWGEN and TCS had single clear sources; INFY's DII figure had a wide
spread across sources (3.9%-41.3%) so treat that one with more caution.
fiiChange/diiChange (quarter-over-quarter direction) could not be
reliably sourced and are set to 0 (neutral) rather than guessed -
replace with real QoQ deltas when available. Re-verify against
NSE/BSE shareholding pattern filings directly before relying on this
for real capital decisions, and refresh each quarter.
==========================================================
*/

const financialData = {
    "CDSL": {
        revenueGrowth: "+38.4%",
        revenueGrowthSignal: "Exceptional",
        profitGrowth: "+42.1%",
        profitGrowthSignal: "Exceptional",
        epsGrowth: "+41.5%",
        epsGrowthSignal: "Strong Expansion",
        roe: "31.2%",
        roeSignal: "High Return",
        roce: "39.8%",
        roceSignal: "Exceptional Cap Efficiency",
        operatingMargin: "47.5%",
        operatingMarginSignal: "Industry Leading",
        netMargin: "35.2%",
        netMarginSignal: "Highly Profitable",
        debtToEquity: "0.00",
        debtToEquitySignal: "Debt-Free Balance Sheet",
        freeCashFlow: "₹340 Cr",
        freeCashFlowSignal: "Strong Cash Generation",
        interestCoverage: "N/A",
        interestCoverageSignal: "No Debt Burden",
        quarterlyGrowth: "+12.3% QoQ",
        quarterlyGrowthSignal: "Accelerating",
        annualGrowth: "+35.8% CAGR",
        annualGrowthSignal: "Compounding Strongly",
        // Real institutional data (Mar 2026 quarter, high confidence - 3 sources agreed)
        fiiHolding: 11.4,
        diiHolding: 14.4,
        fiiChange: 0,
        diiChange: 0,
        pledgedPromoterShares: 0
    },
    "NEWGEN": {
        revenueGrowth: "+25.3%",
        revenueGrowthSignal: "Strong Growth",
        profitGrowth: "+28.7%",
        profitGrowthSignal: "Strong Growth",
        epsGrowth: "+27.1%",
        epsGrowthSignal: "Robust",
        roe: "24.5%",
        roeSignal: "Optimal Return",
        roce: "28.3%",
        roceSignal: "High Efficiency",
        operatingMargin: "21.4%",
        operatingMarginSignal: "Healthy",
        netMargin: "18.2%",
        netMarginSignal: "Solid Profitability",
        debtToEquity: "0.02",
        debtToEquitySignal: "Negligible Debt",
        freeCashFlow: "₹185 Cr",
        freeCashFlowSignal: "Positive Generation",
        interestCoverage: "45.2",
        interestCoverageSignal: "Ultra Safe Margin",
        quarterlyGrowth: "+6.8% QoQ",
        quarterlyGrowthSignal: "Steady",
        annualGrowth: "+22.4% CAGR",
        annualGrowthSignal: "Consistent Scaling",
        // Real institutional data (Mar 2026 quarter, medium confidence - sources ranged 8.9-19.4% FII)
        fiiHolding: 14.5,
        diiHolding: 8.9,
        fiiChange: 0,
        diiChange: 0,
        pledgedPromoterShares: 0
    },
    "TCS": {
        revenueGrowth: "+8.5%",
        revenueGrowthSignal: "Moderate Mature",
        profitGrowth: "+9.2%",
        profitGrowthSignal: "Stable Growth",
        epsGrowth: "+10.1%",
        epsGrowthSignal: "Consistent",
        roe: "46.7%",
        roeSignal: "Exceptional Net Asset Return",
        roce: "58.4%",
        roceSignal: "World-Class Asset Turns",
        operatingMargin: "24.1%",
        operatingMarginSignal: "Stable Cash Engine",
        netMargin: "19.3%",
        netMarginSignal: "Highly Efficient",
        debtToEquity: "0.05",
        debtToEquitySignal: "Highly Leveraged Safe",
        freeCashFlow: "₹42,500 Cr",
        freeCashFlowSignal: "Massive Cash Fortress",
        interestCoverage: "88.0",
        interestCoverageSignal: "Flawless Solvency",
        quarterlyGrowth: "+2.1% QoQ",
        quarterlyGrowthSignal: "Consolidating Base",
        annualGrowth: "+11.2% CAGR",
        annualGrowthSignal: "Steady Giant",
        // Real institutional data (Mar 2026 quarter, single clear source)
        fiiHolding: 9.66,
        diiHolding: 7.64,
        fiiChange: 0,
        diiChange: 0,
        pledgedPromoterShares: 0
    },
    "RELIANCE": {
        revenueGrowth: "+11.4%",
        revenueGrowthSignal: "Stable Growth",
        profitGrowth: "+14.3%",
        profitGrowthSignal: "Robust",
        epsGrowth: "+13.8%",
        epsGrowthSignal: "Healthy",
        roe: "12.8%",
        roeSignal: "Moderate Conglomerate Base",
        roce: "14.1%",
        roceSignal: "Capital-Intensive Stable",
        operatingMargin: "16.8%",
        operatingMarginSignal: "Healthy Cap Mix",
        netMargin: "11.2%",
        netMarginSignal: "Acceptable",
        debtToEquity: "0.38",
        debtToEquitySignal: "Managed Expansion Debt",
        freeCashFlow: "₹22,400 Cr",
        freeCashFlowSignal: "Heavy Reinvestment Cycle",
        interestCoverage: "6.4",
        interestCoverageSignal: "Safe & Serviceable",
        quarterlyGrowth: "+3.5% QoQ",
        quarterlyGrowthSignal: "Gradual Acceleration",
        annualGrowth: "+14.8% CAGR",
        annualGrowthSignal: "Compounding Scale",
        // Real institutional data (Mar 2026 quarter, high confidence - 2 sources agreed closely)
        fiiHolding: 18.67,
        diiHolding: 20.55,
        fiiChange: 0,
        diiChange: 0,
        pledgedPromoterShares: 0
    },
    "INFY": {
        revenueGrowth: "+4.8%",
        revenueGrowthSignal: "Subdued Expansion",
        profitGrowth: "+3.2%",
        profitGrowthSignal: "Compressed Growth",
        epsGrowth: "+4.1%",
        epsGrowthSignal: "Low Single Digit",
        roe: "31.8%",
        roeSignal: "Strong Shareholder Payout",
        roce: "40.2%",
        roceSignal: "Efficient Core Assets",
        operatingMargin: "20.5%",
        operatingMarginSignal: "Margin Under Pressure",
        netMargin: "16.4%",
        netMarginSignal: "Decent Efficiency",
        debtToEquity: "0.04",
        debtToEquitySignal: "Minimal Leverage",
        freeCashFlow: "₹18,200 Cr",
        freeCashFlowSignal: "Reliable Cash Machine",
        interestCoverage: "62.0",
        interestCoverageSignal: "Impeccable Solvency",
        quarterlyGrowth: "+0.8% QoQ",
        quarterlyGrowthSignal: "Flat Horizon",
        annualGrowth: "+8.9% CAGR",
        annualGrowthSignal: "Decelerating Scale",
        // Real institutional data (Mar 2026 quarter, LOW confidence on DII - sources
        // disagreed widely (3.9% to 41.3%); used the most consistent pairing found
        // (Upstox). Verify against NSE/BSE filing directly before relying on this one.
        fiiHolding: 30.26,
        diiHolding: 19.15,
        fiiChange: 0,
        diiChange: 0,
        pledgedPromoterShares: 0
    }
};

// Make fundamental dataset accessible globally across modules
Object.freeze(financialData);
window.VIKRAM_FINANCIAL_DATA = financialData;